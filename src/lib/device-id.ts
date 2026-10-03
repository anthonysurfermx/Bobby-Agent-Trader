const KEY = 'bobby:device:v1';
let fallback: string | null = null;
/** Same random installation key for access and reports, including a storage-denied page load. */
export function browserDeviceId(): string {
  try {
    const have = localStorage.getItem(KEY);
    if (have && /^[A-Za-z0-9-]{16,64}$/.test(have)) return have;
    const id = fallback ??= crypto.randomUUID();
    localStorage.setItem(KEY, id);
    return id;
  } catch { return fallback ??= crypto.randomUUID(); }
}
