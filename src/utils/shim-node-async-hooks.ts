/**
 * Shim for node:async_hooks on Cloudflare Workers / Edge.
 * Workers do not provide node:async_hooks; better-auth (and deps) import it and fail at runtime.
 * This module is aliased in Vite so "node:async_hooks" resolves here and gets bundled.
 *
 * Minimal AsyncLocalStorage: one store per "current" execution context. In Workers each request
 * runs in isolation, so a single currentStore is safe per request.
 */
let currentStore: unknown = undefined;

class AsyncLocalStorageShim {
  run(store: unknown, callback: (...args: unknown[]) => unknown, ...args: unknown[]): unknown {
    const prev = currentStore;
    currentStore = store;
    try {
      return callback(...args);
    } finally {
      currentStore = prev;
    }
  }

  getStore(): unknown {
    return currentStore;
  }

  exit(callback: (...args: unknown[]) => unknown, ...args: unknown[]): unknown {
    const prev = currentStore;
    currentStore = undefined;
    try {
      return callback(...args);
    } finally {
      currentStore = prev;
    }
  }

  static bind<T extends (...args: unknown[]) => unknown>(fn: T): T {
    const store = currentStore;
    return ((...args: unknown[]) => {
      const prev = currentStore;
      currentStore = store;
      try {
        return fn(...args);
      } finally {
        currentStore = prev;
      }
    }) as T;
  }

  static snapshot(): <T>(fn: () => T) => T {
    const store = currentStore;
    return (fn) => {
      const prev = currentStore;
      currentStore = store;
      try {
        return fn();
      } finally {
        currentStore = prev;
      }
    };
  }
}

class AsyncResourceShim {
  runInAsyncScope<T>(fn: (...args: unknown[]) => T, ...args: unknown[]): T {
    return fn(...args);
  }
  bind<T extends (...args: unknown[]) => unknown>(fn: T): T {
    return fn;
  }
}

export const AsyncLocalStorage = AsyncLocalStorageShim;
export const AsyncResource = AsyncResourceShim;
