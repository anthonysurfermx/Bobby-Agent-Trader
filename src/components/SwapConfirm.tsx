// ============================================================
// SwapConfirm — Inline trade execution card in chat
// State machine: idle -> approving -> approved -> swapping -> confirmed | error
// ============================================================

import { useState } from 'react';
import { useSendTransaction, useWaitForTransactionReceipt } from 'wagmi';
import { CheckCircle, XCircle, Loader2, ExternalLink } from 'lucide-react';

export interface TradeExecution {
  tokenSymbol: string;
  amountUsd: number;
  confidence: number;
  sizingMethod: string;
  chain: string;
  execution: {
    needsApproval: boolean;
    approveTx?: { to: string; data: string; value?: string };
    swapTx: { to: string; data: string; value?: string; gas?: string };
    quote: { fromToken: string; toToken: string; fromAmount: string; toAmount: string };
  };
}

type SwapState = 'idle' | 'approving' | 'approved' | 'swapping' | 'confirmed' | 'skipped' | 'error';

function getExplorerUrl(chain: string, txHash: string): string {
  if (chain === '196') return `https://www.oklink.com/xlayer/tx/${txHash}`;
  if (chain === '8453') return `https://basescan.org/tx/${txHash}`;
  return `https://etherscan.io/tx/${txHash}`;
}

function getChainName(chain: string): string {
  if (chain === '196') return 'X Layer';
  if (chain === '8453') return 'Base';
  return 'Ethereum';
}

export function SwapConfirm({ trade }: { trade: TradeExecution }) {
  const [state, setState] = useState<SwapState>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const { sendTransactionAsync } = useSendTransaction();

  // Approval tx tracking
  const [approveTxHash, setApproveTxHash] = useState<`0x${string}` | undefined>();
  const { isSuccess: approveConfirmed } = useWaitForTransactionReceipt({
    hash: approveTxHash,
  });

  // Swap tx tracking
  const [swapTxHash, setSwapTxHash] = useState<`0x${string}` | undefined>();
  const { isSuccess: swapConfirmed } = useWaitForTransactionReceipt({
    hash: swapTxHash,
  });

  // Handle state transitions from receipt confirmations
  if (approveConfirmed && state === 'approving') {
    setState('approved');
  }
  if (swapConfirmed && state === 'swapping') {
    setState('confirmed');
  }

  const handleApprove = async () => {
    try {
      setState('approving');
      const tx = trade.execution.approveTx!;
      const hash = await sendTransactionAsync({
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
      const hash = await sendTransactionAsync({
        to: tx.to as `0x${string}`,
        data: tx.data as `0x${string}`,
        value: tx.value ? BigInt(tx.value) : undefined,
      });
      setSwapTxHash(hash);

      // Record confirmation
      try {
        await fetch('/api/agent-confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            walletAddress: '',
            txHash: hash,
            status: 'confirmed',
            chain: trade.chain,
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
      {/* Header */}
      <div className="text-green-400/60 mb-2">Adams recommends:</div>

      {/* Trade details */}
      <div className="space-y-1 mb-3">
        <div className="text-green-300">
          BUY {trade.tokenSymbol} for ${trade.amountUsd.toFixed(2)}
        </div>
        <div className="text-green-400/50">
          via OKX DEX on {getChainName(trade.chain)}
        </div>
        <div className="text-green-400/50">
          Confidence: {trade.confidence}% ({trade.sizingMethod})
        </div>
      </div>

      {/* Action buttons based on state */}
      {state === 'idle' && (
        <div className="flex gap-2">
          {trade.execution.needsApproval ? (
            <button
              onClick={handleApprove}
              className="flex-1 py-1.5 px-3 bg-green-500/20 border border-green-500/30 text-green-400 hover:bg-green-500/30 transition-colors rounded"
            >
              Approve USDC
            </button>
          ) : (
            <button
              onClick={handleSwap}
              className="flex-1 py-1.5 px-3 bg-green-500/20 border border-green-500/30 text-green-400 hover:bg-green-500/30 transition-colors rounded"
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
          Approving USDC...
        </div>
      )}

      {state === 'approved' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-green-400">
            <CheckCircle className="w-3 h-3" />
            USDC Approved
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
            href={getExplorerUrl(trade.chain, swapTxHash)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-green-400/60 hover:text-green-400 transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
            View on {trade.chain === '196' ? 'OKLink' : 'Explorer'}
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
