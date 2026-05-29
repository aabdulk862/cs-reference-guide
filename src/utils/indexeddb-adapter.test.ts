/**
 * Unit tests for the IndexedDB adapter module.
 * Uses fake-indexeddb to simulate IndexedDB in the test environment.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { createIndexedDBAdapter, type IIndexedDBAdapter } from './indexeddb-adapter';

describe('IndexedDB adapter', () => {
  let adapter: IIndexedDBAdapter;

  beforeEach(async () => {
    // Delete the database to ensure a clean state between tests
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase('csguide-storage');
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
    adapter = createIndexedDBAdapter();
  });

  afterEach(() => {
    adapter.close();
  });

  describe('isAvailable()', () => {
    it('should return true when IndexedDB is available', async () => {
      const available = await adapter.isAvailable();
      expect(available).toBe(true);
    });
  });

  describe('open()', () => {
    it('should open the database without error', async () => {
      await expect(adapter.open()).resolves.toBeUndefined();
    });

    it('should be idempotent (calling open twice does not throw)', async () => {
      await adapter.open();
      await expect(adapter.open()).resolves.toBeUndefined();
    });
  });

  describe('get()', () => {
    it('should return null for a non-existent key', async () => {
      await adapter.open();
      const result = await adapter.get('nonexistent');
      expect(result).toBeNull();
    });

    it('should throw if database is not open', async () => {
      await expect(adapter.get('key')).rejects.toThrow('IndexedDB not open');
    });
  });

  describe('set() and get()', () => {
    beforeEach(async () => {
      await adapter.open();
    });

    it('should store and retrieve a string value', async () => {
      await adapter.set('test-key', 'hello');
      const result = await adapter.get('test-key');
      expect(result).toBe('hello');
    });

    it('should store and retrieve JSON-serialized objects', async () => {
      const data = JSON.stringify({ name: 'test', count: 42 });
      await adapter.set('obj-key', data);
      const result = await adapter.get('obj-key');
      expect(result).toBe(data);
    });

    it('should overwrite existing values', async () => {
      await adapter.set('overwrite', 'first');
      await adapter.set('overwrite', 'second');
      const result = await adapter.get('overwrite');
      expect(result).toBe('second');
    });

    it('should apply csguide: prefix to keys without it', async () => {
      await adapter.set('bare-key', 'value');
      // Retrieving with the same bare key should work
      const result = await adapter.get('bare-key');
      expect(result).toBe('value');
    });

    it('should not double-prefix keys that already have csguide:', async () => {
      await adapter.set('csguide:already-prefixed', 'value');
      const result = await adapter.get('csguide:already-prefixed');
      expect(result).toBe('value');
    });

    it('should handle empty string values', async () => {
      await adapter.set('empty', '');
      const result = await adapter.get('empty');
      expect(result).toBe('');
    });
  });

  describe('remove()', () => {
    beforeEach(async () => {
      await adapter.open();
    });

    it('should remove an existing key', async () => {
      await adapter.set('to-remove', 'exists');
      await adapter.remove('to-remove');
      const result = await adapter.get('to-remove');
      expect(result).toBeNull();
    });

    it('should not throw when removing a non-existent key', async () => {
      await expect(adapter.remove('nonexistent')).resolves.toBeUndefined();
    });
  });

  describe('getAll()', () => {
    beforeEach(async () => {
      await adapter.open();
    });

    it('should return empty array when store is empty', async () => {
      const entries = await adapter.getAll();
      expect(entries).toEqual([]);
    });

    it('should return all stored entries', async () => {
      await adapter.set('key1', 'value1');
      await adapter.set('key2', 'value2');
      await adapter.set('key3', 'value3');

      const entries = await adapter.getAll();
      expect(entries).toHaveLength(3);

      const keys = entries.map((e) => e.key);
      expect(keys).toContain('csguide:key1');
      expect(keys).toContain('csguide:key2');
      expect(keys).toContain('csguide:key3');
    });

    it('should return entries with correct values', async () => {
      await adapter.set('data', '{"count":42}');
      const entries = await adapter.getAll();
      const entry = entries.find((e) => e.key === 'csguide:data');
      expect(entry?.value).toBe('{"count":42}');
    });
  });

  describe('close()', () => {
    it('should close without error', async () => {
      await adapter.open();
      expect(() => adapter.close()).not.toThrow();
    });

    it('should be safe to call close without opening', () => {
      expect(() => adapter.close()).not.toThrow();
    });
  });

  describe('namespace prefix convention', () => {
    beforeEach(async () => {
      await adapter.open();
    });

    it('should store all keys with csguide: prefix in the database', async () => {
      await adapter.set('my-key', 'my-value');
      const entries = await adapter.getAll();
      for (const entry of entries) {
        expect(entry.key.startsWith('csguide:')).toBe(true);
      }
    });

    it('should consistently retrieve values regardless of prefix in input', async () => {
      // Set with bare key
      await adapter.set('shared-key', 'value-a');
      // Get with prefixed key
      const result = await adapter.get('csguide:shared-key');
      expect(result).toBe('value-a');
    });
  });
});
