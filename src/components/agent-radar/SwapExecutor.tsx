// ============================================================
// SwapExecutor — Real on-chain swap on Base via Uniswap V3
// Flow: Connect Wallet → Sign session → Quote + calldata → Approve (ERC-20) → Swap → Confirm
// The server (/api/base-swap) builds and simulates the calldata against
// pinned Uniswap contracts; this component only shows it and forwards it
// to the wallet. Bobby never signs.
// ============================================================

import { useState, useCallback } from 'react';
import { useAccount, useSendTransaction, useSwitchChain, useWaitForTransactionReceipt } from 'wagmi';
import { useAppKit } from '@reown/appkit/react';
import type { Hex } from 'viem';
import { Wallet, ArrowRight, Check, Loader2, AlertCircle, ExternalLink } from 'lucide-react';
import { BASE, BASE_CHAIN_ID } from '@/config/chains';
import { BASE_SWAP_LIMITS, BASE_SWAP_SYMBOLS, findBaseToken } from '@/lib/base-swap/tokens';
import { useBobbySession } from '@/hooks/useBobbySession';

const SELL_TOKENS = ['USDC', 'ETH', 'USDT'];
const BUY_TOKENS = BASE_SWAP_SYMBOLS.filter((s) => s !== 'WETH');

type SwapStep = 'idle' | 'quoting' | 'quoted' | 'approving' | 'approved' | 'swapping' | 'confirmed' | 'error';

interface Tx { to: string; data: string; value: string }

interface SwapQuoteView {
  amountIn: string;
  amountOut: string;
  minAmountOut: string;
  executionPrice: number;
  priceImpactPct: number | null;
  usdValue: number | null;
  route: { description: string; gasEstimate: string };
  venue: { name: string; router: string };
  tx: null | { approve: (Tx & { spender: string; amount: string }) | null; swap: Tx; deadline: number };
  simulation: { ran: boolean; ok: boolean | null; reason: string | null };
  txWithheld: string[];
  warnings: string[];
}

interface Props {
  defaultFrom?: string;
  defaultTo?: string;
  className?: string;
}

