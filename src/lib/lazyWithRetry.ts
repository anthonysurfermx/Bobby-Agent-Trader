import { lazy, type ComponentType } from 'react';

type LazyModule<T extends ComponentType<any>> = Promise<{ default: T }>;

function clearRetry(key: string) {
  try { window.sessionStorage.removeItem(key); } catch { /* Optional storage. */ }
}

function reserveReload(key: string) {
  try {
    const storage = window.sessionStorage;
    if (storage.getItem(key)) return false;
    storage.setItem(key, '1');
    return true;
  } catch { return false; } // Without the marker we cannot bound a reload loop.
}

function isRetryableChunkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);

  return /ChunkLoadError|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(
    message,
  );
}

function withRetry<T extends ComponentType<any>>(
  importer: () => LazyModule<T>,
  key: string,
) {
  return async () => {
    const storageKey = `lazy-retry:${key}`;

    try {
      const module = await importer();
      clearRetry(storageKey);
      return module;
    } catch (error) {
      if (isRetryableChunkError(error) && reserveReload(storageKey)) {
        window.location.reload();

        return new Promise<never>(() => {});
      }

      clearRetry(storageKey);

      throw error;
    }
  };
}

export function lazyWithRetry<T extends ComponentType<any>>(importer: () => LazyModule<T>, key: string) {
  return lazy(withRetry(importer, key));
}

export function routeWithRetry<T extends ComponentType<any>>(importer: () => LazyModule<T>, key: string) {
  const load = withRetry(importer, key);
  return async () => ({ Component: (await load()).default });
}
