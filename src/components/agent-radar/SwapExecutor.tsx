// ============================================================
// SwapExecutor — Real on-chain swap on Base via Uniswap V3
//
// Flow (every step waits for a MINED, SUCCESSFUL receipt):
//   Connect → sign session → quote → [approve → receipt → re-quote] →
//   simulated swap → receipt → /api/swap-receipt verifies on-chain → done
// The server builds and simulates calldata against pinned Uniswap
// contracts and only hands out the swap once the allowance is in place;
// this component shows it and forwards it. Bobby never signs.
// ============================================================

import { useState, useCallback } from 'react';
import { useAccount, usePublicClient, useSendTransaction, useSwitchChain } from 'wagmi';
import { useAppKit } from '@reown/appkit/react';
import type { Hex } from 'viem';
import { Wallet, ArrowRight, Check, Loader2, AlertCircle, ExternalLink } from 'lucide-react';
import { BASE, BASE_CHAIN_ID } from '@/config/chains';
import { BASE_STOCK_SYMBOLS, BASE_SWAP_LIMITS, BASE_SWAP_SYMBOLS, findBaseToken } from '@/lib/base-swap/tokens';
import { useBobbySession } from '@/hooks/useBobbySession';

const SELL_TOKENS = ['USDC', 'ETH', 'USDT', ...BASE_STOCK_SYMBOLS];
const BUY_TOKENS = BASE_SWAP_SYMBOLS.filter((s) => s !== 'WETH');

