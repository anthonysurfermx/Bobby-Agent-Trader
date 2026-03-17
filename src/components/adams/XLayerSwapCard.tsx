// ============================================================
// XLayerSwapCard — "Execute Bobby's Trade on X Layer"
// Appears after a debate. Gets a DEX quote, user signs with their wallet.
// ============================================================

import { useState } from 'react';
import { useSendTransaction, useWaitForTransactionReceipt, useAccount, useSwitchChain } from 'wagmi';
import { Loader2, CheckCircle, XCircle, ExternalLink, Zap } from 'lucide-react';

interface XLayerSwapProps {
  symbol: string;
  direction: string;
  conviction: number;
  entryPrice?: number;
}

const XLAYER_CHAIN_ID = 196;

// Known tokens on X Layer
const XLAYER_TOKENS: Record<string, string> = {
  OKB: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  WOKB: '0xe538905cf8410324e03a5a23c1c177a474d59b2b',
  USDT: '0x1e4a5963abfd975d8c9021ce480b42188849d41d',
  USDC: '0x74b7f16337b8972027f6196a17a631ac6de26d22',
};

type SwapState = 'idle' | 'quoting' | 'quoted' | 'switching_chain' | 'swapping' | 'confirmed' | 'error';

export function XLayerSwapCard({ symbol, direction, conviction, entryPrice }: XLayerSwapProps) {
  const [state, setState] = useState<SwapState>('idle');
  const [quote, setQuote] = useState<any>(null);
  const [error, setError] = useState('');
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const [amount, setAmount] = useState('');

  const { address, chainId } = useAccount();
  const { sendTransactionAsync } = useSendTransaction();
  const { switchChainAsync } = useSwitchChain();
  const { isSuccess: txConfirmed } = useWaitForTransactionReceipt({ hash: txHash });

  if (txConfirmed && state === 'swapping') setState('confirmed');

  const getQuote = async () => {
    if (!address) { setError('Connect your wallet first'); setState('error'); return; }
    if (!amount || parseFloat(amount) <= 0) { setError('Enter an amount'); setState('error'); return; }
    setState('quoting');
    try {
      // Convert amount to wei (OKB has 18 decimals)
      const amountWei = BigInt(Math.floor(parseFloat(amount) * 1e18)).toString();
      const res = await fetch('/api/xlayer-trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'swap_data',
          params: {
            from_token: XLAYER_TOKENS.OKB,
            to_token: XLAYER_TOKENS.USDT,
            amount: amountWei,
            wallet: address,
            slippage: '1',
          },
        }),
      });
      const data = await res.json();
      if (data.ok && data.data) {
        setQuote(data.data);
        setState('quoted');
      } else {
        setError(data.error || 'Failed to get quote');
        setState('error');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Quote failed');
      setState('error');
    }
  };

  const executeSwap = async () => {
    if (!quote || !address) return;

    // Switch to X Layer if needed
    if (chainId !== XLAYER_CHAIN_ID) {
      setState('switching_chain');
      try {
        await switchChainAsync({ chainId: XLAYER_CHAIN_ID });
      } catch {
        setError('Please switch to X Layer network manually');
        setState('error');
        return;
      }
    }

    setState('swapping');
    try {
      const txData = Array.isArray(quote) ? quote[0]?.tx : quote.tx;
      if (!txData) { setError('No transaction data'); setState('error'); return; }

      const hash = await sendTransactionAsync({
        to: txData.to as `0x${string}`,
        data: txData.data as `0x${string}`,
        value: txData.value ? BigInt(txData.value) : undefined,
      });
      setTxHash(hash);

      // Record TX for forum
      try {
        await fetch('/api/agent-confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            walletAddress: address,
            txHash: hash,
            status: 'confirmed',
            chain: '196',
            tokenSymbol: symbol,
            amountUsd: 0.95,
          }),
        });
      } catch {}
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Swap failed');
      setState('error');
    }
  };

  const isLowConviction = conviction < 0.5;

  return (
    <div className={`border p-3 font-mono text-[11px] mt-3 ${isLowConviction ? 'border-white/[0.08] bg-white/[0.02]' : 'border-yellow-500/20 bg-yellow-500/[0.03]'}`}>
      <div className="flex items-center gap-2 mb-2">
        <Zap className={`w-3.5 h-3.5 ${isLowConviction ? 'text-white/30' : 'text-yellow-400'}`} />
        <span className={`font-bold text-[10px] tracking-wider ${isLowConviction ? 'text-white/30' : 'text-yellow-400/80'}`}>
          {isLowConviction ? 'SWAP ON X LAYER' : 'EXECUTE ON X LAYER'}
        </span>
        <span className="text-[8px] text-white/20 ml-auto">Chain ID: 196</span>
      </div>

      <div className="text-white/50 mb-2">
        {isLowConviction ? (
          <span>Bobby says wait on <span className="text-white/70">{symbol}</span> — but you can swap anyway on X Layer</span>
        ) : (
          <span>Bobby recommends <span className={direction === 'long' ? 'text-green-400' : 'text-red-400'}>{direction.toUpperCase()}</span> {symbol} with {Math.round(conviction * 10)}/10 conviction
          {entryPrice && <span> · Entry ~${entryPrice.toLocaleString()}</span>}</span>
        )}
      </div>

      {state === 'idle' && (
        <div className="space-y-2">
          <div className="flex gap-2 items-center">
            <div className="flex-1 flex items-center gap-1 border border-white/[0.08] bg-white/[0.03] rounded px-2 py-1.5">
              <input
                type="number"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.01"
                step="0.01"
                min="0.001"
                className="flex-1 bg-transparent text-white/80 text-[12px] font-mono outline-none placeholder:text-white/20 w-20"
              />
              <span className="text-[10px] text-white/30 font-mono">OKB</span>
            </div>
            <button onClick={getQuote}
              className={`py-1.5 px-3 border rounded flex items-center gap-1.5 text-[10px] font-mono transition-colors ${
                isLowConviction
                  ? 'border-white/10 text-white/40 hover:text-white/60 hover:bg-white/[0.04]'
                  : 'bg-yellow-500/20 border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/30'
              }`}>
              <Zap className="w-3 h-3" /> Quote
            </button>
          </div>
          {amount && parseFloat(amount) > 0 && (
            <div className="text-[9px] text-white/20 font-mono">
              ≈ ${(parseFloat(amount) * 95).toFixed(2)} USD · via OKX DEX on X Layer
            </div>
          )}
        </div>
      )}

      {state === 'quoting' && (
        <div className="flex items-center gap-2 text-amber-400">
          <Loader2 className="w-3 h-3 animate-spin" /> Getting quote from OKX DEX...
        </div>
      )}

      {state === 'quoted' && (
        <div className="space-y-2">
          <div className="text-green-400/60">Quote ready · OKX DEX via X Layer</div>
          <div className="flex gap-2">
            <button onClick={executeSwap}
              className="flex-1 py-1.5 px-3 bg-green-500/20 border border-green-500/30 text-green-400 hover:bg-green-500/30 transition-colors rounded">
              Sign & Execute
            </button>
            <button onClick={() => setState('idle')}
              className="py-1.5 px-3 border border-white/10 text-white/30 hover:text-white/60 transition-colors rounded">
              Cancel
            </button>
          </div>
        </div>
      )}

      {state === 'switching_chain' && (
        <div className="flex items-center gap-2 text-amber-400">
          <Loader2 className="w-3 h-3 animate-spin" /> Switching to X Layer...
        </div>
      )}

      {state === 'swapping' && (
        <div className="flex items-center gap-2 text-amber-400">
          <Loader2 className="w-3 h-3 animate-spin" /> Executing swap on X Layer...
        </div>
      )}

      {state === 'confirmed' && txHash && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-green-400">
            <CheckCircle className="w-3.5 h-3.5" /> Trade executed on X Layer!
          </div>
          <a href={`https://www.oklink.com/xlayer/tx/${txHash}`} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-green-400/60 hover:text-green-400 transition-colors">
            <ExternalLink className="w-3 h-3" /> View on OKLink Explorer
          </a>
          <div className="text-[9px] text-white/15 font-mono break-all">TX: {txHash}</div>
        </div>
      )}

      {state === 'error' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-red-400">
            <XCircle className="w-3 h-3" /> {error}
          </div>
          <button onClick={() => { setState('idle'); setError(''); }}
            className="text-white/30 hover:text-white/60 transition-colors">
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
