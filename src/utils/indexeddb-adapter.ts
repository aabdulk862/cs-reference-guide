/**
 * IndexedDB adapter for key-value persistence.
 *
 * Provides a simple key-value store backed by IndexedDB, used as a fallback
 * when localStorage is unavailable (e.g., iOS Safari private browsing).
 *
 * Database: csguide-storage (version 1)
 * Object store: kv (keyPath: "key")
 * All keys use the csguide: prefix convention.
 *
 * Requirements: 9.3, 9.4
 */

const DB_NAME = 'csguide-storage';
const STORE_NAME = 'kv';
const DB_VERSION = 1;
const KEY_PREFIX = 'csguide:';

export interface KVEntry {
  key: string;   // csguide:prefixed key
  value: string; // JSON-serialized value
}

export interface IIndexedDBAdapter {
  isAvailable(): Promise<boolean>;
  open(): Promise<void>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
  getAll(): Promise<KVEntry[]>;
  close(): void;
}

/**
 * Ensure a key uses the csguide: prefix.
 * If the key already has the prefix, return as-is.
 */
function prefixedKey(key: string): string {
  if (key.startsWith(KEY_PREFIX)) {
    return key;
  }
  return `${KEY_PREFIX}${key}`;
}

class IndexedDBAdapter implements IIndexedDBAdapter {
  private db: IDBDatabase | null = null;

  /**
   * Check if IndexedDB is available in the current environment.
   * Attempts to open and immediately close a test database.
   */
  async isAvailable(): Promise<boolean> {
    try {
      if (typeof indexedDB === 'undefined') {
        return false;
      }
      // Attempt a real open to verify IndexedDB is functional
      const testRequest = indexedDB.open(DB_NAME, DB_VERSION);
      return new Promise<boolean>((resolve) => {
        testRequest.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: 'key' });
          }
        };
        testRequest.onsuccess = () => {
          testRequest.result.close();
          resolve(true);
        };
        testRequest.onerror = () => {
          resolve(false);
        };
        testRequest.onblocked = () => {
          resolve(false);
        };
      });
    } catch {
      return false;
    }
  }

  /**
   * Open the database connection. Creates the object store if needed.
   */
  async open(): Promise<void> {
    if (this.db) {
      return;
    }

    return new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        }
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onerror = () => {
        reject(new Error(`Failed to open IndexedDB: ${request.error?.message}`));
      };

      request.onblocked = () => {
        reject(new Error('IndexedDB open blocked by another connection'));
      };
    });
  }

  /**
   * Get a value by key. Applies csguide: prefix if not already present.
   * Returns null if the key does not exist.
   */
  async get(key: string): Promise<string | null> {
    const db = this.getDB();
    const fullKey = prefixedKey(key);

    return new Promise<string | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(fullKey);

      request.onsuccess = () => {
        const result = request.result as KVEntry | undefined;
        resolve(result ? result.value : null);
      };

      request.onerror = () => {
        reject(new Error(`IndexedDB get failed: ${request.error?.message}`));
      };
    });
  }

  /**
   * Set a key-value pair. Applies csguide: prefix if not already present.
   * Overwrites existing entries with the same key.
   */
  async set(key: string, value: string): Promise<void> {
    const db = this.getDB();
    const fullKey = prefixedKey(key);

    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const entry: KVEntry = { key: fullKey, value };
      const request = store.put(entry);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(new Error(`IndexedDB set failed: ${request.error?.message}`));
      };
    });
  }

  /**
   * Remove a key from the store. Applies csguide: prefix if not already present.
   * No-op if the key does not exist.
   */
  async remove(key: string): Promise<void> {
    const db = this.getDB();
    const fullKey = prefixedKey(key);

    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(fullKey);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(new Error(`IndexedDB remove failed: ${request.error?.message}`));
      };
    });
  }

  /**
   * Get all key-value entries from the store.
   * Returns an array of KVEntry objects.
   */
  async getAll(): Promise<KVEntry[]> {
    const db = this.getDB();

    return new Promise<KVEntry[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        resolve((request.result as KVEntry[]) ?? []);
      };

      request.onerror = () => {
        reject(new Error(`IndexedDB getAll failed: ${request.error?.message}`));
      };
    });
  }

  /**
   * Close the database connection.
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  /**
   * Get the active database connection, throwing if not open.
   */
  private getDB(): IDBDatabase {
    if (!this.db) {
      throw new Error('IndexedDB not open. Call open() first.');
    }
    return this.db;
  }
}

/**
 * Singleton adapter instance for use throughout the application.
 */
export const indexedDBAdapter: IIndexedDBAdapter = new IndexedDBAdapter();

/**
 * Create a new adapter instance (useful for testing).
 */
export function createIndexedDBAdapter(): IIndexedDBAdapter {
  return new IndexedDBAdapter();
}
