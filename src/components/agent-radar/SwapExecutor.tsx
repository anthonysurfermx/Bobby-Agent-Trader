// Base + Uniswap V3 tokenized-stock execution.
// Server builds calldata; the wallet signs. An ERC-20 approval is never
// treated as a swap: after its receipt we re-quote and re-simulate first.

import { useState, useCallback, useEffect } from 'react';
import { useAccount, useSendTransaction, useSwitchChain, useWaitForTransactionReceipt } from 'wagmi';
import { useAppKit } from '@reown/appkit/react';
import type { Hex } from 'viem';
import { Wallet, ArrowRight, Check, Loader2, AlertCircle, ExternalLink } from 'lucide-react';
import { BASE, BASE_CHAIN_ID } from '@/config/chains';
import { BASE_STOCK_SYMBOLS, BASE_SWAP_LIMITS, findBaseToken } from '@/lib/base-swap/tokens';
import { useBobbySession } from '@/hooks/useBobbySession';

const FROM_TOKENS = ['USDC', ...BASE_STOCK_SYMBOLS];
type SwapStep = 'idle' | 'quoting' | 'quoted' | 'approving' | 'requote' | 'swapping' | 'confirmed' | 'error';
interface Tx { to: string; data: string; value: string }

interface SwapQuoteView {
  amountIn: string;
  amountInRaw: string;
  amountOut: string;
  minAmountOut: string;
  minAmountOutRaw: string;
  executionPrice: number;
  priceImpactPct: number | null;
  route: { description: string };
  venue: { name: string; router: string };
  tx: null | { approve: (Tx & { spender: string; amount: string }) | null; swap: Tx; deadline: number };
  simulation: { ran: boolean; ok: boolean | null; reason: string | null };
  txWithheld: string[];
  warnings: string[];
  stockReference: null | { usdPrice: number; updatedAt: number; ageSec: number; multiplierHuman: number; marketDeviationPct: number };
}

interface Props { defaultFrom?: string; defaultTo?: string; className?: string }

