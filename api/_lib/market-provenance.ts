/** Preserve provider observation time. Unknown/invalid time stays null, never request time. */
export function providerTime(value: unknown): string | null {
  const ms = typeof value === 'number' || typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN;
  return Number.isFinite(ms) && ms > 0 && ms < 8.64e15 ? new Date(ms).toISOString() : null;
}
