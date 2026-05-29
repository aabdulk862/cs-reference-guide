/**
 * Persistence utility for the CS Reference Guide.
 *
 * Features:
 * - Namespaced keys (csguide:*) to avoid collisions
 * - Typed get/set/remove with JSON serialization
 * - try/catch wrapping for all operations — never throws to caller
 * - Schema version checking and migration support
 * - Three-tier fallback: localStorage → IndexedDB → in-memory Map
 * - Sync-first approach: reads from memory cache, async writes to IndexedDB
 *
 * Requirements: 9.1, 9.2, 9.5, 9.6
 */

import { indexedDBAdapter } from './indexeddb-adapter';

const NAMESPACE = 'csguide:';
const VERSION_KEY = `${NAMESPACE}version`;

/** Current schema version — increment when storage shape changes */
const CURRENT_SCHEMA_VERSION = 1;

/** Migration function type: receives old version, returns void (mutates storage in place) */
export type MigrationFn = (fromVersion: number) => void;

/** Registry of migration functions keyed by target version */
const migrations: Map<number, MigrationFn> = new Map();

/** In-memory store used as read cache (for IndexedDB backend) or final fallback */
const memoryStore: Map<string, string> = new Map();

/** The active storage backend */
export type StorageBackend = 'localStorage' | 'indexeddb' | 'memory';

/** Which backend is currently active */
let activeBackend: StorageBackend = 'localStorage';

/** Warning callback for when fallback is activated */
let onFallbackActivated: (() => void) | null = null;

/**
 * Check if localStorage is available and functional.
 */
function isLocalStorageAvailable(): boolean {
  try {
    const testKey = `${NAMESPACE}__test__`;
    localStorage.setItem(testKey, 'test');
    localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

/**
 * Activate a fallback backend and notify listeners.
 */
function activateFallback(backend: StorageBackend): void {
  const wasPrimary = activeBackend === 'localStorage';
  activeBackend = backend;
  if (wasPrimary && onFallbackActivated) {
    onFallbackActivated();
  }
}

/**
 * Get the full namespaced key.
 */
function namespacedKey(key: string): string {
  return `${NAMESPACE}${key}`;
}

/**
 * Read a raw string value from storage.
 * - localStorage: reads directly
 * - indexeddb: reads from hydrated memory cache (sync)
 * - memory: reads from memory store
 */
function rawGet(fullKey: string): string | null {
  if (activeBackend === 'memory' || activeBackend === 'indexeddb') {
    return memoryStore.get(fullKey) ?? null;
  }
  // localStorage backend
  try {
    return localStorage.getItem(fullKey);
  } catch {
    // localStorage failed at runtime — degrade
    activateFallback('memory');
    return memoryStore.get(fullKey) ?? null;
  }
}

/**
 * Write a raw string value to storage.
 * - localStorage: writes directly
 * - indexeddb: writes to memory cache + async fire-and-forget to IndexedDB
 * - memory: writes to memory store only
 */
function rawSet(fullKey: string, value: string): void {
  if (activeBackend === 'memory') {
    memoryStore.set(fullKey, value);
    return;
  }

  if (activeBackend === 'indexeddb') {
    memoryStore.set(fullKey, value);
    // Fire-and-forget async write to IndexedDB
    try {
      indexedDBAdapter.set(fullKey, value).catch(() => {
        // Silent failure — memory cache is authoritative
      });
    } catch {
      // If even calling .set() throws synchronously, ignore
    }
    return;
  }

  // localStorage backend
  try {
    localStorage.setItem(fullKey, value);
  } catch (e) {
    // QuotaExceededError or other localStorage failure
    // Copy existing localStorage data to memory store for continuity
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(NAMESPACE)) {
          memoryStore.set(k, localStorage.getItem(k) ?? '');
        }
      }
    } catch {
      // If we can't even read, just proceed with what we have
    }
    memoryStore.set(fullKey, value);
    activateFallback('memory');
    // Re-throw context for debugging but don't crash
    if (e instanceof DOMException && e.name === 'QuotaExceededError') {
      // Storage full — fallback activated silently
    }
  }
}

/**
 * Remove a raw key from storage.
 * - localStorage: removes directly
 * - indexeddb: removes from memory cache + async fire-and-forget to IndexedDB
 * - memory: removes from memory store
 */
function rawRemove(fullKey: string): void {
  if (activeBackend === 'memory') {
    memoryStore.delete(fullKey);
    return;
  }

  if (activeBackend === 'indexeddb') {
    memoryStore.delete(fullKey);
    // Fire-and-forget async remove from IndexedDB
    try {
      indexedDBAdapter.remove(fullKey).catch(() => {
        // Silent failure — memory cache is authoritative
      });
    } catch {
      // If even calling .remove() throws synchronously, ignore
    }
    return;
  }

  // localStorage backend
  try {
    localStorage.removeItem(fullKey);
  } catch {
    activateFallback('memory');
    memoryStore.delete(fullKey);
  }
}

/**
 * Get a typed value from storage. Returns defaultValue if key doesn't exist
 * or if JSON parsing fails (resets corrupted key to default).
 */
