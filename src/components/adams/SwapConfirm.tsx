// ============================================================
// SwapConfirm — Inline trade execution card in chat (Base · Uniswap V3)
// State machine: idle -> approving -> approved -> swapping -> confirmed | error
// The calldata comes from /api/base-swap (server-built, guarded, simulated);
// this card only shows what the wallet is about to sign and forwards it.
// ============================================================

import { useState } from 'react';
import { useAccount, useSendTransaction, useSwitchChain, useWaitForTransactionReceipt } from 'wagmi';
import { CheckCircle, XCircle, Loader2, ExternalLink } from 'lucide-react';
import { BASE, BASE_CHAIN_ID } from '@/config/chains';

export interface TradeExecution {
  tokenSymbol: string;
  amountUsd: number;
  confidence: number;
  sizingMethod: string;
  /** Always Base (8453); kept on the row for the confirmation record. */
  chain: string;
  execution: {
    needsApproval: boolean;
    approveTx?: { to: string; data: string; value?: string };
    swapTx: { to: string; data: string; value?: string; gas?: string };
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
      note?: string;
    };
  };
}

type SwapState = 'idle' | 'approving' | 'approved' | 'swapping' | 'confirmed' | 'skipped' | 'error';

export function SwapConfirm({ trade, walletAddress }: { trade: TradeExecution; walletAddress?: string }) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [state, setState] = useState<SwapState>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const { sendTransactionAsync } = useSendTransaction();

  const [approveTxHash, setApproveTxHash] = useState<`0x${string}` | undefined>();
  const { isSuccess: approveConfirmed } = useWaitForTransactionReceipt({ hash: approveTxHash });

  const [swapTxHash, setSwapTxHash] = useState<`0x${string}` | undefined>();
  const { isSuccess: swapConfirmed } = useWaitForTransactionReceipt({ hash: swapTxHash });

  if (approveConfirmed && state === 'approving') setState('approved');
  if (swapConfirmed && state === 'swapping') setState('confirmed');

  // The calldata was built for Base; the request pins the chain so wagmi
  // refuses a mismatch instead of signing on the wrong network.
  const { chainId: connectedChainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const ensureChain = async () => {
    if (connectedChainId !== BASE_CHAIN_ID) await switchChainAsync({ chainId: BASE_CHAIN_ID });
  };

  const disclosure = trade.execution.disclosure;
  const minReceived = trade.execution.quote.minReceived ?? disclosure?.minReceived ?? '—';
  const deadlineLeftMin = disclosure?.deadline ? Math.max(0, Math.round((disclosure.deadline * 1000 - Date.now()) / 60000)) : null;

  const handleApprove = async () => {
    try {
      setState('approving');
      const tx = trade.execution.approveTx!;
      await ensureChain();
      const hash = await sendTransactionAsync({
        chainId: BASE_CHAIN_ID,
        to: tx.to as `0x${string}`,
        data: tx.data as `0x${string}`,
        value: tx.value ? BigInt(tx.value) : undefined,
      });
      setApproveTxHash(hash);
    } catch (err) {
      setState('error');
      setErrorMsg(err instanceof Error ? err.message : 'Approval failed');
    }
  };

  const handleSwap = async () => {
    try {
      setState('swapping');
      const tx = trade.execution.swapTx;
      await ensureChain();
      const hash = await sendTransactionAsync({
        chainId: BASE_CHAIN_ID,
        to: tx.to as `0x${string}`,
        data: tx.data as `0x${string}`,
        value: tx.value ? BigInt(tx.value) : undefined,
      });
      setSwapTxHash(hash);

      try {
        await fetch('/api/agent-confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            walletAddress: walletAddress || '',
            txHash: hash,
            status: 'confirmed',
            chain: String(BASE_CHAIN_ID),
            tokenSymbol: trade.tokenSymbol,
            amountUsd: trade.amountUsd,
          }),
        });
      } catch {}
    } catch (err) {
      setState('error');
      setErrorMsg(err instanceof Error ? err.message : 'Swap failed');
    }
  };

  if (state === 'skipped') return null;

  return (
    <div className="border border-green-500/20 bg-green-500/[0.03] rounded-lg p-3 font-mono text-[11px]">
      <div className="text-green-400/60 mb-2">Bobby recommends:</div>

      <div className="space-y-1 mb-3">
        <div className="text-green-300">
          BUY {trade.tokenSymbol} for ${trade.amountUsd.toFixed(2)}
        </div>
        <div className="text-green-400/50">
          via {disclosure?.venue ?? 'Uniswap V3'} on {BASE.name}
        </div>
        {/* What the wallet is about to sign — destination, spender, minimum out. Nothing is enabled until read. */}
        <div className="mt-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-2 font-mono text-[10px] text-white/70 space-y-1">
          <div>CHAIN · {BASE.name} ({BASE_CHAIN_ID})</div>
          <div>SWAP CONTRACT · {trade.execution.swapTx.to}</div>
          {disclosure?.route && <div>ROUTE · {disclosure.route}</div>}
          {trade.execution.approveTx && <div>APPROVE TOKEN · {disclosure?.tokenContract ?? trade.execution.approveTx.to}</div>}
          {trade.execution.approveTx && <div>APPROVE SPENDER · {disclosure?.spender ?? '—'} (exact amount)</div>}
          <div>MIN RECEIVED · {minReceived} {trade.execution.quote.toToken}</div>
          {typeof disclosure?.priceImpactPct === 'number' && <div>PRICE IMPACT · {disclosure.priceImpactPct.toFixed(2)}%</div>}
          {deadlineLeftMin !== null && <div>VALID FOR · {deadlineLeftMin} min</div>}
          {disclosure?.simulated !== undefined && <div>SIMULATED · {disclosure.simulated ? 'yes (eth_call passed)' : 'after approval'}</div>}
          <label className="flex items-center gap-2 pt-1 cursor-pointer">
            <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} />
            <span>I checked the contract and the minimum received. Bobby never signs for me.</span>
          </label>
        </div>
        <div className="text-green-400/50">
          Confidence: {trade.confidence}% ({trade.sizingMethod})
        </div>
      </div>

      {state === 'idle' && (
        <div className="flex gap-2">
          {trade.execution.needsApproval ? (
            <button
              disabled={!acknowledged}
              onClick={handleApprove}
              className="flex-1 py-1.5 px-3 bg-green-500/20 border border-green-500/30 text-green-400 hover:bg-green-500/30 transition-colors rounded disabled:opacity-40"
            >
              Approve {trade.execution.quote.fromToken}
            </button>
          ) : (
            <button
              disabled={!acknowledged}
              onClick={handleSwap}
              className="flex-1 py-1.5 px-3 bg-green-500/20 border border-green-500/30 text-green-400 hover:bg-green-500/30 transition-colors rounded disabled:opacity-40"
            >
              Execute Swap
            </button>
          )}
          <button
            onClick={() => setState('skipped')}
            className="py-1.5 px-3 border border-white/10 text-white/30 hover:text-white/60 transition-colors rounded"
          >
            Skip
          </button>
        </div>
      )}

      {state === 'approving' && (
        <div className="flex items-center gap-2 text-amber-400">
          <Loader2 className="w-3 h-3 animate-spin" />
          Approving {trade.execution.quote.fromToken}...
        </div>
      )}

      {state === 'approved' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-green-400">
            <CheckCircle className="w-3 h-3" />
            {trade.execution.quote.fromToken} approved (exact amount)
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSwap}
              className="flex-1 py-1.5 px-3 bg-green-500/20 border border-green-500/30 text-green-400 hover:bg-green-500/30 transition-colors rounded"
            >
              Execute Swap
            </button>
            <button
              onClick={() => setState('skipped')}
              className="py-1.5 px-3 border border-white/10 text-white/30 hover:text-white/60 transition-colors rounded"
            >
              Skip
            </button>
          </div>
        </div>
      )}

      {state === 'swapping' && (
        <div className="flex items-center gap-2 text-amber-400">
          <Loader2 className="w-3 h-3 animate-spin" />
          Executing swap...
        </div>
      )}

      {state === 'confirmed' && swapTxHash && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-green-400">
            <CheckCircle className="w-3 h-3" />
            Confirmed!
          </div>
          <a
            href={`${BASE.explorerUrl}/tx/${swapTxHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-green-400/60 hover:text-green-400 transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
            View on {BASE.explorerName}
          </a>
        </div>
      )}

      {state === 'error' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-red-400">
            <XCircle className="w-3 h-3" />
            {errorMsg || 'Transaction failed'}
          </div>
          <button
            onClick={() => { setState('idle'); setErrorMsg(''); }}
            className="text-white/30 hover:text-white/60 transition-colors"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
