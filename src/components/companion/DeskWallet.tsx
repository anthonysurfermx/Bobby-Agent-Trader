// Wallet balances on Base for the desk: native ETH (gas) and the allow-listed
// ERC-20s the swap card trades. Read-only, refreshed on a slow poll, never a
// signature. Nothing renders until a wallet is connected.
import { useMemo } from 'react';
import { erc20Abi, formatUnits } from 'viem';
import { useAccount, useBalance, useReadContracts } from 'wagmi';
import { Wallet } from 'lucide-react';
import { BASE_CHAIN_ID } from '@/config/chains';
import { findBaseToken, type BaseSwapToken } from '@/lib/base-swap/tokens';
import { t } from '@/lib/companions/i18n';

const REFRESH_MS = 30_000;

export interface TokenBalance { token: BaseSwapToken; raw: bigint; units: number; text: string }

/** Enough digits to be useful, never scientific notation: 12,345 · 12.40 · 0.004436 */
function formatUnitsText(units: number, token: BaseSwapToken): string {
  if (!Number.isFinite(units)) return '—';
  if (units >= 1000) return units.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (units >= 1) return units.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (units === 0) return '0';
  return units.toLocaleString('en-US', { maximumFractionDigits: token.decimals >= 8 ? 6 : 4 });
}

/**
 * Balances of `symbols` (allow-list symbols or aliases such as BTC → cbBTC)
 * plus native ETH, for the connected wallet on Base. Pass a memoised array.
 */
export function useBaseBalances(symbols: readonly string[]) {
  const { address, isConnected } = useAccount();
  const tokens = useMemo(() => {
    const seen = new Set<string>();
    const out: BaseSwapToken[] = [];
    for (const symbol of symbols) {
      const token = findBaseToken(symbol);
      if (token && !token.native && !seen.has(token.symbol)) { seen.add(token.symbol); out.push(token); }
    }
    return out;
  }, [symbols]);
  const eth = useBalance({ address, chainId: BASE_CHAIN_ID, query: { enabled: Boolean(address), refetchInterval: REFRESH_MS } });
  const contracts = useMemo(
    () => (address ? tokens.map((token) => ({ address: token.address, abi: erc20Abi, functionName: 'balanceOf', args: [address], chainId: BASE_CHAIN_ID } as const)) : []),
    [address, tokens],
  );
  const reads = useReadContracts({ contracts, query: { enabled: Boolean(address) && contracts.length > 0, refetchInterval: REFRESH_MS } });
  const balances = useMemo<Record<string, TokenBalance>>(() => {
    const out: Record<string, TokenBalance> = {};
    tokens.forEach((token, index) => {
      const read = reads.data?.[index];
      if (!read || read.status !== 'success') return;
      const raw = read.result as bigint;
      const units = Number(formatUnits(raw, token.decimals));
      out[token.symbol] = { token, raw, units, text: formatUnitsText(units, token) };
    });
    const native = findBaseToken('ETH');
    if (native && eth.data) {
      const raw = eth.data.value;
      const units = Number(formatUnits(raw, native.decimals));
      out.ETH = { token: native, raw, units, text: formatUnitsText(units, native) };
    }
    return out;
  }, [tokens, reads.data, eth.data]);
  const ethUnits = eth.data ? Number(formatUnits(eth.data.value, 18)) : null;
  return { address, isConnected, balances, ethUnits, loading: eth.isLoading || reads.isLoading };
}

const PILL_SYMBOLS: readonly string[] = ['USDC'];

/** The header pill: USDC to trade with and ETH for gas, once a wallet is connected. Tapping it opens the swap sheet. */
export function WalletBalancePill({ onClick }: { onClick?: () => void }) {
  const { isConnected, balances, ethUnits, loading } = useBaseBalances(PILL_SYMBOLS);
  if (!isConnected) return null;
  const usdc = balances.USDC;
  const eth = ethUnits === null ? null : ethUnits >= 0.001 ? ethUnits.toFixed(3) : ethUnits === 0 ? '0' : ethUnits.toFixed(5);
  return (
    <button
      type="button"
      onClick={onClick}
      title={t('Your balance on Base · opens the swap sheet', 'Tu saldo en Base · abre el swap')}
      className="flex h-10 shrink-0 items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 font-mono text-[10px] tracking-[0.12em] text-white/80 transition hover:bg-white/[0.08]"
    >
      <Wallet size={13} className="text-sky-300" />
      <span>{usdc ? usdc.text : loading ? '…' : '—'} USDC</span>
      {eth !== null && <span className="hidden text-white/40 sm:inline">· {eth} ETH</span>}
    </button>
  );
}
