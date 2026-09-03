// ============================================================
// SwapConfirm — Inline trade execution card in chat (Base · Uniswap V3 ·
// Coinbase B20 tokenized stocks)
//
// State machine (every transition waits for a MINED, SUCCESSFUL receipt):
//   idle → approving → requoting → ready → swapping → verifying → confirmed
//                                             ↘ error (retry)
// The server hands out swap calldata only once it simulated with the
// allowance in place, so after an approval this card re-quotes through
// /api/base-swap (session-bound) instead of reusing the old payload. After
// the swap mines, /api/swap-receipt verifies it on-chain and records it;
// nothing is written from the client's word.
// ============================================================

import { useState } from 'react';
import { useAccount, usePublicClient, useSendTransaction, useSwitchChain } from 'wagmi';
import { CheckCircle, XCircle, Loader2, ExternalLink } from 'lucide-react';
import { BASE, BASE_CHAIN_ID } from '@/config/chains';
import { useBobbySession } from '@/hooks/useBobbySession';

interface Tx { to: string; data: string; value?: string }

interface StockReference {
  symbol: string;
  usdPrice: number;
  ageSec: number;
  multiplierHuman: number;
  marketDeviationPct: number;
  pausedFeatures: string;
  transferPaused: boolean;
}

export interface TradeIntent {
  tokenIn: 'USDC';
  tokenOut: string;
  amount: string;
  cycleId: string;
  wallet: string;
  expiresAt: number;
  intentToken: string;
  preview: {
    amountOut: string;
    minAmountOut: string;
    executionPrice: number;
    priceImpactPct: number | null;
    route: { description: string };
    venue: { name: string; router: string };
    stockReference: StockReference | null;
    warnings: string[];
    limits: { maxTicketUsd: number };
  };
}

export interface TradeExecution {
  tokenSymbol: string;
  amountUsd: number;
  confidence: number;
  sizingMethod: string;
  /** Always Base (8453); kept on the row for the record. */
  chain: string;
  /** The cycle's recommendation, quote-only. Calldata exists only after the human attests. */
  intent?: TradeIntent;
  execution?: {
    needsApproval: boolean;
    approveTx?: Tx;
    /** Absent while an approval is pending; filled by the re-quote. */
    swapTx?: Tx;
    calldataHash?: string;
    /** approve(router, 0) when an allowance exists. */
    revokeTx?: Tx;
    quote: { fromToken: string; toToken: string; fromAmount: string; fromAmountRaw?: string; toAmount: string; minReceived?: string; minReceivedRaw?: string };
    disclosure?: {
      venue?: string;
      router?: string;
      tokenContract?: string | null;
      spender?: string | null;
      minReceived?: string | null;
      route?: string;
      priceImpactPct?: number | null;
      deadline?: number;
      simulated?: boolean;
      stockReference?: StockReference | null;
      note?: string;
    };
  };
}

type SwapState = 'intent' | 'building' | 'idle' | 'approving' | 'requoting' | 'ready' | 'swapping' | 'verifying' | 'confirmed' | 'unrecorded' | 'skipped' | 'error';

