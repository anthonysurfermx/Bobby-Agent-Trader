// ============================================================
// SwapExecutor — Real on-chain swap via OKX DEX Aggregator
// Flow: Connect Wallet → Quote → Approve (if ERC-20) → Swap → Confirm
// Uses wagmi v2 for wallet interaction, OKX API for routing
// ============================================================

import { useState, useCallback } from 'react';
import { useAccount, useSendTransaction, useWaitForTransactionReceipt } from 'wagmi';
import { useAppKit } from '@reown/appkit/react';
import { parseUnits, type Hex } from 'viem';
import { Wallet, ArrowRight, Check, Loader2, AlertCircle, ExternalLink } from 'lucide-react';

const NATIVE_TOKEN = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

interface TokenConfig {
  address: string;
  symbol: string;
  decimals: number;
  chainId: string;
}

const TOKENS: Record<string, TokenConfig> = {
  USDC: { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', symbol: 'USDC', decimals: 6, chainId: '1' },
  USDT: { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', symbol: 'USDT', decimals: 6, chainId: '1' },
  ETH:  { address: NATIVE_TOKEN, symbol: 'ETH', decimals: 18, chainId: '1' },
  WBTC: { address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', symbol: 'WBTC', decimals: 8, chainId: '1' },
};

const SELL_TOKENS = ['USDC', 'USDT', 'ETH'];
const BUY_TOKENS = ['ETH', 'WBTC', 'USDC', 'USDT'];

type SwapStep = 'idle' | 'quoting' | 'quoted' | 'approving' | 'approved' | 'swapping' | 'confirmed' | 'error';

interface SwapQuote {
  fromToken: string;
  toToken: string;
  fromAmount: number;
  toAmount: number;
  estimateGasFee: string;
  tx: {
    from: string;
    to: string;
    value: string;
    data: string;
    gas: string;
    gasPrice: string;
  };
}

interface Props {
  defaultFrom?: string;
  defaultTo?: string;
  className?: string;
}

export function SwapExecutor({ defaultFrom = 'USDC', defaultTo = 'ETH', className = '' }: Props) {
  const { address, isConnected, chain } = useAccount();
  const { open: openWallet } = useAppKit();
  const { sendTransactionAsync } = useSendTransaction();

  const [fromToken, setFromToken] = useState(defaultFrom);
  const [toToken, setToToken] = useState(defaultTo);
  const [amount, setAmount] = useState('100');
  const [slippage, setSlippage] = useState('0.5');

  const [step, setStep] = useState<SwapStep>('idle');
  const [quote, setQuote] = useState<SwapQuote | null>(null);
  const [txHash, setTxHash] = useState<Hex | undefined>();
  const [error, setError] = useState<string | null>(null);

  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  // Update step when tx confirms
  if (isConfirmed && step === 'swapping') {
    setStep('confirmed');
  }

  const from = TOKENS[fromToken];
  const to = TOKENS[toToken];

  const isNativeFrom = from?.address === NATIVE_TOKEN;

  // ---- Step 1: Get swap quote + calldata ----
  const getQuote = useCallback(async () => {
    if (!address || !from || !to) return;

    setStep('quoting');
    setError(null);
    setQuote(null);
    setTxHash(undefined);

    try {
      const amountRaw = parseUnits(amount, from.decimals).toString();

      const params = new URLSearchParams({
        chainId: from.chainId,
        fromToken: from.address,
        toToken: to.address,
        amount: amountRaw,
        userWalletAddress: address,
        slippage: (parseFloat(slippage) / 100).toString(),
      });

      const res = await fetch(`/api/dex-swap?${params}`);
      const data = await res.json();

      if (!data.ok) {
        throw new Error(data.error || data.msg || 'Failed to get swap route');
      }

      setQuote(data.swap);
      setStep('quoted');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Quote failed');
      setStep('error');
    }
  }, [address, from, to, amount, slippage]);

  // ---- Step 2: Approve ERC-20 (skip for native) ----
  const approveToken = useCallback(async () => {
    if (!from || isNativeFrom) {
      setStep('approved');
      return;
    }

    setStep('approving');
    setError(null);

    try {
      const amountRaw = parseUnits(amount, from.decimals).toString();

      const params = new URLSearchParams({
        chainId: from.chainId,
        tokenContractAddress: from.address,
        approveAmount: amountRaw,
      });

      const res = await fetch(`/api/dex-approve?${params}`);
      const data = await res.json();

      if (!data.ok) {
        throw new Error(data.error || 'Failed to get approval data');
      }

      // Send the approve tx via wallet
      await sendTransactionAsync({
        to: data.approve.to as Hex,
        data: data.approve.data as Hex,
        gas: data.approve.gasLimit ? BigInt(data.approve.gasLimit) : undefined,
      });

      setStep('approved');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Approval failed';
      if (msg.includes('rejected') || msg.includes('denied')) {
        setError('Transaction rejected by user');
      } else {
        setError(msg);
      }
      setStep('error');
    }
  }, [from, isNativeFrom, amount, sendTransactionAsync]);

  // ---- Step 3: Execute the swap ----
  const executeSwap = useCallback(async () => {
    if (!quote?.tx) return;

    setStep('swapping');
    setError(null);

    try {
      const hash = await sendTransactionAsync({
        to: quote.tx.to as Hex,
        data: quote.tx.data as Hex,
        value: BigInt(quote.tx.value || '0'),
        gas: quote.tx.gas ? BigInt(quote.tx.gas) : undefined,
      });

      setTxHash(hash);
      // Step will update to 'confirmed' when useWaitForTransactionReceipt succeeds
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Swap failed';
      if (msg.includes('rejected') || msg.includes('denied')) {
        setError('Transaction rejected by user');
      } else {
        setError(msg);
      }
      setStep('error');
    }
  }, [quote, sendTransactionAsync]);

  // ---- Reset ----
  const reset = () => {
    setStep('idle');
    setQuote(null);
    setTxHash(undefined);
    setError(null);
  };

  // ---- Get explorer URL ----
  const explorerUrl = txHash
    ? `https://etherscan.io/tx/${txHash}`
    : null;

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-green-400">REAL SWAP</span>
          <span className="text-[9px] text-neutral-600">On-chain via OKX DEX</span>
        </div>
        {isConnected && (
          <span className="text-[9px] text-green-400/60 bg-green-400/10 px-2 py-0.5 rounded-full flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            {address?.slice(0, 6)}...{address?.slice(-4)}
            {chain?.name && <span className="text-neutral-500">· {chain.name}</span>}
          </span>
        )}
      </div>

      {/* Connect wallet if not connected */}
      {!isConnected && (
        <button
          onClick={() => openWallet()}
          className="w-full py-3 bg-green-500/15 border border-green-500/30 rounded-xl text-sm font-medium text-green-400 hover:bg-green-500/25 transition-colors flex items-center justify-center gap-2"
        >
          <Wallet className="w-4 h-4" />
          Connect Wallet to Swap
        </button>
      )}

      {/* Swap form — shown when connected */}
      {isConnected && step !== 'confirmed' && (
        <>
          {/* Token pair selector */}
          <div className="flex items-center gap-2">
            {/* From */}
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

            {/* Arrow */}
            <div className="w-8 h-8 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center shrink-0">
              <ArrowRight className="w-3.5 h-3.5 text-neutral-400" />
            </div>

            {/* To */}
            <div className="flex-1 bg-neutral-900/60 border border-neutral-800 rounded-xl p-3">
              <div className="text-[9px] text-neutral-500 mb-1">You receive</div>
              <div className="flex items-center gap-2">
                <span className="flex-1 text-lg font-bold text-neutral-100">
                  {quote ? quote.toAmount.toFixed(quote.toToken === 'WBTC' ? 6 : 4) : '—'}
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

          {/* Slippage */}
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

          {/* Quote details */}
          {quote && (
            <div className="bg-neutral-900/40 border border-green-500/15 rounded-xl p-3 space-y-1.5">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-neutral-500">Rate</span>
                <span className="text-neutral-300">
                  1 {quote.fromToken} = {(quote.toAmount / quote.fromAmount).toFixed(
                    quote.toToken === 'WBTC' ? 8 : 6
                  )} {quote.toToken}
                </span>
              </div>
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-neutral-500">Est. gas</span>
                <span className="text-neutral-400">{quote.estimateGasFee}</span>
              </div>
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-neutral-500">Route</span>
                <span className="text-neutral-400">OKX DEX Aggregator · 500+ sources</span>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl p-3">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div>
                <div className="text-xs text-red-400 font-medium">Error</div>
                <div className="text-[10px] text-red-400/70 mt-0.5">{error}</div>
              </div>
            </div>
          )}

          {/* Action buttons — progressive steps */}
          <div className="space-y-2">
            {/* Step 1: Get Quote */}
            {(step === 'idle' || step === 'error') && (
              <button
                onClick={getQuote}
                disabled={!amount || parseFloat(amount) <= 0}
                className="w-full py-3 bg-green-500/15 border border-green-500/30 rounded-xl text-sm font-medium text-green-400 hover:bg-green-500/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Get Swap Quote
              </button>
            )}

            {/* Step 1b: Loading quote */}
            {step === 'quoting' && (
              <button disabled className="w-full py-3 bg-neutral-800 border border-neutral-700 rounded-xl text-sm font-medium text-neutral-400 flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Finding best route...
              </button>
            )}

            {/* Step 2: Approve (only for ERC-20) */}
            {step === 'quoted' && !isNativeFrom && (
              <div className="space-y-2">
                <button
                  onClick={approveToken}
                  className="w-full py-3 bg-amber-500/15 border border-amber-500/30 rounded-xl text-sm font-medium text-amber-400 hover:bg-amber-500/25 transition-colors flex items-center justify-center gap-2"
                >
                  <span className="text-[9px] bg-amber-500/20 rounded-full w-5 h-5 flex items-center justify-center font-bold">1</span>
                  Approve {fromToken}
                </button>
                <div className="text-[9px] text-neutral-500 text-center">
                  Approve OKX DEX router to spend your {fromToken}
                </div>
              </div>
            )}

            {/* Step 2b: Approving... */}
            {step === 'approving' && (
              <button disabled className="w-full py-3 bg-neutral-800 border border-neutral-700 rounded-xl text-sm font-medium text-neutral-400 flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Approving {fromToken}...
              </button>
            )}

            {/* Step 3: Execute swap (shown after approve or immediately for native) */}
            {(step === 'approved' || (step === 'quoted' && isNativeFrom)) && (
              <button
                onClick={executeSwap}
                className="w-full py-3 bg-green-500/20 border border-green-500/40 rounded-xl text-sm font-bold text-green-400 hover:bg-green-500/30 transition-colors flex items-center justify-center gap-2"
              >
                <span className="text-[9px] bg-green-500/20 rounded-full w-5 h-5 flex items-center justify-center font-bold">
                  {isNativeFrom ? '✓' : '2'}
                </span>
                Swap {amount} {fromToken} → {quote?.toToken}
              </button>
            )}

            {/* Step 3b: Swapping... */}
            {step === 'swapping' && (
              <button disabled className="w-full py-3 bg-neutral-800 border border-neutral-700 rounded-xl text-sm font-medium text-neutral-400 flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                {isConfirming ? 'Confirming on-chain...' : 'Sending transaction...'}
              </button>
            )}
          </div>
        </>
      )}

      {/* Success state */}
      {step === 'confirmed' && quote && (
        <div className="bg-green-500/10 border border-green-500/25 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center">
              <Check className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <div className="text-sm font-bold text-green-400">Swap Confirmed!</div>
              <div className="text-[10px] text-neutral-400">Transaction executed on-chain</div>
            </div>
          </div>

          <div className="bg-neutral-900/40 rounded-lg p-3 space-y-1.5">
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-neutral-500">Swapped</span>
              <span className="text-neutral-200">{quote.fromAmount} {quote.fromToken}</span>
            </div>
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-neutral-500">Received</span>
              <span className="text-green-400 font-bold">{quote.toAmount.toFixed(6)} {quote.toToken}</span>
            </div>
          </div>

          {explorerUrl && (
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 text-xs text-green-400/70 hover:text-green-400 transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              View on Etherscan
            </a>
          )}

          <button
            onClick={reset}
            className="w-full py-2 text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
          >
            New Swap
          </button>
        </div>
      )}

      {/* Powered by badge */}
      <div className="flex items-center justify-center gap-2 pt-1">
        <span className="text-[10px] text-neutral-600">Powered by</span>
        <span className="text-[10px] font-bold text-green-400/80">OKX DEX Aggregator</span>
        <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-400/50">REAL SWAPS</span>
      </div>
    </div>
  );
}
