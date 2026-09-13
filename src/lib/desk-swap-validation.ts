import { formatUnits, parseUnits } from 'viem';

/** Preserve wallet precision and reject amounts the token cannot represent. */
export function tokenAmount(value: string, decimals: number): string | null {
  const text = value.trim();
  if (!/^\d+(?:\.\d+)?$/.test(text) || (text.split('.')[1]?.length ?? 0) > decimals) return null;
  try {
    const raw = parseUnits(text, decimals);
    return raw > 0n ? formatUnits(raw, decimals) : null;
  } catch { return null; }
}

export function canPrepareDeskSwap(input: {
  amount: string | null; decimals: number; balance: bigint | null;
  usdValue: number | null; cap: number; hasQuote: boolean;
}): boolean {
  if (!input.hasQuote || !input.amount || input.balance === null || input.usdValue === null
    || !Number.isFinite(input.cap) || input.cap <= 0
    || !Number.isFinite(input.usdValue) || input.usdValue <= 0 || input.usdValue > input.cap) return false;
  const amount = tokenAmount(input.amount, input.decimals);
  return amount !== null && parseUnits(amount, input.decimals) <= input.balance;
}
