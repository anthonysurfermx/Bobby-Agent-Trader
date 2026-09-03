// Final audit P1-1: a swap card must never sign calldata built for an amount
// other than the one the user is looking at. The quote carries the amount it
// was built for (`amountIn`); the input carries what the user typed. They are
// compared numerically because the server may normalise ("25" vs "25.0").

/** True when the typed amount is the exact amount the quote's calldata was built for. */
export function quoteMatchesAmount(quoteAmountIn: string | number | null | undefined, typedAmount: string | number | null | undefined): boolean {
  if (quoteAmountIn === null || quoteAmountIn === undefined) return false;
  if (typedAmount === null || typedAmount === undefined) return false;
  const a = Number(String(quoteAmountIn).trim());
  const b = Number(String(typedAmount).trim());
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return false;
  return a === b;
}
