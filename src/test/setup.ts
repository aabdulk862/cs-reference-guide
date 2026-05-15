import '@testing-library/jest-dom'

/**
 * localStorage/sessionStorage mock for jsdom test environment.
 * 
 * jsdom in some Node.js versions does not provide a working localStorage.
 * This setup ensures a proper Storage implementation is available globally,
 * and that vi.spyOn(Storage.prototype, ...) works correctly in tests.
 */

class StorageMock implements Storage {
  private _store: Map<string, string> = new Map();

  get length(): number {
    return this._store.size;
  }

  clear(): void {
    this._store.clear();
  }

  getItem(key: string): string | null {
    return this._store.get(key) ?? null;
  }

  key(index: number): string | null {
    const keys = Array.from(this._store.keys());
    return keys[index] ?? null;
  }

  removeItem(key: string): void {
    this._store.delete(key);
  }

  setItem(key: string, value: string): void {
    this._store.set(key, String(value));
  }

  [name: string]: unknown;
}

// Expose Storage class globally so vi.spyOn(Storage.prototype, ...) works
Object.defineProperty(globalThis, 'Storage', {
  value: StorageMock,
  writable: true,
  configurable: true,
});

Object.defineProperty(globalThis, 'localStorage', {
  value: new StorageMock(),
  writable: true,
  configurable: true,
});

Object.defineProperty(globalThis, 'sessionStorage', {
  value: new StorageMock(),
  writable: true,
  configurable: true,
});

// Mock window.matchMedia for jsdom (not provided by default)
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  configurable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// Ensure clean state between tests
beforeEach(() => {
  localStorage.clear();
});
