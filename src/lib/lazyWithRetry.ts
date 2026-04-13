import { lazy, type ComponentType } from 'react';

type LazyModule<T extends ComponentType<any>> = Promise<{ default: T }>;

function isRetryableChunkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);

  return /ChunkLoadError|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(
    message,
  );
}

export function lazyWithRetry<T extends ComponentType<any>>(
  importer: () => LazyModule<T>,
  key: string,
) {
  return lazy(async () => {
    const storageKey = `lazy-retry:${key}`;

    try {
      const module = await importer();
      if (typeof window !== 'undefined') {
        window.sessionStorage.removeItem(storageKey);
      }
      return module;
    } catch (error) {
      if (
        typeof window !== 'undefined' &&
        isRetryableChunkError(error) &&
        !window.sessionStorage.getItem(storageKey)
      ) {
        window.sessionStorage.setItem(storageKey, '1');
        window.location.reload();

        return new Promise<never>(() => {});
      }

      if (typeof window !== 'undefined') {
        window.sessionStorage.removeItem(storageKey);
      }

      throw error;
    }
  });
}