export function SwapExecutor({ defaultFrom = 'USDC', defaultTo = 'NVDAc', className = '' }: Props) {
  const { address, isConnected, chain } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { open: openWallet } = useAppKit();
  const { sendTransactionAsync } = useSendTransaction();
  const session = useBobbySession({ auto: false });
  const [fromToken, setFromToken] = useState(findBaseToken(defaultFrom)?.symbol ?? 'USDC');
  const [toToken, setToToken] = useState(findBaseToken(defaultTo)?.symbol ?? 'NVDAc');
  const [amount, setAmount] = useState('25');
  const [slippage, setSlippage] = useState(String(BASE_SWAP_LIMITS.defaultSlippagePct));
  const [acknowledged, setAcknowledged] = useState(false);
  const [step, setStep] = useState<SwapStep>('idle');
  const [quote, setQuote] = useState<SwapQuoteView | null>(null);
  const [approveHash, setApproveHash] = useState<Hex>();
  const [swapHash, setSwapHash] = useState<Hex>();
  const [error, setError] = useState<string | null>(null);
  const [syncWarning, setSyncWarning] = useState<string | null>(null);
  const { data: approvalReceipt, isLoading: approvalPending } = useWaitForTransactionReceipt({ hash: approveHash });
  const { data: swapReceipt, isLoading: swapPending } = useWaitForTransactionReceipt({ hash: swapHash });
  const from = findBaseToken(fromToken);
  const to = findBaseToken(toToken);

  const ensureChain = useCallback(async () => {
    if (chain?.id !== BASE_CHAIN_ID) await switchChainAsync({ chainId: BASE_CHAIN_ID });
  }, [chain?.id, switchChainAsync]);

  const reset = useCallback(() => {
    setStep('idle');
    setQuote(null);
    setApproveHash(undefined);
    setSwapHash(undefined);
    setError(null);
  }, []);

  const requestQuote = useCallback(async (afterApproval = false) => {
    if (!address || !from || !to) return;
    setStep(afterApproval ? 'requote' : 'quoting');
    setError(null);
    setQuote(null);
    try {
      const stored = session.ready ? session.session : await session.ensureSession();
      if (!stored) throw new Error('Sign the wallet session to request transaction data');
      const res = await fetch('/api/base-swap', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...session.headers() },
        body: JSON.stringify({ tokenIn: from.symbol, tokenOut: to.symbol, amount: amount.trim(), slippagePct: parseFloat(slippage), wallet: address.toLowerCase(), stockEligibilityConfirmed: acknowledged }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to get a Base quote');
      setQuote(data.quote as SwapQuoteView);
      setStep('quoted');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Quote failed');
      setStep('error');
    }
  }, [address, from, to, amount, slippage, acknowledged, session]);

  useEffect(() => {
    if (!approvalReceipt || step !== 'approving') return;
    if (approvalReceipt.status !== 'success') {
      setError('The approval reverted on Base. No swap was sent.');
      setStep('error');
      return;
    }
    void requestQuote(true);
  }, [approvalReceipt, step, requestQuote]);

  useEffect(() => {
    if (!swapReceipt || step !== 'swapping') return;
    if (swapReceipt.status !== 'success') {
      setError('The swap reverted on Base. The exact approval may still remain.');
      setStep('error');
      return;
    }
    if (!address || !swapHash || !quote) return;
    void fetch('/api/swap-receipt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...session.headers() },
      body: JSON.stringify({ wallet: address.toLowerCase(), txHash: swapHash, tokenIn: fromToken, tokenOut: toToken, amountInRaw: quote.amountInRaw, minAmountOutRaw: quote.minAmountOutRaw }),
    }).then(async (response) => {
      if (!response.ok) throw new Error((await response.json().catch(() => null))?.error || 'history sync failed');
    }).catch((reason) => setSyncWarning(reason instanceof Error ? reason.message : 'History sync failed'));
    setStep('confirmed');
  }, [swapReceipt, step, address, swapHash, quote, fromToken, toToken, session]);

  const approveToken = useCallback(async () => {
    if (!quote?.tx?.approve) return;
    setStep('approving');
    setError(null);
    setSyncWarning(null);
    try {
      await ensureChain();
      setApproveHash(await sendTransactionAsync({ chainId: BASE_CHAIN_ID, to: quote.tx.approve.to as Hex, data: quote.tx.approve.data as Hex }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Approval failed';
      setError(msg.includes('rejected') || msg.includes('denied') ? 'Transaction rejected by user' : msg);
      setStep('error');
    }
  }, [quote, sendTransactionAsync, ensureChain]);

  const executeSwap = useCallback(async () => {
    if (!quote?.tx || quote.tx.approve || !quote.simulation.ran || quote.simulation.ok !== true) return;
    if (quote.tx.deadline <= Math.floor(Date.now() / 1000) + 15) {
      setError('Quote expired. Get a fresh quote before signing.'); setStep('error'); return;
    }
    setStep('swapping');
    setError(null);
    try {
      await ensureChain();
      setSwapHash(await sendTransactionAsync({ chainId: BASE_CHAIN_ID, to: quote.tx.swap.to as Hex, data: quote.tx.swap.data as Hex, value: BigInt(quote.tx.swap.value || '0') }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Swap failed';
      setError(msg.includes('rejected') || msg.includes('denied') ? 'Transaction rejected by user' : msg);
      setStep('error');
    }
  }, [quote, sendTransactionAsync, ensureChain]);

  const changeFrom = (next: string) => { setFromToken(next); setToToken(next === 'USDC' ? 'NVDAc' : 'USDC'); setAcknowledged(false); reset(); };
  const changeTo = (next: string) => { setToToken(next); setAcknowledged(false); reset(); };
  const canSign = Boolean(quote?.tx) && quote?.txWithheld.length === 0;
  const explorerUrl = swapHash ? `${BASE.explorerUrl}/tx/${swapHash}` : null;

  return <div className={`space-y-3 ${className}`}>
    <div className="flex items-center justify-between">
      <div><div className="text-[10px] font-bold text-green-400">TOKENIZED STOCKS · BASE</div><div className="text-[9px] text-neutral-600">Coinbase B20 markets routed directly through Uniswap V3</div></div>
      {isConnected && <span className="text-[9px] text-green-400/60 bg-green-400/10 px-2 py-0.5 rounded-full">{address?.slice(0, 6)}...{address?.slice(-4)}</span>}
    </div>
    {!isConnected ? <button onClick={() => openWallet()} className="w-full py-3 bg-green-500/15 border border-green-500/30 rounded-xl text-sm text-green-400 flex items-center justify-center gap-2"><Wallet className="w-4 h-4" />Connect Wallet</button> : step !== 'confirmed' ? <>
      <div className="flex items-center gap-2">
        <div className="flex-1 bg-neutral-900/60 border border-neutral-800 rounded-xl p-3"><div className="text-[9px] text-neutral-500 mb-1">You pay</div><div className="flex gap-2"><input type="number" value={amount} onChange={(e) => { setAmount(e.target.value); reset(); }} min="0" step="any" className="flex-1 min-w-0 bg-transparent text-lg font-bold text-neutral-100 outline-none" /><select value={fromToken} onChange={(e) => changeFrom(e.target.value)} className="bg-neutral-800 text-neutral-200 text-sm rounded-lg px-2 border border-neutral-700">{FROM_TOKENS.map((s) => <option key={s}>{s}</option>)}</select></div></div>
        <ArrowRight className="w-4 h-4 text-neutral-500 shrink-0" />
        <div className="flex-1 bg-neutral-900/60 border border-neutral-800 rounded-xl p-3"><div className="text-[9px] text-neutral-500 mb-1">You receive</div><div className="flex gap-2"><span className="flex-1 text-lg font-bold text-neutral-100">{quote ? Number(quote.amountOut).toLocaleString(undefined, { maximumFractionDigits: 6 }) : '—'}</span><select value={toToken} onChange={(e) => changeTo(e.target.value)} className="bg-neutral-800 text-neutral-200 text-sm rounded-lg px-2 border border-neutral-700">{(fromToken === 'USDC' ? BASE_STOCK_SYMBOLS : ['USDC']).map((s) => <option key={s}>{s}</option>)}</select></div></div>
      </div>
      <div className="flex items-center justify-between text-[10px]"><span className="text-neutral-500">Slippage</span><div className="flex gap-1">{['0.1', '0.5', '1.0'].map((s) => <button key={s} onClick={() => { setSlippage(s); reset(); }} className={`px-2 py-0.5 rounded-md border ${slippage === s ? 'bg-green-500/15 text-green-400 border-green-500/30' : 'text-neutral-500 border-neutral-800'}`}>{s}%</button>)}</div></div>
      <label className="flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-[10px] text-neutral-300 cursor-pointer"><input type="checkbox" checked={acknowledged} onChange={(e) => { setAcknowledged(e.target.checked); reset(); }} className="mt-0.5" /><span>I am in an eligible jurisdiction outside the U.S. I understand this is a Coinbase B20 tokenized equity, not the underlying share, and I will review the contract, route and minimum before signing.</span></label>
      {quote && <div className="bg-neutral-900/40 border border-green-500/15 rounded-xl p-3 space-y-1.5 text-[10px]">
        <div className="flex justify-between"><span className="text-neutral-500">Route</span><span className="text-neutral-300">{quote.route.description}</span></div><div className="flex justify-between gap-3"><span className="text-neutral-500">Router</span><span className="font-mono text-neutral-400 break-all text-right">{quote.venue.router}</span></div><div className="flex justify-between"><span className="text-neutral-500">Minimum</span><span className="text-neutral-300">{quote.minAmountOut} {toToken}</span></div><div className="flex justify-between"><span className="text-neutral-500">Pool impact</span><span className="text-neutral-300">{quote.priceImpactPct === null ? '—' : `${quote.priceImpactPct.toFixed(2)}%`}</span></div>
        {quote.stockReference && <><div className="flex justify-between"><span className="text-neutral-500">Official reference</span><span className="text-neutral-300">${quote.stockReference.usdPrice.toFixed(2)} · Δ {quote.stockReference.marketDeviationPct.toFixed(2)}%</span></div><div className="flex justify-between"><span className="text-neutral-500">B20 multiplier</span><span className="text-neutral-300">{quote.stockReference.multiplierHuman.toFixed(6)}×</span></div></>}
        <div className="flex justify-between"><span className="text-neutral-500">Simulation</span><span className="text-neutral-300">{quote.simulation.ran ? (quote.simulation.ok ? 'passed' : 'reverted') : 'runs after approval'}</span></div>
        {quote.tx?.approve && <div className="text-amber-300/80">Exact approval to {quote.tx.approve.spender}. It can remain if you stop or the swap reverts.</div>}{quote.warnings.map((w) => <div key={w} className="text-amber-300">⚠ {w}</div>)}{quote.txWithheld.map((w) => <div key={w} className="text-red-300">Blocked: {w}</div>)}
      </div>}
      {error && <div className="flex gap-2 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-[10px] text-red-400"><AlertCircle className="w-4 h-4 shrink-0" />{error}</div>}
      {(step === 'idle' || step === 'error') && <button onClick={() => void requestQuote(false)} disabled={!acknowledged || !amount || Number(amount) <= 0} className="w-full py-3 bg-green-500/15 border border-green-500/30 rounded-xl text-sm text-green-400 disabled:opacity-40">Review quote</button>}
      {(step === 'quoting' || step === 'requote') && <div className="py-3 flex justify-center gap-2 text-sm text-neutral-400"><Loader2 className="w-4 h-4 animate-spin" />{step === 'requote' ? 'Approval confirmed. Re-quoting and simulating…' : 'Checking Uniswap and B20 reference…'}</div>}
      {step === 'quoted' && canSign && quote?.tx?.approve && <button onClick={approveToken} className="w-full py-3 bg-green-500/15 border border-green-500/30 rounded-xl text-sm text-green-400">Approve {fromToken} exactly</button>}
      {step === 'quoted' && canSign && quote?.tx && !quote.tx.approve && quote.simulation.ok && <button onClick={executeSwap} className="w-full py-3 bg-green-500/15 border border-green-500/30 rounded-xl text-sm text-green-400">Swap {amount} {fromToken} → {toToken}</button>}
      {step === 'quoted' && !canSign && <button onClick={reset} className="w-full py-3 border border-neutral-800 rounded-xl text-sm text-neutral-400">Adjust and re-quote</button>}
      {step === 'approving' && <div className="py-3 flex justify-center gap-2 text-sm text-amber-400"><Loader2 className="w-4 h-4 animate-spin" />{approvalPending ? 'Confirming approval on Base…' : 'Waiting for wallet…'}</div>}
      {step === 'swapping' && <div className="py-3 flex justify-center gap-2 text-sm text-amber-400"><Loader2 className="w-4 h-4 animate-spin" />{swapPending ? 'Confirming swap on Base…' : 'Waiting for wallet…'}</div>}
    </> : <div className="space-y-3"><div className="flex items-center gap-2 rounded-xl border border-green-500/20 bg-green-500/10 p-3 text-xs text-green-400"><Check className="w-4 h-4" />Swap confirmed on Base</div>{syncWarning && <div className="text-[10px] text-amber-300">Confirmed on-chain; history sync will retry later: {syncWarning}</div>}{explorerUrl && <a href={explorerUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-[10px] text-neutral-400"><ExternalLink className="w-3 h-3" />View on {BASE.explorerName}</a>}<button onClick={() => { setAcknowledged(false); reset(); }} className="w-full py-2 border border-neutral-800 rounded-xl text-xs text-neutral-400">New swap</button></div>}
  </div>;
}
