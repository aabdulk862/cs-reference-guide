/**
 * localStorage persistence utility for the CS Reference Guide.
 * 
 * Features:
 * - Namespaced keys (csguide:*) to avoid collisions
 * - Typed get/set/remove with JSON serialization
 * - try/catch wrapping for all localStorage operations
 * - Schema version checking and migration support
 * - Graceful fallback to in-memory Map when localStorage is unavailable or full
 * 
 * Requirements: 5.8, 6.5, 6.6, 9.6
 */

const NAMESPACE = 'csguide:';
const VERSION_KEY = `${NAMESPACE}version`;

/** Current schema version — increment when storage shape changes */
const CURRENT_SCHEMA_VERSION = 1;

/** Migration function type: receives old version, returns void (mutates storage in place) */
export type MigrationFn = (fromVersion: number) => void;

/** Registry of migration functions keyed by target version */
const migrations: Map<number, MigrationFn> = new Map();

/** In-memory fallback store used when localStorage is unavailable or full */
const memoryStore: Map<string, string> = new Map();

/** Whether we're using the in-memory fallback */
let usingFallback = false;

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
 * Activate the in-memory fallback and notify listeners.
 */
function activateFallback(): void {
  if (!usingFallback) {
    usingFallback = true;
    if (onFallbackActivated) {
      onFallbackActivated();
    }
  }
}

/**
 * Get the full namespaced key.
 */
function namespacedKey(key: string): string {
  return `${NAMESPACE}${key}`;
}

/**
 * Read a raw string value from storage (localStorage or fallback).
 */
function rawGet(fullKey: string): string | null {
  if (usingFallback) {
    return memoryStore.get(fullKey) ?? null;
  }
  try {
    return localStorage.getItem(fullKey);
  } catch {
    activateFallback();
    return memoryStore.get(fullKey) ?? null;
  }
}

/**
 * Write a raw string value to storage (localStorage or fallback).
 */
function rawSet(fullKey: string, value: string): void {
  if (usingFallback) {
    memoryStore.set(fullKey, value);
    return;
  }
  try {
    localStorage.setItem(fullKey, value);
  } catch (e) {
    // QuotaExceededError or other localStorage failure
    activateFallback();
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
    // Re-throw context for debugging but don't crash
    if (e instanceof DOMException && e.name === 'QuotaExceededError') {
      // Storage full — fallback activated silently
    }
  }
}

/**
 * Remove a raw key from storage (localStorage or fallback).
 */
function rawRemove(fullKey: string): void {
  if (usingFallback) {
    memoryStore.delete(fullKey);
    return;
  }
  try {
    localStorage.removeItem(fullKey);
  } catch {
    activateFallback();
    memoryStore.delete(fullKey);
  }
}

/**
 * Get a typed value from storage. Returns defaultValue if key doesn't exist
 * or if JSON parsing fails (resets corrupted key to default).
 */
export function get<T>(key: string, defaultValue: T): T {
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
}

/**
 * Set a typed value in storage. Serializes to JSON.
 */
export function set<T>(key: string, value: T): void {
  const fullKey = namespacedKey(key);
  const serialized = JSON.stringify(value);
  rawSet(fullKey, serialized);
}

/**
 * Remove a key from storage.
 */
export function remove(key: string): void {
  const fullKey = namespacedKey(key);
  rawRemove(fullKey);
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
 * Set a callback to be invoked when the in-memory fallback is activated.
 * Useful for displaying a warning to the user.
 */
export function setFallbackWarningHandler(handler: () => void): void {
  onFallbackActivated = handler;
}

/**
 * Check whether the storage is currently using the in-memory fallback.
 */
export function isUsingFallback(): boolean {
  return usingFallback;
}

/**
 * Get the current schema version constant (for testing/reference).
 */
export function getCurrentSchemaVersion(): number {
  return CURRENT_SCHEMA_VERSION;
}

/**
 * Initialize the storage system. Should be called once on app startup.
 * - Checks localStorage availability
 * - Runs pending migrations
 * - Sets schema version if first run
 */
export function initStorage(): void {
  if (!isLocalStorageAvailable()) {
    activateFallback();
  }

  const storedVersion = getSchemaVersion();
  if (storedVersion === 0 && !usingFallback) {
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
  usingFallback = false;
  onFallbackActivated = null;
  memoryStore.clear();
  migrations.clear();
}
