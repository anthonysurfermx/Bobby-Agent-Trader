// ============================================================
// SwapConfirm — Inline trade execution card in chat (Base · Uniswap V3)
// State machine: idle -> approving -> approved -> swapping -> confirmed | error
// The calldata comes from /api/base-swap (server-built, guarded, simulated);
// this card only shows what the wallet is about to sign and forwards it.
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import { useAccount, useSendTransaction, useSwitchChain, useWaitForTransactionReceipt } from 'wagmi';
import { CheckCircle, XCircle, Loader2, ExternalLink } from 'lucide-react';
import { BASE, BASE_CHAIN_ID } from '@/config/chains';
import { useBobbySession } from '@/hooks/useBobbySession';

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
    quote: { fromToken: string; toToken: string; fromAmount: string; fromAmountRaw: string; toAmount: string; minReceived?: string; minReceivedRaw: string };
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
  const [syncWarning, setSyncWarning] = useState('');
  const [execution, setExecution] = useState(trade.execution);
  const session = useBobbySession({ auto: false });

  const { sendTransactionAsync } = useSendTransaction();

  const [approveTxHash, setApproveTxHash] = useState<`0x${string}` | undefined>();
  const { data: approvalReceipt } = useWaitForTransactionReceipt({ hash: approveTxHash });

  const [swapTxHash, setSwapTxHash] = useState<`0x${string}` | undefined>();
  const { data: swapReceipt } = useWaitForTransactionReceipt({ hash: swapTxHash });

  // The calldata was built for Base; the request pins the chain so wagmi
  // refuses a mismatch instead of signing on the wrong network.
  const { chainId: connectedChainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const ensureChain = async () => {
    if (connectedChainId !== BASE_CHAIN_ID) await switchChainAsync({ chainId: BASE_CHAIN_ID });
  };

  const disclosure = execution.disclosure;
  const minReceived = execution.quote.minReceived ?? disclosure?.minReceived ?? '—';
  const deadlineLeftMin = disclosure?.deadline ? Math.max(0, Math.round((disclosure.deadline * 1000 - Date.now()) / 60000)) : null;

  const refreshAfterApproval = useCallback(async () => {
    if (!walletAddress) throw new Error('Wallet session is missing');
    const stored = session.ready ? session.session : await session.ensureSession();
    if (!stored) throw new Error('Sign the wallet session to refresh the swap');
    const res = await fetch('/api/base-swap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...session.headers() },
      body: JSON.stringify({
        tokenIn: execution.quote.fromToken,
        tokenOut: execution.quote.toToken,
        amount: execution.quote.fromAmount,
        wallet: walletAddress.toLowerCase(),
        stockEligibilityConfirmed: acknowledged,
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok || !data.execution) throw new Error(data.error || 'Fresh post-approval simulation failed');
    if (data.execution.needsApproval || data.execution.disclosure?.simulated !== true) throw new Error('Swap is not ready after approval');
    setExecution(data.execution);
  }, [walletAddress, session, execution.quote, acknowledged]);

  useEffect(() => {
    if (!approvalReceipt || state !== 'approving') return;
    if (approvalReceipt.status !== 'success') {
      setErrorMsg('Approval reverted. No swap was sent.');
      setState('error');
      return;
    }
    void refreshAfterApproval().then(() => setState('approved')).catch((error) => {
      setErrorMsg(error instanceof Error ? error.message : 'Could not refresh the swap');
      setState('error');
    });
  }, [approvalReceipt, state, refreshAfterApproval]);

  useEffect(() => {
    if (!swapReceipt || state !== 'swapping') return;
    if (swapReceipt.status !== 'success') {
      setErrorMsg('Swap reverted. The exact approval may still remain.');
      setState('error');
      return;
    }
    if (!walletAddress || !swapTxHash) return;
    void fetch('/api/swap-receipt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...session.headers() },
      body: JSON.stringify({
        wallet: walletAddress.toLowerCase(), txHash: swapTxHash,
        tokenIn: execution.quote.fromToken, tokenOut: execution.quote.toToken,
        amountInRaw: execution.quote.fromAmountRaw, minAmountOutRaw: execution.quote.minReceivedRaw,
      }),
    }).then(async (response) => {
      if (!response.ok) throw new Error((await response.json().catch(() => null))?.error || 'history sync failed');
    }).catch((error) => setSyncWarning(error instanceof Error ? error.message : 'History sync failed'));
    setState('confirmed');
  }, [swapReceipt, state, walletAddress, swapTxHash, execution.quote, session]);

  const handleApprove = async () => {
    try {
      setState('approving');
      const tx = execution.approveTx!;
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
      if (disclosure?.deadline && disclosure.deadline <= Math.floor(Date.now() / 1000) + 15) throw new Error('Quote expired. Refresh before signing.');
      if (disclosure?.simulated !== true) throw new Error('Swap has not passed the post-approval simulation');
      setState('swapping');
      const tx = execution.swapTx;
      await ensureChain();
      const hash = await sendTransactionAsync({
        chainId: BASE_CHAIN_ID,
        to: tx.to as `0x${string}`,
        data: tx.data as `0x${string}`,
        value: tx.value ? BigInt(tx.value) : undefined,
      });
      setSwapTxHash(hash);
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
          <div>SWAP CONTRACT · {execution.swapTx.to}</div>
          {disclosure?.route && <div>ROUTE · {disclosure.route}</div>}
          {execution.approveTx && <div>APPROVE TOKEN · {disclosure?.tokenContract ?? execution.approveTx.to}</div>}
          {execution.approveTx && <div>APPROVE SPENDER · {disclosure?.spender ?? '—'} (exact amount; may remain if no swap)</div>}
          <div>MIN RECEIVED · {minReceived} {execution.quote.toToken}</div>
          {typeof disclosure?.priceImpactPct === 'number' && <div>PRICE IMPACT · {disclosure.priceImpactPct.toFixed(2)}%</div>}
          {deadlineLeftMin !== null && <div>VALID FOR · {deadlineLeftMin} min</div>}
          {disclosure?.simulated !== undefined && <div>SIMULATED · {disclosure.simulated ? 'yes (eth_call passed)' : 'after approval'}</div>}
          <label className="flex items-center gap-2 pt-1 cursor-pointer">
            <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} />
            <span>I am in an eligible jurisdiction outside the U.S. I understand this B20 token is not the underlying share, and I checked the contract and minimum.</span>
          </label>
        </div>
        <div className="text-green-400/50">
          Confidence: {trade.confidence}% ({trade.sizingMethod})
        </div>
      </div>

      {state === 'idle' && (
        <div className="flex gap-2">
          {execution.needsApproval ? (
            <button
              disabled={!acknowledged}
              onClick={handleApprove}
              className="flex-1 py-1.5 px-3 bg-green-500/20 border border-green-500/30 text-green-400 hover:bg-green-500/30 transition-colors rounded disabled:opacity-40"
            >
              Approve {execution.quote.fromToken}
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
          Approving {execution.quote.fromToken}...
        </div>
      )}

      {state === 'approved' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-green-400">
            <CheckCircle className="w-3 h-3" />
            {execution.quote.fromToken} approved; quote refreshed and simulation passed
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
          {syncWarning && <div className="text-amber-300/80">Confirmed on-chain; history sync will retry later: {syncWarning}</div>}
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