export function SwapConfirm({ trade, walletAddress }: { trade: TradeExecution; walletAddress?: string }) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [state, setState] = useState<SwapState>(trade.execution ? (trade.execution.swapTx ? 'ready' : 'idle') : 'intent');
  const [execution, setExecution] = useState(trade.execution);
  const [errorMsg, setErrorMsg] = useState('');
  const [swapTxHash, setSwapTxHash] = useState<`0x${string}` | undefined>();
  const [receiptNote, setReceiptNote] = useState<string | null>(null);

  const { sendTransactionAsync } = useSendTransaction();
  const publicClient = usePublicClient({ chainId: BASE_CHAIN_ID });
  const { chainId: connectedChainId, address } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const session = useBobbySession({ auto: false });
  const wallet = (walletAddress || address || '').toLowerCase();

  const disclosure = execution?.disclosure;
  const stock = disclosure?.stockReference ?? trade.intent?.preview.stockReference ?? null;
  const fromToken = execution?.quote.fromToken ?? trade.intent?.tokenIn ?? 'USDC';
  const toToken = execution?.quote.toToken ?? trade.intent?.tokenOut ?? trade.tokenSymbol;
  const fromAmount = execution?.quote.fromAmount ?? trade.intent?.amount ?? trade.amountUsd.toFixed(2);

  /** Where a fresh server answer lands: approval first, or straight to the swap. */
  const stateFor = (exec: NonNullable<TradeExecution['execution']>): SwapState => (exec.swapTx ? 'ready' : 'idle');

  const ensureChain = async () => {
    if (connectedChainId !== BASE_CHAIN_ID) await switchChainAsync({ chainId: BASE_CHAIN_ID });
  };

  /** Sends a tx and waits until it is mined with status success. */
  const sendAndConfirm = async (tx: Tx) => {
    if (!publicClient) throw new Error('No Base client');
    await ensureChain();
    const hash = await sendTransactionAsync({
      chainId: BASE_CHAIN_ID,
      to: tx.to as `0x${string}`,
      data: tx.data as `0x${string}`,
      value: tx.value ? BigInt(tx.value) : undefined,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== 'success') throw new Error(`Transaction ${hash.slice(0, 10)}… reverted on-chain`);
    return hash;
  };

  const sessionHeaders = async () => {
    const stored = session.ready ? session.session : await session.ensureSession();
    if (!stored) throw new Error('Sign the wallet session to continue');
    return session.headers();
  };

  /**
   * Asks the server to build (or rebuild) the transaction for this wallet.
   * The attestation the human just gave travels with the request; the cycle
   * id ties the receipt to the recommendation. Returns what the server built:
   * an approval step, or simulated swap calldata.
   */
  const build = async (): Promise<NonNullable<TradeExecution['execution']>> => {
    const headers = await sessionHeaders();
    const res = await fetch('/api/base-swap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({
        tokenIn: fromToken,
        tokenOut: toToken,
        amount: fromAmount,
        wallet,
        stockEligibilityConfirmed: acknowledged,
        ...(trade.intent ? { cycleId: trade.intent.cycleId, intentToken: trade.intent.intentToken, intentExpiresAt: trade.intent.expiresAt } : {}),
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || 'Build failed');
    if (!data.execution) {
      const why = (data.quote?.txWithheld as string[] | undefined)?.join('; ') || 'calldata withheld';
      throw new Error(why);
    }
    setExecution(data.execution);
    return data.execution;
  };

  const handleBuild = async () => {
    try {
      setState('building');
      const exec = await build();
      setState(stateFor(exec));
    } catch (err) {
      setState('error');
      setErrorMsg(err instanceof Error ? err.message : 'Build failed');
    }
  };

  const notExpired = () => {
    if (disclosure?.deadline && disclosure.deadline <= Math.floor(Date.now() / 1000) + 15) throw new Error('Quote expired. Re-quote before signing.');
  };

  const handleApprove = async () => {
    try {
      if (!execution?.approveTx) throw new Error('No approval to sign; build first');
      notExpired();
      setState('approving');
      await sendAndConfirm(execution.approveTx);
      setState('requoting');
      const exec = await build();
      if (!exec.swapTx || exec.disclosure?.simulated !== true) throw new Error('Swap is not ready after the approval; re-quote');
      setState('ready');
    } catch (err) {
      setState('error');
      setErrorMsg(err instanceof Error ? err.message : 'Approval failed');
    }
  };

  /**
   * Posts the hash to /api/swap-receipt. 202 = not indexed yet: retry with
   * backoff. 200 = verified and recorded. Anything else = the chain says one
   * thing and the record another; that is shown, never painted green.
   */
  const submitReceipt = async (hash: `0x${string}`) => {
    const headers = await sessionHeaders();
    for (let attempt = 0; attempt < 6; attempt++) {
      const res = await fetch('/api/swap-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ txHash: hash, wallet, platform: 'web' }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 202) { await new Promise((r) => setTimeout(r, 2000 * (attempt + 1))); continue; }
      if (res.ok && data.ok) { setReceiptNote(`Verified on-chain and recorded (${data.receipt?.outcome})`); setState('confirmed'); return; }
      setReceiptNote(`Mined on ${BASE.name}, but NOT recorded (${res.status}): ${data.error || 'unknown'}`);
      setState('unrecorded');
      return;
    }
    setReceiptNote('Mined, but the receipt is still indexing. Retry in a moment.');
    setState('unrecorded');
  };

  const handleSwap = async () => {
    try {
      if (!execution?.swapTx) throw new Error('No swap calldata; re-quote first');
      if (disclosure?.simulated !== true) throw new Error('Swap has not passed the post-approval simulation');
      notExpired();
      setState('swapping');
      const hash = await sendAndConfirm(execution.swapTx);
      setSwapTxHash(hash);
      setState('verifying');
      await submitReceipt(hash);
    } catch (err) {
      setState('error');
      setErrorMsg(err instanceof Error ? err.message : 'Swap failed');
    }
  };

  const handleRevoke = async () => {
    try {
      if (!execution?.revokeTx) return;
      setState('approving');
      await sendAndConfirm(execution.revokeTx);
      setState('requoting');
      // After a revoke the next build needs an approval again: land on 'idle', not 'ready'.
      const exec = await build();
      setState(stateFor(exec));
    } catch (err) {
      setState('error');
      setErrorMsg(err instanceof Error ? err.message : 'Revoke failed');
    }
  };

  if (state === 'skipped') return null;

  const minReceived = execution?.quote.minReceived ?? disclosure?.minReceived ?? trade.intent?.preview.minAmountOut ?? '—';
  const deadlineLeftMin = disclosure?.deadline ? Math.max(0, Math.round((disclosure.deadline * 1000 - Date.now()) / 60000)) : null;
  const canSign = acknowledged && (state === 'idle' || state === 'ready');
  const canBuild = acknowledged && state === 'intent';
  const button = 'flex-1 py-1.5 px-3 bg-green-500/20 border border-green-500/30 text-green-400 hover:bg-green-500/30 transition-colors rounded disabled:opacity-40';
  const skip = 'py-1.5 px-3 border border-white/10 text-white/30 hover:text-white/60 transition-colors rounded';

  return (
    <div className="border border-green-500/20 bg-green-500/[0.03] rounded-lg p-3 font-mono text-[11px]">
      <div className="text-green-400/60 mb-2">Bobby recommends:</div>

      <div className="space-y-1 mb-3">
        <div className="text-green-300">BUY {toToken} for ${trade.amountUsd.toFixed(2)}{trade.intent ? ` · ≈ ${Number(trade.intent.preview.amountOut).toLocaleString(undefined, { maximumFractionDigits: 6 })} ${toToken}` : ''}</div>
        <div className="text-green-400/50">via {disclosure?.venue ?? 'Uniswap V3'} on {BASE.name}{stock ? ' · Coinbase Tokenized Stock (B20)' : ''}</div>
        <div className="mt-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-2 font-mono text-[10px] text-white/70 space-y-1">
          <div>CHAIN · {BASE.name} ({BASE_CHAIN_ID})</div>
          <div>SWAP CONTRACT · {disclosure?.router ?? execution?.swapTx?.to ?? trade.intent?.preview.venue.router ?? '—'}</div>
          {(disclosure?.route ?? trade.intent?.preview.route.description) && <div>ROUTE · {disclosure?.route ?? trade.intent?.preview.route.description}</div>}
          {execution?.approveTx && state !== 'ready' && (
            <>
              <div>APPROVE TOKEN · {disclosure?.tokenContract ?? execution.approveTx.to}</div>
              <div>APPROVE SPENDER · {disclosure?.spender ?? '—'} · exact {fromAmount} {fromToken}</div>
              <div className="text-amber-300/80">If you approve and do not complete the swap, or the swap reverts, that allowance stays until spent or revoked.</div>
            </>
          )}
          <div>MIN RECEIVED · {minReceived} {toToken}</div>
          {typeof (disclosure?.priceImpactPct ?? trade.intent?.preview.priceImpactPct) === 'number' && <div>PRICE IMPACT · {(disclosure?.priceImpactPct ?? trade.intent!.preview.priceImpactPct)!.toFixed(2)}%</div>}
          {stock && (
            <>
              <div>B20 REFERENCE · ${stock.usdPrice.toFixed(2)} · Uniswap {stock.marketDeviationPct.toFixed(2)}% away · feed {Math.round(stock.ageSec / 3600)}h old</div>
              <div>B20 MULTIPLIER · {stock.multiplierHuman}× {stock.transferPaused ? '· TRANSFERS PAUSED' : stock.pausedFeatures !== '0' ? '· issuer paused mint/redeem' : ''}</div>
            </>
          )}
          {deadlineLeftMin !== null && <div>VALID FOR · {deadlineLeftMin} min</div>}
          <div>SIMULATED · {execution?.swapTx ? (disclosure?.simulated ? 'yes (eth_call passed)' : 'no') : execution ? 'after approval + re-quote' : 'after you attest and the server builds'}</div>
          {(state === 'intent' || state === 'idle' || state === 'ready') && (
            <label className="flex items-center gap-2 pt-1 cursor-pointer">
              <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} />
              <span>
                {stock
                  ? 'I am in an eligible jurisdiction outside the U.S. I understand this B20 token is not the underlying share, and I checked the contract and the minimum. Bobby never signs for me.'
                  : 'I checked the contract and the minimum received. Bobby never signs for me.'}
              </span>
            </label>
          )}
        </div>
        <div className="text-green-400/50">Confidence: {trade.confidence}% ({trade.sizingMethod})</div>
      </div>

      {state === 'intent' && (
        <div className="flex gap-2">
          <button disabled={!canBuild} onClick={handleBuild} className={button}>Build transaction for my wallet</button>
          <button onClick={() => setState('skipped')} className={skip}>Skip</button>
        </div>
      )}
      {state === 'building' && <div className="flex items-center gap-2 text-amber-400"><Loader2 className="w-3 h-3 animate-spin" />Building and simulating for your wallet…</div>}
      {state === 'idle' && execution && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <button disabled={!canSign} onClick={handleApprove} className={button}>Approve {fromToken} (exact)</button>
            <button onClick={() => setState('skipped')} className={skip}>Skip</button>
          </div>
          {execution.revokeTx && <button onClick={handleRevoke} className="w-full py-1 text-white/40 hover:text-white/70 border border-white/10 rounded">Revoke existing {fromToken} allowance (approve 0)</button>}
        </div>
      )}
      {state === 'approving' && <div className="flex items-center gap-2 text-amber-400"><Loader2 className="w-3 h-3 animate-spin" />Approving {fromToken}… waiting for the receipt</div>}
      {state === 'requoting' && <div className="flex items-center gap-2 text-amber-400"><Loader2 className="w-3 h-3 animate-spin" />Approval mined. Re-quoting and simulating the swap…</div>}
      {state === 'ready' && execution && (
        <div className="space-y-2">
          {!execution.approveTx && execution.swapTx && (
            <div className="flex items-center gap-2 text-green-400"><CheckCircle className="w-3 h-3" />Approval confirmed · quote refreshed and simulation passed</div>
          )}
          <div className="flex gap-2">
            <button disabled={!canSign} onClick={handleSwap} className={button}>Execute Swap</button>
            <button onClick={() => setState('skipped')} className={skip}>Skip</button>
          </div>
          {execution.revokeTx && <button onClick={handleRevoke} className="w-full py-1 text-white/40 hover:text-white/70 border border-white/10 rounded">Revoke {fromToken} allowance instead (approve 0)</button>}
        </div>
      )}
      {state === 'swapping' && <div className="flex items-center gap-2 text-amber-400"><Loader2 className="w-3 h-3 animate-spin" />Swapping… waiting for the receipt</div>}
      {state === 'verifying' && <div className="flex items-center gap-2 text-amber-400"><Loader2 className="w-3 h-3 animate-spin" />Mined. Verifying the receipt on {BASE.name}…</div>}
      {state === 'confirmed' && swapTxHash && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-green-400"><CheckCircle className="w-3 h-3" />Confirmed on-chain</div>
          {receiptNote && <div className="text-white/50">{receiptNote}</div>}
          <a href={`${BASE.explorerUrl}/tx/${swapTxHash}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-green-400/60 hover:text-green-400 transition-colors">
            <ExternalLink className="w-3 h-3" />View on {BASE.explorerName}
          </a>
        </div>
      )}
      {state === 'unrecorded' && swapTxHash && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-amber-400"><XCircle className="w-3 h-3" />Mined, not recorded</div>
          {receiptNote && <div className="text-white/50">{receiptNote}</div>}
          <div className="flex gap-2">
            <button onClick={() => { setState('verifying'); void submitReceipt(swapTxHash).catch((e) => { setState('unrecorded'); setReceiptNote(e instanceof Error ? e.message : 'retry failed'); }); }} className={button}>Retry record</button>
            <a href={`${BASE.explorerUrl}/tx/${swapTxHash}`} target="_blank" rel="noopener noreferrer" className={`${skip} flex items-center gap-1`}><ExternalLink className="w-3 h-3" />{BASE.explorerName}</a>
          </div>
        </div>
      )}
      {state === 'error' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-red-400"><XCircle className="w-3 h-3" />{errorMsg || 'Transaction failed'}</div>
          <button onClick={() => { setState(execution ? stateFor(execution) : 'intent'); setErrorMsg(''); }} className="text-white/30 hover:text-white/60 transition-colors">Retry</button>
        </div>
      )}
    </div>
  );
}
