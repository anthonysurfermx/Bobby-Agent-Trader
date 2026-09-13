/** Keep inexpensive assets visible instead of rounding a real price to zero. */
export function deskPrice(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '—';
  if (value >= 1000) return `$${Math.round(value).toLocaleString('en-US')}`;
  if (value >= 1) return `$${value.toFixed(2)}`;
  return `$${value.toLocaleString('en-US', { maximumSignificantDigits: 4 })}`;
}