export function SwapExecutor({ defaultFrom = 'USDC', defaultTo = 'ETH', className = '' }: Props) {
  const { address, isConnected, chain } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const [acknowledged, setAcknowledged] = useState(false);
  const { open: openWallet } = useAppKit();
  const { sendTransactionAsync } = useSendTransaction();
  const session = useBobbySession({ auto: false });

  const [fromToken, setFromToken] = useState(findBaseToken(defaultFrom)?.symbol ?? 'USDC');
  const [toToken, setToToken] = useState(findBaseToken(defaultTo)?.symbol ?? 'ETH');
  const [amount, setAmount] = useState('25');
  const [slippage, setSlippage] = useState(String(BASE_SWAP_LIMITS.defaultSlippagePct));

  const [step, setStep] = useState<SwapStep>('idle');
  const [quote, setQuote] = useState<SwapQuoteView | null>(null);
  const [txHash, setTxHash] = useState<Hex | undefined>();
  const [error, setError] = useState<string | null>(null);

  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: txHash });
  if (isConfirmed && step === 'swapping') setStep('confirmed');

  const from = findBaseToken(fromToken);
  const to = findBaseToken(toToken);
  const isNativeFrom = Boolean(from?.native);

  const ensureChain = useCallback(async () => {
    if (chain?.id !== BASE_CHAIN_ID) await switchChainAsync({ chainId: BASE_CHAIN_ID });
  }, [chain?.id, switchChainAsync]);

  // ---- Step 1: quote + calldata (server-built, guarded, simulated) ----
  const getQuote = useCallback(async () => {
    if (!address || !from || !to) return;
    setStep('quoting');
    setError(null);
    setQuote(null);
    setAcknowledged(false);
    setTxHash(undefined);
    try {
      // The API only builds calldata for a wallet that proved ownership.
      const stored = session.ready ? session.session : await session.ensureSession();
      if (!stored) throw new Error('Sign the wallet session to request calldata');
      const res = await fetch('/api/base-swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...session.headers() },
        body: JSON.stringify({
          tokenIn: from.symbol,
          tokenOut: to.symbol,
          amount: amount.trim(),
          slippagePct: parseFloat(slippage),
          wallet: address.toLowerCase(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to get a Base quote');
      setQuote(data.quote as SwapQuoteView);
      setStep('quoted');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Quote failed');
      setStep('error');
    }
  }, [address, from, to, amount, slippage, session]);

  // ---- Step 2: exact approval to the router (skip for ETH or when allowance suffices) ----
  const approveToken = useCallback(async () => {
    if (!quote?.tx) return;
    if (!quote.tx.approve) { setStep('approved'); return; }
    setStep('approving');
    setError(null);
    try {
      await ensureChain();
      await sendTransactionAsync({ chainId: BASE_CHAIN_ID, to: quote.tx.approve.to as Hex, data: quote.tx.approve.data as Hex });
      setStep('approved');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Approval failed';
      setError(msg.includes('rejected') || msg.includes('denied') ? 'Transaction rejected by user' : msg);
      setStep('error');
    }
  }, [quote, sendTransactionAsync, ensureChain]);

  // ---- Step 3: the swap ----
  const executeSwap = useCallback(async () => {
    if (!quote?.tx) return;
    setStep('swapping');
    setError(null);
    try {
      await ensureChain();
      const hash = await sendTransactionAsync({
        chainId: BASE_CHAIN_ID,
        to: quote.tx.swap.to as Hex,
        data: quote.tx.swap.data as Hex,
        value: BigInt(quote.tx.swap.value || '0'),
      });
      setTxHash(hash);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Swap failed';
      setError(msg.includes('rejected') || msg.includes('denied') ? 'Transaction rejected by user' : msg);
      setStep('error');
    }
  }, [quote, sendTransactionAsync, ensureChain]);

  const reset = () => {
    setStep('idle');
    setQuote(null);
    setAcknowledged(false);
    setTxHash(undefined);
    setError(null);
  };

  const explorerUrl = txHash ? `${BASE.explorerUrl}/tx/${txHash}` : null;
  const withheld = quote ? quote.txWithheld : [];
  const canSign = Boolean(quote?.tx) && withheld.length === 0;

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-green-400">REAL SWAP</span>
          <span className="text-[9px] text-neutral-600">Uniswap V3 on {BASE.name}</span>
        </div>
        {isConnected && (
          <span className="text-[9px] text-green-400/60 bg-green-400/10 px-2 py-0.5 rounded-full flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            {address?.slice(0, 6)}...{address?.slice(-4)}
            {chain?.name && <span className="text-neutral-500">· {chain.name}</span>}
          </span>
        )}
      </div>

      {!isConnected && (
        <button
          onClick={() => openWallet()}
          className="w-full py-3 bg-green-500/15 border border-green-500/30 rounded-xl text-sm font-medium text-green-400 hover:bg-green-500/25 transition-colors flex items-center justify-center gap-2"
        >
          <Wallet className="w-4 h-4" />
          Connect Wallet to Swap
        </button>
      )}

      {isConnected && step !== 'confirmed' && (
        <>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-neutral-900/60 border border-neutral-800 rounded-xl p-3">
              <div className="text-[9px] text-neutral-500 mb-1">You pay</div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  className="flex-1 bg-transparent text-lg font-bold text-neutral-100 outline-none w-0 min-w-0"
                  min="0"
                  step="any"
                  disabled={step !== 'idle' && step !== 'error'}
                />
                <select
                  value={fromToken}
                  onChange={e => { setFromToken(e.target.value); reset(); }}
                  className="bg-neutral-800 text-neutral-200 text-sm font-medium rounded-lg px-2 py-1 outline-none border border-neutral-700"
                  disabled={step !== 'idle' && step !== 'error'}
                >
                  {SELL_TOKENS.filter(t => t !== toToken).map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="w-8 h-8 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center shrink-0">
              <ArrowRight className="w-3.5 h-3.5 text-neutral-400" />
            </div>

            <div className="flex-1 bg-neutral-900/60 border border-neutral-800 rounded-xl p-3">
              <div className="text-[9px] text-neutral-500 mb-1">You receive</div>
              <div className="flex items-center gap-2">
                <span className="flex-1 text-lg font-bold text-neutral-100">
                  {quote ? Number(quote.amountOut).toLocaleString(undefined, { maximumFractionDigits: to?.symbol === 'cbBTC' ? 6 : 4 }) : '—'}
                </span>
                <select
                  value={toToken}
                  onChange={e => { setToToken(e.target.value); reset(); }}
                  className="bg-neutral-800 text-neutral-200 text-sm font-medium rounded-lg px-2 py-1 outline-none border border-neutral-700"
                  disabled={step !== 'idle' && step !== 'error'}
                >
                  {BUY_TOKENS.filter(t => t !== fromToken).map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between text-[10px]">
            <span className="text-neutral-500">Slippage tolerance</span>
            <div className="flex gap-1">
              {['0.1', '0.5', '1.0'].map(s => (
                <button
                  key={s}
                  onClick={() => { setSlippage(s); if (step === 'quoted') reset(); }}
                  className={`px-2 py-0.5 rounded-md transition-colors ${
                    slippage === s
                      ? 'bg-green-500/15 text-green-400 border border-green-500/30'
                      : 'text-neutral-500 hover:text-neutral-300 border border-neutral-800'
                  }`}
                >
                  {s}%
                </button>
              ))}
            </div>
          </div>

          {quote && (
            <div className="bg-neutral-900/40 border border-green-500/15 rounded-xl p-3 space-y-1.5">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-neutral-500">Rate</span>
                <span className="text-neutral-300">1 {fromToken} = {quote.executionPrice.toLocaleString(undefined, { maximumFractionDigits: to?.symbol === 'cbBTC' ? 8 : 6 })} {toToken}</span>
              </div>
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-neutral-500">Route</span>
                <span className="text-neutral-400">{quote.route.description}</span>
              </div>
              <div className="flex items-center justify-between gap-3 text-[10px]">
                <span className="text-neutral-500 shrink-0">Swap contract</span>
                <span className="text-neutral-400 font-mono break-all text-right">{quote.venue.router}</span>
              </div>
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-neutral-500">Chain</span>
                <span className="text-neutral-400">{BASE.name} ({BASE_CHAIN_ID})</span>
              </div>
              {quote.tx?.approve ? (
                <>
                  <div className="flex items-center justify-between gap-3 text-[10px]">
                    <span className="text-neutral-500 shrink-0">Approval token</span>
                    <span className="text-neutral-400 font-mono break-all text-right">{quote.tx.approve.to}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 text-[10px]">
                    <span className="text-neutral-500 shrink-0">Approval spender</span>
                    <span className="text-neutral-400 font-mono break-all text-right">{quote.tx.approve.spender} (exact amount)</span>
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-neutral-500">Approval</span>
                  <span className="text-neutral-400">{isNativeFrom ? 'Not required (ETH)' : 'Existing allowance covers this amount'}</span>
                </div>
              )}
              <div className="flex justify-between text-xs">
                <span className="text-neutral-500">Min received</span>
                <span className="text-neutral-400">{quote.minAmountOut} {toToken}</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-neutral-500">Price impact</span>
                <span className="text-neutral-400">{quote.priceImpactPct === null ? '—' : `${quote.priceImpactPct.toFixed(2)}%`}</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-neutral-500">Simulation</span>
                <span className="text-neutral-400">{quote.simulation.ran ? (quote.simulation.ok ? 'passed (eth_call)' : 'reverted') : 'after approval'}</span>
              </div>
              {withheld.length > 0 && (
                <div className="text-[10px] text-amber-400/90 space-y-0.5 pt-1">
                  {withheld.map((w) => <div key={w}>⚠ {w}</div>)}
                </div>
              )}
              {canSign && (
                <label className="flex items-center gap-2 text-[11px] text-neutral-400 cursor-pointer">
                  <input type="checkbox" checked={acknowledged} onChange={(ev) => setAcknowledged(ev.target.checked)} />
                  I checked the contract, the chain and the minimum received.
                </label>
              )}
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl p-3">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div>
                <div className="text-xs text-red-400 font-medium">Error</div>
                <div className="text-[10px] text-red-400/70 mt-0.5">{error}</div>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {(step === 'idle' || step === 'error') && (
              <button
                onClick={getQuote}
                disabled={!amount || parseFloat(amount) <= 0}
                className="w-full py-3 bg-green-500/15 border border-green-500/30 rounded-xl text-sm font-medium text-green-400 hover:bg-green-500/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Get Swap Quote
              </button>
            )}
            {step === 'quoting' && (
              <div className="w-full py-3 flex items-center justify-center gap-2 text-sm text-neutral-400">
                <Loader2 className="w-4 h-4 animate-spin" /> Quoting on {BASE.name}...
              </div>
            )}
            {step === 'quoted' && canSign && (
              <button
                onClick={quote?.tx?.approve ? approveToken : executeSwap}
                disabled={!acknowledged}
                className="w-full py-3 bg-green-500/15 border border-green-500/30 rounded-xl text-sm font-medium text-green-400 hover:bg-green-500/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {quote?.tx?.approve ? `Approve ${fromToken} (exact)` : `Swap ${amount} ${fromToken} → ${toToken}`}
              </button>
            )}
            {step === 'quoted' && !canSign && (
              <button onClick={reset} className="w-full py-3 border border-neutral-800 rounded-xl text-sm text-neutral-400 hover:text-neutral-200 transition-colors">
                Calldata withheld — adjust and re-quote
              </button>
            )}
            {step === 'approving' && (
              <div className="w-full py-3 flex items-center justify-center gap-2 text-sm text-amber-400">
                <Loader2 className="w-4 h-4 animate-spin" /> Approving {fromToken}...
              </div>
            )}
            {step === 'approved' && (
              <button
                onClick={executeSwap}
                className="w-full py-3 bg-green-500/15 border border-green-500/30 rounded-xl text-sm font-medium text-green-400 hover:bg-green-500/25 transition-colors"
              >
                Swap {amount} {fromToken} → {toToken}
              </button>
            )}
            {step === 'swapping' && (
              <div className="w-full py-3 flex items-center justify-center gap-2 text-sm text-amber-400">
                <Loader2 className="w-4 h-4 animate-spin" /> {isConfirming ? 'Confirming on-chain...' : 'Waiting for wallet...'}
              </div>
            )}
          </div>
        </>
      )}

      {step === 'confirmed' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-xl p-3">
            <Check className="w-4 h-4 text-green-400" />
            <div className="text-xs text-green-400 font-medium">Swap confirmed on {BASE.name}</div>
          </div>
          {explorerUrl && (
            <a href={explorerUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-[10px] text-neutral-400 hover:text-neutral-200 transition-colors">
              <ExternalLink className="w-3 h-3" /> View on {BASE.explorerName}
            </a>
          )}
          <button onClick={reset} className="w-full py-2 border border-neutral-800 rounded-xl text-xs text-neutral-400 hover:text-neutral-200 transition-colors">
            New swap
          </button>
        </div>
      )}
    </div>
  );
}
