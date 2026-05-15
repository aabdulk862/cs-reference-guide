/**
 * Unit tests for the localStorage persistence utility.
 * Tests cover: typed get/set/remove, namespace prefixing, try/catch error handling,
 * schema version checking, migration support, and in-memory fallback.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  get,
  set,
  remove,
  registerMigration,
  runMigrations,
  getSchemaVersion,
  getCurrentSchemaVersion,
  initStorage,
  isUsingFallback,
  setFallbackWarningHandler,
  _resetForTesting,
} from './storage';

describe('storage utility', () => {
  beforeEach(() => {
    localStorage.clear();
    _resetForTesting();
  });

  describe('get/set/remove with namespaced keys', () => {
    it('should store and retrieve a string value', () => {
      set('test-key', 'hello');
      expect(get('test-key', '')).toBe('hello');
    });

    it('should store and retrieve an object value', () => {
      const data = { name: 'test', count: 42, nested: { a: true } };
      set('obj-key', data);
      expect(get('obj-key', {})).toEqual(data);
    });

    it('should store and retrieve an array value', () => {
      const arr = [1, 2, 3, 'four'];
      set('arr-key', arr);
      expect(get('arr-key', [])).toEqual(arr);
    });

    it('should return defaultValue when key does not exist', () => {
      expect(get('nonexistent', 'default')).toBe('default');
      expect(get('nonexistent', 42)).toBe(42);
      expect(get('nonexistent', null)).toBe(null);
    });

    it('should use csguide: namespace prefix in localStorage', () => {
      set('mykey', 'value');
      expect(localStorage.getItem('csguide:mykey')).toBe('"value"');
    });

    it('should remove a key from storage', () => {
      set('to-remove', 'exists');
      expect(get('to-remove', '')).toBe('exists');
      remove('to-remove');
      expect(get('to-remove', 'gone')).toBe('gone');
    });

    it('should handle boolean values', () => {
      set('flag', true);
      expect(get('flag', false)).toBe(true);
    });

    it('should handle null values', () => {
      set('nullable', null);
      expect(get('nullable', 'not-null')).toBe(null);
    });
  });

  describe('corrupted data handling', () => {
    it('should return defaultValue and reset key when JSON is corrupted', () => {
      // Manually write invalid JSON to localStorage
      localStorage.setItem('csguide:corrupted', 'not-valid-json{{{');
      const result = get('corrupted', { fallback: true });
      expect(result).toEqual({ fallback: true });
      // Should have reset the key to the default
      expect(JSON.parse(localStorage.getItem('csguide:corrupted')!)).toEqual({ fallback: true });
    });
  });

  describe('schema version and migrations', () => {
    it('should return 0 when no version is stored', () => {
      expect(getSchemaVersion()).toBe(0);
    });

    it('should set version on initStorage first run', () => {
      initStorage();
      expect(getSchemaVersion()).toBe(getCurrentSchemaVersion());
    });

    it('should run migrations from stored version to current', () => {
      // Simulate an old version
      localStorage.setItem('csguide:version', '0');
      
      const migrationFn = vi.fn();
      registerMigration(1, migrationFn);
      
      const result = runMigrations();
      expect(result).toBe(true);
      expect(migrationFn).toHaveBeenCalledWith(0);
      expect(getSchemaVersion()).toBe(getCurrentSchemaVersion());
    });

    it('should not run migrations when already at current version', () => {
      localStorage.setItem('csguide:version', JSON.stringify(getCurrentSchemaVersion()));
      
      const migrationFn = vi.fn();
      registerMigration(getCurrentSchemaVersion() + 1, migrationFn);
      
      const result = runMigrations();
      expect(result).toBe(false);
      expect(migrationFn).not.toHaveBeenCalled();
    });

    it('should handle migration failures gracefully', () => {
      localStorage.setItem('csguide:version', '0');
      
      registerMigration(1, () => {
        throw new Error('Migration failed!');
      });
      
      // Should not throw
      const result = runMigrations();
      expect(result).toBe(true);
      // Version should still be updated
      expect(getSchemaVersion()).toBe(getCurrentSchemaVersion());
    });

    it('should allow migrations to transform data', () => {
      localStorage.setItem('csguide:version', '0');
      set('progress', { oldFormat: true });
      
      registerMigration(1, () => {
        const old = get('progress', {});
        set('progress', { ...old, newField: 'added', migrated: true });
      });
      
      runMigrations();
      expect(get('progress', {})).toEqual({ oldFormat: true, newField: 'added', migrated: true });
    });
  });

  describe('in-memory fallback', () => {
    it('should not be using fallback initially', () => {
      expect(isUsingFallback()).toBe(false);
    });

    it('should fall back to memory when localStorage is unavailable', () => {
      // Mock localStorage to throw on all operations
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('Storage disabled', 'SecurityError');
      });
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new DOMException('Storage disabled', 'SecurityError');
      });
      vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
        throw new DOMException('Storage disabled', 'SecurityError');
      });

      // Reset to trigger fallback detection
      _resetForTesting();
      initStorage();
      
      expect(isUsingFallback()).toBe(true);
      
      // Should still work with in-memory store
      set('memory-key', 'memory-value');
      expect(get('memory-key', '')).toBe('memory-value');
      
      remove('memory-key');
      expect(get('memory-key', 'default')).toBe('default');

      // Restore
      vi.restoreAllMocks();
    });

    it('should fall back to memory when localStorage is full (QuotaExceededError)', () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('Quota exceeded', 'QuotaExceededError');
      });

      _resetForTesting();
      
      // This should trigger fallback
      set('big-data', 'some value');
      expect(isUsingFallback()).toBe(true);
      
      // Should still be able to read from memory
      expect(get('big-data', '')).toBe('some value');

      vi.restoreAllMocks();
    });

    it('should invoke fallback warning handler when fallback is activated', () => {
      const handler = vi.fn();
      setFallbackWarningHandler(handler);

      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('Quota exceeded', 'QuotaExceededError');
      });

      set('trigger', 'fallback');
      expect(handler).toHaveBeenCalledTimes(1);

      // Should only fire once
      set('another', 'value');
      expect(handler).toHaveBeenCalledTimes(1);

      vi.restoreAllMocks();
    });
  });
});
