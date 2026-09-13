/** Bound the entire request, including reading the body, and cancel obsolete work. */
export async function deskJson<T>(url: string, init: RequestInit = {}, timeoutMs = 20_000): Promise<{ ok: boolean; data: T }> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (init.signal?.aborted) cancel();
  init.signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(cancel, timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const data = await response.json() as T;
    return { ok: response.ok, data };
  } finally {
    clearTimeout(timer);
    init.signal?.removeEventListener('abort', cancel);
  }
}