export function get<T>(key: string, defaultValue: T): T {
  try {
    const fullKey = namespacedKey(key);
    const raw = rawGet(fullKey);

    if (raw === null) {
      return defaultValue;
    }

    try {
      return JSON.parse(raw) as T;
    } catch {
      // Corrupted data — reset to default
      rawSet(fullKey, JSON.stringify(defaultValue));
      return defaultValue;
    }
  } catch {
    return defaultValue;
  }
}

/**
 * Set a typed value in storage. Serializes to JSON.
 */
export function set<T>(key: string, value: T): void {
  try {
    const fullKey = namespacedKey(key);
    const serialized = JSON.stringify(value);
    rawSet(fullKey, serialized);
  } catch {
    // Never throw to caller
  }
}

/**
 * Remove a key from storage.
 */
export function remove(key: string): void {
  try {
    const fullKey = namespacedKey(key);
    rawRemove(fullKey);
  } catch {
    // Never throw to caller
  }
}

/**
 * Register a migration function for a specific target version.
 * Migrations run sequentially from the stored version to CURRENT_SCHEMA_VERSION.
 *
 * Example:
 *   registerMigration(2, (fromVersion) => {
 *     // Transform data from version 1 to version 2
 *     const oldProgress = get('progress', {});
 *     // ... transform ...
 *     set('progress', newProgress);
 *   });
 */
export function registerMigration(targetVersion: number, fn: MigrationFn): void {
  migrations.set(targetVersion, fn);
}

/**
 * Check the stored schema version and run any pending migrations.
 * Should be called once on app initialization.
 *
 * Returns true if migrations were run, false if already up to date.
 */
export function runMigrations(): boolean {
  const storedVersion = getSchemaVersion();

  if (storedVersion >= CURRENT_SCHEMA_VERSION) {
    return false;
  }

  // Run migrations sequentially from storedVersion+1 to CURRENT_SCHEMA_VERSION
  for (let v = storedVersion + 1; v <= CURRENT_SCHEMA_VERSION; v++) {
    const migrationFn = migrations.get(v);
    if (migrationFn) {
      try {
        migrationFn(v - 1);
      } catch {
        // Migration failed — log but continue to avoid blocking the app
        console.warn(`Migration to version ${v} failed. Continuing with current state.`);
      }
    }
  }

  // Update stored version
  setSchemaVersion(CURRENT_SCHEMA_VERSION);
  return true;
}

/**
 * Get the currently stored schema version.
 */
export function getSchemaVersion(): number {
  const raw = rawGet(VERSION_KEY);
  if (raw === null) {
    return 0;
  }
  try {
    const version = JSON.parse(raw);
    return typeof version === 'number' ? version : 0;
  } catch {
    return 0;
  }
}

/**
 * Set the schema version in storage.
 */
function setSchemaVersion(version: number): void {
  rawSet(VERSION_KEY, JSON.stringify(version));
}

/**
 * Set a callback to be invoked when a fallback backend is activated.
 * Useful for displaying a warning to the user.
 */
export function setFallbackWarningHandler(handler: () => void): void {
  onFallbackActivated = handler;
}

/**
 * Check whether the storage is currently using a fallback backend
 * (i.e., not localStorage).
 */
export function isUsingFallback(): boolean {
  return activeBackend !== 'localStorage';
}

/**
 * Get the currently active storage backend.
 */
export function getActiveBackend(): StorageBackend {
  return activeBackend;
}

/**
 * Get the current schema version constant (for testing/reference).
 */
export function getCurrentSchemaVersion(): number {
  return CURRENT_SCHEMA_VERSION;
}

/**
 * Initialize the storage system. Should be called once on app startup.
 * Probes backends in order: localStorage → IndexedDB → memory.
 *
 * When IndexedDB is the active backend, hydrates the in-memory cache
 * from all stored entries so that subsequent get() calls are synchronous.
 */
export async function initStorage(): Promise<void> {
  try {
    if (isLocalStorageAvailable()) {
      activeBackend = 'localStorage';
    } else {
      // Try IndexedDB
      let indexedDBAvailable = false;
      try {
        indexedDBAvailable = await indexedDBAdapter.isAvailable();
      } catch {
        indexedDBAvailable = false;
      }

      if (indexedDBAvailable) {
        activeBackend = 'indexeddb';
        // Open the database connection
        try {
          await indexedDBAdapter.open();
          // Hydrate memory cache from IndexedDB
          const allEntries = await indexedDBAdapter.getAll();
          for (const { key, value } of allEntries) {
            memoryStore.set(key, value);
          }
        } catch {
          // IndexedDB open/read failed — fall back to memory
          activeBackend = 'memory';
        }
      } else {
        activeBackend = 'memory';
      }
    }
  } catch {
    // Any unexpected error — fall back to memory
    activeBackend = 'memory';
  }

  // Notify if using fallback
  if (activeBackend !== 'localStorage' && onFallbackActivated) {
    onFallbackActivated();
  }

  // Run migrations
  const storedVersion = getSchemaVersion();
  if (storedVersion === 0) {
    // First run — set initial version
    setSchemaVersion(CURRENT_SCHEMA_VERSION);
  } else {
    runMigrations();
  }
}

/**
 * Reset the storage module state. Primarily for testing purposes.
 */
export function _resetForTesting(): void {
  activeBackend = 'localStorage';
  onFallbackActivated = null;
  memoryStore.clear();
  migrations.clear();
}
