// ============================================================
// SwapConfirm — Inline trade execution card in chat (Base · Uniswap V3)
//
// State machine (every transition waits for a MINED, SUCCESSFUL receipt):
//   idle → approving → approved → requoting → ready → swapping → verifying → confirmed
//                                                       ↘ error (retry)
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

export interface TradeExecution {
  tokenSymbol: string;
  amountUsd: number;
  confidence: number;
  sizingMethod: string;
  /** Always Base (8453); kept on the row for the record. */
  chain: string;
  execution: {
    needsApproval: boolean;
    approveTx?: Tx;
    /** Absent while an approval is pending; filled by the re-quote. */
    swapTx?: Tx;
    calldataHash?: string;
    quote: { fromToken: string; toToken: string; fromAmount: string; toAmount: string; minReceived?: string };
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
      stocks?: Array<{ symbol: string; referencePrice: number | null; deviationPct: number | null; referenceAgeSec: number | null }>;
      note?: string;
    };
  };
}

type SwapState = 'idle' | 'approving' | 'approved' | 'requoting' | 'ready' | 'swapping' | 'verifying' | 'confirmed' | 'skipped' | 'error';

export function SwapConfirm({ trade, walletAddress }: { trade: TradeExecution; walletAddress?: string }) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [state, setState] = useState<SwapState>(trade.execution.swapTx ? 'ready' : 'idle');
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

  /** Fresh, simulated calldata for the same trade. */
  const requote = async () => {
    const headers = await sessionHeaders();
    const res = await fetch('/api/base-swap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ tokenIn: execution.quote.fromToken, tokenOut: execution.quote.toToken, amount: execution.quote.fromAmount, wallet }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || 'Re-quote failed');
    if (!data.execution?.swapTx) {
      const why = (data.quote?.txWithheld as string[] | undefined)?.join('; ') || 'swap calldata withheld';
      throw new Error(why);
    }
    setExecution(data.execution);
  };

  const handleApprove = async () => {
    try {
      setState('approving');
      await sendAndConfirm(execution.approveTx!);
      setState('requoting');
      await requote();
      setAcknowledged(false);
      setState('ready');
    } catch (err) {
      setState('error');
      setErrorMsg(err instanceof Error ? err.message : 'Approval failed');
    }
  };

  const handleSwap = async () => {
    try {
      if (!execution.swapTx) throw new Error('No swap calldata; re-quote first');
      setState('swapping');
      const hash = await sendAndConfirm(execution.swapTx);
      setSwapTxHash(hash);
      setState('verifying');
      const headers = await sessionHeaders();
      const res = await fetch('/api/swap-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ txHash: hash, wallet }),
      });
      const data = await res.json();
      setReceiptNote(res.ok && data.ok ? `Verified on-chain and recorded (${data.receipt?.outcome})` : `Mined, but not recorded: ${data.error || res.status}`);
      setState('confirmed');
    } catch (err) {
      setState('error');
      setErrorMsg(err instanceof Error ? err.message : 'Swap failed');
    }
  };

  if (state === 'skipped') return null;

  const disclosure = execution.disclosure;
  const minReceived = execution.quote.minReceived ?? disclosure?.minReceived ?? '—';
  const deadlineLeftMin = disclosure?.deadline ? Math.max(0, Math.round((disclosure.deadline * 1000 - Date.now()) / 60000)) : null;
  const canSign = acknowledged && (state === 'idle' || state === 'ready');
  const button = 'flex-1 py-1.5 px-3 bg-green-500/20 border border-green-500/30 text-green-400 hover:bg-green-500/30 transition-colors rounded disabled:opacity-40';
  const skip = 'py-1.5 px-3 border border-white/10 text-white/30 hover:text-white/60 transition-colors rounded';

  return (
    <div className="border border-green-500/20 bg-green-500/[0.03] rounded-lg p-3 font-mono text-[11px]">
      <div className="text-green-400/60 mb-2">Bobby recommends:</div>

      <div className="space-y-1 mb-3">
        <div className="text-green-300">BUY {trade.tokenSymbol} for ${trade.amountUsd.toFixed(2)}</div>
        <div className="text-green-400/50">via {disclosure?.venue ?? 'Uniswap V3'} on {BASE.name}</div>
        <div className="mt-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-2 font-mono text-[10px] text-white/70 space-y-1">
          <div>CHAIN · {BASE.name} ({BASE_CHAIN_ID})</div>
          <div>SWAP CONTRACT · {disclosure?.router ?? execution.swapTx?.to ?? '—'}</div>
          {disclosure?.route && <div>ROUTE · {disclosure.route}</div>}
          {execution.approveTx && state !== 'ready' && (
            <>
              <div>APPROVE TOKEN · {disclosure?.tokenContract ?? execution.approveTx.to}</div>
              <div>APPROVE SPENDER · {disclosure?.spender ?? '—'} · exact {execution.quote.fromAmount} {execution.quote.fromToken}</div>
              <div className="text-amber-300/80">If you approve and do not complete the swap, that allowance stays until spent or revoked.</div>
            </>
          )}
          <div>MIN RECEIVED · {minReceived} {execution.quote.toToken}</div>
          {typeof disclosure?.priceImpactPct === 'number' && <div>PRICE IMPACT · {disclosure.priceImpactPct.toFixed(2)}%</div>}
          {disclosure?.stocks?.map((s) => (
            <div key={s.symbol}>
              {s.symbol} REFERENCE · {s.referencePrice ? `$${s.referencePrice.toFixed(2)}` : '—'}
              {typeof s.deviationPct === 'number' ? ` · ${s.deviationPct >= 0 ? '+' : ''}${s.deviationPct.toFixed(2)}% vs Chainlink` : ''}
            </div>
          ))}
          {deadlineLeftMin !== null && <div>VALID FOR · {deadlineLeftMin} min</div>}
          <div>SIMULATED · {execution.swapTx ? (disclosure?.simulated ? 'yes (eth_call passed)' : 'no') : 'after approval + re-quote'}</div>
          {(state === 'idle' || state === 'ready') && (
            <label className="flex items-center gap-2 pt-1 cursor-pointer">
              <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} />
              <span>I checked the contract and the minimum received. Bobby never signs for me.</span>
            </label>
          )}
        </div>
        <div className="text-green-400/50">Confidence: {trade.confidence}% ({trade.sizingMethod})</div>
      </div>

      {state === 'idle' && (
        <div className="flex gap-2">
          <button disabled={!canSign} onClick={handleApprove} className={button}>Approve {execution.quote.fromToken} (exact)</button>
          <button onClick={() => setState('skipped')} className={skip}>Skip</button>
        </div>
      )}
      {state === 'approving' && <div className="flex items-center gap-2 text-amber-400"><Loader2 className="w-3 h-3 animate-spin" />Approving {execution.quote.fromToken}… waiting for the receipt</div>}
      {state === 'requoting' && <div className="flex items-center gap-2 text-amber-400"><Loader2 className="w-3 h-3 animate-spin" />Approval mined. Re-quoting and simulating the swap…</div>}
      {state === 'ready' && (
        <div className="space-y-2">
          {execution.approveTx === undefined && trade.execution.approveTx && (
            <div className="flex items-center gap-2 text-green-400"><CheckCircle className="w-3 h-3" />Approval confirmed · fresh simulated calldata</div>
          )}
          <div className="flex gap-2">
            <button disabled={!canSign} onClick={handleSwap} className={button}>Execute Swap</button>
            <button onClick={() => setState('skipped')} className={skip}>Skip</button>
          </div>
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
      {state === 'error' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-red-400"><XCircle className="w-3 h-3" />{errorMsg || 'Transaction failed'}</div>
          <button onClick={() => { setState(execution.swapTx ? 'ready' : 'idle'); setErrorMsg(''); }} className="text-white/30 hover:text-white/60 transition-colors">Retry</button>
        </div>
      )}
    </div>
  );
}