type SwapStep = 'idle' | 'quoting' | 'quoted' | 'approving' | 'requoting' | 'swapping' | 'verifying' | 'confirmed' | 'error';

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
  stocks: Array<{ symbol: string; side: 'buy' | 'sell'; referencePrice: number | null; deviationPct: number | null; referenceAgeSec: number | null }>;
  tx: null | { approve: (Tx & { spender: string; amount: string }) | null; swap: Tx | null; revoke: (Tx & { spender: string }) | null; deadline: number };
  allowanceRaw: string | null;
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
  const publicClient = usePublicClient({ chainId: BASE_CHAIN_ID });
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
  const [receiptNote, setReceiptNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const from = findBaseToken(fromToken);
  const to = findBaseToken(toToken);

  const ensureChain = useCallback(async () => {
    if (chain?.id !== BASE_CHAIN_ID) await switchChainAsync({ chainId: BASE_CHAIN_ID });
  }, [chain?.id, switchChainAsync]);

  /** Sends and waits for a successful receipt; a revert is an error, not a success. */
  const sendAndConfirm = useCallback(async (tx: Tx) => {
    if (!publicClient) throw new Error('No Base client');
    await ensureChain();
    const hash = await sendTransactionAsync({ chainId: BASE_CHAIN_ID, to: tx.to as Hex, data: tx.data as Hex, value: BigInt(tx.value || '0') });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== 'success') throw new Error(`Transaction ${hash.slice(0, 10)}… reverted on-chain`);
    return hash;
  }, [publicClient, ensureChain, sendTransactionAsync]);

  const sessionHeaders = useCallback(async () => {
    const stored = session.ready ? session.session : await session.ensureSession();
    if (!stored) throw new Error('Sign the wallet session to request calldata');
    return session.headers();
  }, [session]);

  const fetchQuote = useCallback(async (): Promise<SwapQuoteView> => {
    if (!address || !from || !to) throw new Error('Connect a wallet and pick a pair');
    const headers = await sessionHeaders();
    const res = await fetch('/api/base-swap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ tokenIn: from.symbol, tokenOut: to.symbol, amount: amount.trim(), slippagePct: parseFloat(slippage), wallet: address.toLowerCase() }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to get a Base quote');
    return data.quote as SwapQuoteView;
  }, [address, from, to, amount, slippage, sessionHeaders]);

  const friendly = (err: unknown, fallback: string) => {
    const msg = err instanceof Error ? err.message : fallback;
    return msg.includes('rejected') || msg.includes('denied') ? 'Transaction rejected by user' : msg;
  };

  // ---- Step 1: quote (+ calldata when the guards pass) ----
  const getQuote = useCallback(async () => {
    setStep('quoting'); setError(null); setQuote(null); setAcknowledged(false); setTxHash(undefined); setReceiptNote(null);
    try {
      setQuote(await fetchQuote());
      setStep('quoted');
    } catch (err) {
      setError(friendly(err, 'Quote failed'));
      setStep('error');
    }
  }, [fetchQuote]);

  // ---- Step 2: exact approval → receipt → re-quote (server simulates with the allowance in place) ----
  const approveToken = useCallback(async () => {
    if (!quote?.tx?.approve) return;
    setStep('approving'); setError(null);
    try {
      await sendAndConfirm(quote.tx.approve);
      setStep('requoting');
      const fresh = await fetchQuote();
      setQuote(fresh);
      setAcknowledged(false);
      setStep('quoted');
    } catch (err) {
      setError(friendly(err, 'Approval failed'));
      setStep('error');
    }
  }, [quote, sendAndConfirm, fetchQuote]);

  // ---- Step 3: swap → receipt → verified record ----
  const executeSwap = useCallback(async () => {
    if (!quote?.tx?.swap || !address) return;
    setStep('swapping'); setError(null);
    try {
      const hash = await sendAndConfirm(quote.tx.swap);
      setTxHash(hash);
      setStep('verifying');
      const headers = await sessionHeaders();
      const res = await fetch('/api/swap-receipt', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ txHash: hash, wallet: address.toLowerCase() }) });
      const data = await res.json();
      setReceiptNote(res.ok && data.ok ? `Verified on ${BASE.name} and recorded (${data.receipt?.outcome})` : `Mined, but not recorded: ${data.error || res.status}`);
      setStep('confirmed');
    } catch (err) {
      setError(friendly(err, 'Swap failed'));
      setStep('error');
    }
  }, [quote, address, sendAndConfirm, sessionHeaders]);

  // ---- Revoke a leftover allowance (approve(router, 0)) ----
  const revokeAllowance = useCallback(async () => {
    if (!quote?.tx?.revoke) return;
    setStep('approving'); setError(null);
    try {
      await sendAndConfirm(quote.tx.revoke);
      setStep('requoting');
      setQuote(await fetchQuote());
      setStep('quoted');
    } catch (err) {
      setError(friendly(err, 'Revoke failed'));
      setStep('error');
    }
  }, [quote, sendAndConfirm, fetchQuote]);

  const reset = () => { setStep('idle'); setQuote(null); setAcknowledged(false); setTxHash(undefined); setReceiptNote(null); setError(null); };

  const explorerUrl = txHash ? `${BASE.explorerUrl}/tx/${txHash}` : null;
  const withheld = quote?.txWithheld ?? [];
  const needsApproval = Boolean(quote?.tx?.approve);
  const canSwap = Boolean(quote?.tx?.swap) && quote?.simulation.ok === true && withheld.length === 0;
  const busy = step === 'quoting' || step === 'approving' || step === 'requoting' || step === 'swapping' || step === 'verifying';
  const primary = 'w-full py-3 bg-green-500/15 border border-green-500/30 rounded-xl text-sm font-medium text-green-400 hover:bg-green-500/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
  const secondary = 'w-full py-2 border border-neutral-800 rounded-xl text-xs text-neutral-400 hover:text-neutral-200 transition-colors';

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
        <button onClick={() => openWallet()} className={`${primary} flex items-center justify-center gap-2`}>
          <Wallet className="w-4 h-4" /> Connect Wallet to Swap
        </button>
      )}

      {isConnected && step !== 'confirmed' && (
        <>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-neutral-900/60 border border-neutral-800 rounded-xl p-3">
              <div className="text-[9px] text-neutral-500 mb-1">You pay</div>
              <div className="flex items-center gap-2">
                <input type="number" value={amount} onChange={e => setAmount(e.target.value)} className="flex-1 bg-transparent text-lg font-bold text-neutral-100 outline-none w-0 min-w-0" min="0" step="any" disabled={busy} />
                <select value={fromToken} onChange={e => { setFromToken(e.target.value); reset(); }} className="bg-neutral-800 text-neutral-200 text-sm font-medium rounded-lg px-2 py-1 outline-none border border-neutral-700" disabled={busy}>
                  {SELL_TOKENS.filter(t => t !== toToken).map(t => <option key={t} value={t}>{t}</option>)}
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
                  {quote ? Number(quote.amountOut).toLocaleString(undefined, { maximumFractionDigits: to?.decimals === 8 ? 6 : 4 }) : '—'}
                </span>
                <select value={toToken} onChange={e => { setToToken(e.target.value); reset(); }} className="bg-neutral-800 text-neutral-200 text-sm font-medium rounded-lg px-2 py-1 outline-none border border-neutral-700" disabled={busy}>
                  {BUY_TOKENS.filter(t => t !== fromToken).map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between text-[10px]">
            <span className="text-neutral-500">Slippage tolerance</span>
            <div className="flex gap-1">
              {['0.1', '0.5', '1.0'].map(s => (
                <button key={s} onClick={() => { setSlippage(s); if (step === 'quoted') reset(); }} className={`px-2 py-0.5 rounded-md transition-colors ${slippage === s ? 'bg-green-500/15 text-green-400 border border-green-500/30' : 'text-neutral-500 hover:text-neutral-300 border border-neutral-800'}`}>{s}%</button>
              ))}
            </div>
          </div>

          {quote && (
            <div className="bg-neutral-900/40 border border-green-500/15 rounded-xl p-3 space-y-1.5 text-[10px]">
              <div className="flex justify-between"><span className="text-neutral-500">Rate</span><span className="text-neutral-300">1 {fromToken} = {quote.executionPrice.toLocaleString(undefined, { maximumFractionDigits: to?.decimals === 8 ? 8 : 6 })} {toToken}</span></div>
              <div className="flex justify-between"><span className="text-neutral-500">Route</span><span className="text-neutral-400">{quote.route.description}</span></div>
              <div className="flex justify-between gap-3"><span className="text-neutral-500 shrink-0">Swap contract</span><span className="text-neutral-400 font-mono break-all text-right">{quote.venue.router}</span></div>
              <div className="flex justify-between"><span className="text-neutral-500">Chain</span><span className="text-neutral-400">{BASE.name} ({BASE_CHAIN_ID})</span></div>
              {quote.stocks.map((s) => (
                <div key={s.symbol} className="flex justify-between"><span className="text-neutral-500">{s.symbol} vs Chainlink</span><span className="text-neutral-400">{s.referencePrice ? `$${s.referencePrice.toFixed(2)}` : '—'}{typeof s.deviationPct === 'number' ? ` · ${s.deviationPct >= 0 ? '+' : ''}${s.deviationPct.toFixed(2)}%` : ''}</span></div>
              ))}
              {needsApproval ? (
                <>
                  <div className="flex justify-between gap-3"><span className="text-neutral-500 shrink-0">Approval token</span><span className="text-neutral-400 font-mono break-all text-right">{quote.tx!.approve!.to}</span></div>
                  <div className="flex justify-between gap-3"><span className="text-neutral-500 shrink-0">Approval spender</span><span className="text-neutral-400 font-mono break-all text-right">{quote.tx!.approve!.spender} · exact {quote.amountIn} {fromToken}</span></div>
                  <div className="text-amber-300/80">The swap calldata arrives after the approval mines and the server re-simulates. If you stop after approving, the allowance stays until spent or revoked.</div>
                </>
              ) : (
                <div className="flex justify-between"><span className="text-neutral-500">Approval</span><span className="text-neutral-400">{from?.native ? 'Not required (ETH)' : 'Existing allowance covers this amount'}</span></div>
              )}
              <div className="flex justify-between text-xs"><span className="text-neutral-500">Min received</span><span className="text-neutral-400">{quote.minAmountOut} {toToken}</span></div>
              <div className="flex justify-between"><span className="text-neutral-500">Price impact</span><span className="text-neutral-400">{quote.priceImpactPct === null ? '—' : `${quote.priceImpactPct.toFixed(2)}%`}</span></div>
              <div className="flex justify-between"><span className="text-neutral-500">Simulation</span><span className="text-neutral-400">{quote.simulation.ran ? (quote.simulation.ok ? 'passed (eth_call)' : 'reverted') : 'after approval + re-quote'}</span></div>
              {withheld.length > 0 && <div className="text-amber-400/90 space-y-0.5 pt-1">{withheld.map((w) => <div key={w}>⚠ {w}</div>)}</div>}
              {quote.warnings.length > 0 && <div className="text-neutral-500 space-y-0.5">{quote.warnings.map((w) => <div key={w}>· {w}</div>)}</div>}
              {(needsApproval || canSwap) && step === 'quoted' && (
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
              <div><div className="text-xs text-red-400 font-medium">Error</div><div className="text-[10px] text-red-400/70 mt-0.5">{error}</div></div>
            </div>
          )}

          <div className="space-y-2">
            {(step === 'idle' || step === 'error') && (
              <button onClick={getQuote} disabled={!amount || parseFloat(amount) <= 0} className={primary}>Get Swap Quote</button>
            )}
            {step === 'quoting' && <div className="w-full py-3 flex items-center justify-center gap-2 text-sm text-neutral-400"><Loader2 className="w-4 h-4 animate-spin" /> Quoting on {BASE.name}...</div>}
            {step === 'quoted' && needsApproval && withheld.length === 0 && (
              <button onClick={approveToken} disabled={!acknowledged} className={primary}>Approve {fromToken} (exact) → then re-quote</button>
            )}
            {step === 'quoted' && canSwap && (
              <button onClick={executeSwap} disabled={!acknowledged} className={primary}>Swap {amount} {fromToken} → {toToken}</button>
            )}
            {step === 'quoted' && !needsApproval && !canSwap && (
              <button onClick={reset} className={secondary}>Calldata withheld — adjust and re-quote</button>
            )}
            {step === 'quoted' && quote?.tx?.revoke && (
              <button onClick={revokeAllowance} className={secondary}>Revoke {fromToken} allowance to the router (approve 0)</button>
            )}
            {step === 'approving' && <div className="w-full py-3 flex items-center justify-center gap-2 text-sm text-amber-400"><Loader2 className="w-4 h-4 animate-spin" /> Waiting for the receipt...</div>}
            {step === 'requoting' && <div className="w-full py-3 flex items-center justify-center gap-2 text-sm text-amber-400"><Loader2 className="w-4 h-4 animate-spin" /> Mined. Re-quoting and simulating the swap...</div>}
            {step === 'swapping' && <div className="w-full py-3 flex items-center justify-center gap-2 text-sm text-amber-400"><Loader2 className="w-4 h-4 animate-spin" /> Swapping... waiting for the receipt</div>}
            {step === 'verifying' && <div className="w-full py-3 flex items-center justify-center gap-2 text-sm text-amber-400"><Loader2 className="w-4 h-4 animate-spin" /> Mined. Verifying the receipt on {BASE.name}...</div>}
          </div>
        </>
      )}

      {step === 'confirmed' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-xl p-3">
            <Check className="w-4 h-4 text-green-400" />
            <div>
              <div className="text-xs text-green-400 font-medium">Swap confirmed on {BASE.name}</div>
              {receiptNote && <div className="text-[10px] text-neutral-400 mt-0.5">{receiptNote}</div>}
            </div>
          </div>
          {explorerUrl && (
            <a href={explorerUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-[10px] text-neutral-400 hover:text-neutral-200 transition-colors">
              <ExternalLink className="w-3 h-3" /> View on {BASE.explorerName}
            </a>
          )}
          <button onClick={reset} className={secondary}>New swap</button>
        </div>
      )}
    </div>
  );
}
