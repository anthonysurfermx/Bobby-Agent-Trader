// Tokenized Stocks on Base — Bobby's Builder Quest demo.
//
// The desk debates the underlying (Alpha / Red Team / CIO), the human decides,
// and if they want exposure the page prepares a USDC ⇄ B20 swap on Aerodrome
// that THEY sign in their own wallet. Bobby never holds keys or funds. Every
// guard (allowlist, ticket cap, oracle deviation, pause flags, US exclusion)
// lives server-side in /api/b20-quote; this page only renders its verdict.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import { useAccount, useSendTransaction, useSwitchChain, useWaitForTransactionReceipt, usePublicClient } from 'wagmi';
import { useAppKit } from '@reown/appkit/react';
import type { Hex } from 'viem';
import KineticShell from '@/components/kinetic/KineticShell';

const BASE_CHAIN_ID = 8453;
const ATTEST_KEY = 'bobby.b20.attested';

interface TokenRow {
  address: string;
  symbol: string;
  underlying: string;
  name: string;
  decimals?: number;
  multiplier?: number;
  pausedFeatures?: string;
  transferPaused?: boolean;
  reference?: { price: number | null; ageSec: number | null; stale: boolean };
  dexPrice: number | null;
  deviationPct: number | null;
  warnings: string[];
}

interface Quote {
  token: TokenRow;
  side: 'buy' | 'sell';
  amountIn: string;
  amountOut: string;
  minAmountOut: string;
  executionPrice: number;
  deviationPct: number | null;
  ticksCrossed: number;
  feeBps: number;
  slippagePct: number;
  venue: { name: string; router: string };
  tx: null | { chainId: number; approve: { to: string; data: string } | null; swap: { to: string; data: string }; deadline: number };
  txWithheld: string[];
  warnings: string[];
  limits: { maxTicketUsdc: number; minTicketUsdc: number };
}

interface Pulse {
  signal?: string | null;
  direction?: string | null;
  conviction_pct?: number | null;
  overview?: string | null;
  trade_plan?: { entry?: number | null; stop?: number | null; target?: number | null; rewardRisk?: number | null } | null;
  source?: string;
}

interface Debate {
  market?: { price?: number; change_24h_pct?: number | null };
  technicals?: { trend?: string; momentum?: string; rsi14?: number | null; support?: number | null; resistance?: number | null } | null;
  technical_pulse?: Pulse | null;
  quick_brief?: { summary?: string; risk?: string } | null;
}

type Step = 'idle' | 'quoting' | 'quoted' | 'approving' | 'swapping' | 'done' | 'error';

const fmt = (n: number | null | undefined, d = 2) => (n === null || n === undefined || !Number.isFinite(n) ? '—' : n.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d }));

export default function TokenizedStocksPage() {
  const [rows, setRows] = useState<TokenRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attested, setAttested] = useState(false);
  const [selected, setSelected] = useState<string>('NVDAc');
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [amount, setAmount] = useState('100');
  const [slippage, setSlippage] = useState('0.5');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [step, setStep] = useState<Step>('idle');
  const [stepError, setStepError] = useState<string | null>(null);
  const [debates, setDebates] = useState<Record<string, { loading: boolean; data?: Debate; error?: string }>>({});
  const [txHash, setTxHash] = useState<Hex | undefined>();

  const { address, isConnected, chain } = useAccount();
  const { open: openWallet } = useAppKit();
  const { switchChainAsync } = useSwitchChain();
  const { sendTransactionAsync } = useSendTransaction();
  const publicClient = usePublicClient({ chainId: BASE_CHAIN_ID });
  const receipt = useWaitForTransactionReceipt({ hash: txHash, chainId: BASE_CHAIN_ID });

  useEffect(() => {
    try { setAttested(localStorage.getItem(ATTEST_KEY) === '1'); } catch { /* private mode */ }
  }, []);

  const loadBoard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/b20-quote?list=1');
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || `board ${res.status}`);
      setRows(data.tokens as TokenRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'board unavailable');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadBoard(); }, [loadBoard]);

  const current = useMemo(() => rows.find((r) => r.symbol === selected) ?? rows[0], [rows, selected]);

  const askDesk = useCallback(async (row: TokenRow) => {
    setDebates((d) => ({ ...d, [row.symbol]: { loading: true } }));
    try {
      const res = await fetch('/api/voice-tool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: 'run_debate', args: { symbol: row.underlying, lang: 'en' } }),
      });
      const data = (await res.json()) as Debate & { error?: string };
      if (!res.ok || data.error) throw new Error(data.error || `desk ${res.status}`);
      setDebates((d) => ({ ...d, [row.symbol]: { loading: false, data } }));
    } catch (e) {
      setDebates((d) => ({ ...d, [row.symbol]: { loading: false, error: e instanceof Error ? e.message : 'desk unavailable' } }));
    }
  }, []);

  const getQuote = useCallback(async () => {
    if (!current) return;
    setStep('quoting');
    setStepError(null);
    setQuote(null);
    setTxHash(undefined);
    try {
      const params = new URLSearchParams({ token: current.symbol, amount, side, slippage });
      if (address) params.set('recipient', address);
      if (attested) params.set('attest', '1');
      const res = await fetch(`/api/b20-quote?${params}`);
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || `quote ${res.status}`);
      setQuote(data as Quote);
      setStep('quoted');
    } catch (e) {
      setStepError(e instanceof Error ? e.message : 'quote failed');
      setStep('error');
    }
  }, [current, amount, side, slippage, address, attested]);

  const ensureBase = useCallback(async () => {
    if (chain?.id !== BASE_CHAIN_ID) await switchChainAsync({ chainId: BASE_CHAIN_ID });
  }, [chain?.id, switchChainAsync]);

  const signSwap = useCallback(async () => {
    if (!quote?.tx || !address || !publicClient) return;
    setStepError(null);
    try {
      await ensureBase();
      if (quote.tx.approve) {
        setStep('approving');
        const approveHash = await sendTransactionAsync({ to: quote.tx.approve.to as Hex, data: quote.tx.approve.data as Hex, chainId: BASE_CHAIN_ID });
        await publicClient.waitForTransactionReceipt({ hash: approveHash });
      }
      setStep('swapping');
      // Dry run with the human's own address before asking for a signature:
      // a swap that would revert never reaches the wallet.
      await publicClient.call({ account: address, to: quote.tx.swap.to as Hex, data: quote.tx.swap.data as Hex });
      const hash = await sendTransactionAsync({ to: quote.tx.swap.to as Hex, data: quote.tx.swap.data as Hex, chainId: BASE_CHAIN_ID });
      setTxHash(hash);
      setStep('done');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'transaction failed';
      setStepError(msg.split('\n')[0].slice(0, 220));
      setStep('error');
    }
  }, [quote, address, publicClient, ensureBase, sendTransactionAsync]);

  const attest = () => {
    try { localStorage.setItem(ATTEST_KEY, '1'); } catch { /* ignore */ }
    setAttested(true);
  };

  return (
    <KineticShell minimalNav>
      <Helmet><title>Tokenized Stocks on Base | Bobby Agent Trader</title></Helmet>
      <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
        <motion.header initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
          <div className="text-[11px] font-mono tracking-[0.2em] text-green-400/80">BASE // TOKENIZED STOCKS · BUILDER QUEST</div>
          <h1 className="text-2xl md:text-3xl font-semibold text-white">Bobby debates the stock. You sign the swap.</h1>
          <p className="text-sm text-white/60 max-w-3xl">
            Coinbase-issued B20 tokens on Base, quoted live on Aerodrome and checked against Chainlink. Three agents argue the
            underlying, the CIO gives a verdict, and if you want exposure the page prepares a USDC ⇄ stock swap that only your wallet can execute.
            Bobby never holds keys, funds, or your exchange.
          </p>
        </motion.header>

        {!attested && (
          <section className="bg-white/[0.02] border border-amber-400/30 rounded-xl p-5 space-y-3">
            <div className="text-amber-300 font-mono text-xs tracking-widest">ELIGIBILITY</div>
            <p className="text-sm text-white/75">
              Coinbase tokenized stocks are offered under Regulation S and are <span className="text-white">not available to US persons</span> or in
              restricted jurisdictions. Quotes are informational for everyone; swap calldata is only prepared after you confirm the statements below.
              This is analysis, not advice. You decide and you own the risk.
            </p>
            <ul className="text-sm text-white/70 list-disc pl-5 space-y-1">
              <li>I am not a US person and I am not located in the United States.</li>
              <li>I am eligible to hold these tokens in my jurisdiction and I have read the issuer's terms.</li>
              <li>I understand Bobby prepares transactions and never executes, holds, or custodies anything.</li>
            </ul>
            <button onClick={attest} className="px-4 py-2 rounded-lg bg-amber-400/15 border border-amber-400/40 text-amber-200 text-sm hover:bg-amber-400/25 transition">
              I confirm all three
            </button>
          </section>
        )}

        {error && <div className="text-red-400 text-sm font-mono">{error}</div>}

        <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {loading && rows.length === 0 && [0, 1, 2, 3].map((i) => <div key={i} className="h-44 rounded-xl bg-white/[0.02] border border-white/[0.04] animate-pulse" />)}
          {rows.map((row, i) => {
            const active = current?.symbol === row.symbol;
            const debate = debates[row.symbol];
            const pulse = debate?.data?.technical_pulse;
            return (
              <motion.div
                key={row.address}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className={`rounded-xl p-4 border transition cursor-pointer ${active ? 'bg-green-400/[0.06] border-green-400/40' : 'bg-white/[0.02] border-white/[0.04] hover:border-white/10'}`}
                onClick={() => { setSelected(row.symbol); setQuote(null); setStep('idle'); }}
              >
                <div className="flex items-baseline justify-between">
                  <div>
                    <div className="text-white font-semibold">{row.symbol}</div>
                    <div className="text-[11px] text-white/50">{row.name}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-white font-mono">${fmt(row.dexPrice)}</div>
                    <div className="text-[10px] text-white/40 font-mono">DEX · 100 USDC</div>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-[11px] font-mono">
                  <div><div className="text-white/40">CHAINLINK</div><div className="text-white/80">${fmt(row.reference?.price)}</div></div>
                  <div><div className="text-white/40">DEVIATION</div><div className={Math.abs(row.deviationPct ?? 0) > 1 ? 'text-amber-300' : 'text-white/80'}>{row.deviationPct === null ? '—' : `${row.deviationPct >= 0 ? '+' : ''}${fmt(row.deviationPct)}%`}</div></div>
                  <div><div className="text-white/40">MULTIPLIER</div><div className="text-white/80">{row.multiplier ?? '—'}×</div></div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {row.transferPaused && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-300 border border-red-500/30">TRANSFERS PAUSED</span>}
                  {row.reference?.stale && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-400/10 text-amber-300 border border-amber-400/30">FEED STALE</span>}
                  {!row.transferPaused && !row.reference?.stale && <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-400/10 text-green-300 border border-green-400/30">LIVE</span>}
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); void askDesk(row); }}
                  disabled={debate?.loading}
                  className="mt-3 w-full text-[11px] font-mono tracking-widest py-1.5 rounded-lg border border-white/10 text-white/80 hover:border-green-400/40 hover:text-green-300 transition disabled:opacity-50"
                >
                  {debate?.loading ? 'DESK RUNNING…' : pulse ? 'RE-RUN THE DESK' : `ASK THE DESK · ${row.underlying}`}
                </button>
                {debate?.error && <div className="mt-2 text-[11px] text-red-400">{debate.error}</div>}
                {debate?.data && (
                  <div className="mt-3 space-y-1 text-[11px]">
                    <div className="flex items-center justify-between font-mono">
                      <span className={pulse?.direction === 'long' ? 'text-green-300' : pulse?.direction === 'short' ? 'text-red-300' : 'text-white/60'}>
                        {pulse ? `${(pulse.signal ?? 'neutral').toUpperCase()} · ${pulse.conviction_pct ?? 0}% conviction` : 'NO PULSE'}
                      </span>
                      <span className="text-white/40">{debate.data.technicals?.trend ?? ''} · RSI {fmt(debate.data.technicals?.rsi14 ?? null, 0)}</span>
                    </div>
                    {pulse?.trade_plan?.entry ? (
                      <div className="font-mono text-white/70">entry {fmt(pulse.trade_plan.entry)} · stop {fmt(pulse.trade_plan.stop)} · target {fmt(pulse.trade_plan.target)} · R:R {fmt(pulse.trade_plan.rewardRisk ?? null, 1)}</div>
                    ) : (
                      <div className="font-mono text-white/50">NO TRADE — no clean setup at this conviction. That also counts.</div>
                    )}
                    {debate.data.quick_brief?.summary && <div className="text-white/60">{debate.data.quick_brief.summary}</div>}
                  </div>
                )}
              </motion.div>
            );
          })}
        </section>

        {current && (
          <section className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-[11px] font-mono tracking-widest text-white/60">PREPARE A SWAP · {current.symbol} ⇄ USDC · AERODROME SLIPSTREAM</div>
              {!isConnected ? (
                <button onClick={() => openWallet()} className="text-xs px-3 py-1.5 rounded-lg bg-green-400 text-black font-semibold">Connect wallet</button>
              ) : (
                <div className="text-xs font-mono text-white/60">{address?.slice(0, 6)}…{address?.slice(-4)} · {chain?.id === BASE_CHAIN_ID ? 'Base' : `switch to Base`}</div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="flex rounded-lg overflow-hidden border border-white/10">
                {(['buy', 'sell'] as const).map((s) => (
                  <button key={s} onClick={() => { setSide(s); setQuote(null); setStep('idle'); }} className={`flex-1 py-2 text-xs font-mono tracking-widest ${side === s ? 'bg-green-400/15 text-green-300' : 'text-white/50'}`}>
                    {s === 'buy' ? `BUY ${current.symbol}` : `SELL ${current.symbol}`}
                  </button>
                ))}
              </div>
              <label className="text-xs text-white/60 font-mono">
                {side === 'buy' ? 'USDC IN' : `${current.symbol} IN`}
                <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className="mt-1 w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white font-mono" />
              </label>
              <label className="text-xs text-white/60 font-mono">
                SLIPPAGE %
                <select value={slippage} onChange={(e) => setSlippage(e.target.value)} className="mt-1 w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white font-mono">
                  {['0.1', '0.5', '1', '2'].map((v) => <option key={v} value={v}>{v}%</option>)}
                </select>
              </label>
              <div className="flex items-end">
                <button onClick={() => void getQuote()} disabled={step === 'quoting'} className="w-full py-2 rounded-lg border border-green-400/40 text-green-300 font-mono text-xs tracking-widest hover:bg-green-400/10 disabled:opacity-50">
                  {step === 'quoting' ? 'QUOTING…' : 'GET QUOTE'}
                </button>
              </div>
            </div>

            {stepError && <div className="text-red-400 text-xs font-mono">{stepError}</div>}

            {quote && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs font-mono">
                  <div><div className="text-white/40">YOU RECEIVE</div><div className="text-white">{fmt(Number(quote.amountOut), side === 'buy' ? 5 : 2)} {side === 'buy' ? current.symbol : 'USDC'}</div></div>
                  <div><div className="text-white/40">MIN AFTER SLIPPAGE</div><div className="text-white/80">{fmt(Number(quote.minAmountOut), side === 'buy' ? 5 : 2)}</div></div>
                  <div><div className="text-white/40">PRICE</div><div className="text-white">${fmt(quote.executionPrice)}</div></div>
                  <div><div className="text-white/40">VS CHAINLINK</div><div className={Math.abs(quote.deviationPct ?? 0) > 1 ? 'text-amber-300' : 'text-white/80'}>{quote.deviationPct === null ? '—' : `${quote.deviationPct >= 0 ? '+' : ''}${fmt(quote.deviationPct)}%`}</div></div>
                  <div><div className="text-white/40">FEE</div><div className="text-white/80">{quote.feeBps / 100}% · {quote.ticksCrossed} tick{quote.ticksCrossed === 1 ? '' : 's'}</div></div>
                </div>
                {quote.warnings.map((w) => <div key={w} className="text-[11px] text-amber-300 font-mono">⚠ {w}</div>)}
                {quote.txWithheld.length > 0 && (
                  <div className="text-[11px] font-mono text-white/60 space-y-1">
                    <div className="text-white/40">CALLDATA WITHHELD</div>
                    {quote.txWithheld.map((w) => <div key={w}>· {w}</div>)}
                  </div>
                )}
                {quote.tx && (
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      onClick={() => void signSwap()}
                      disabled={!isConnected || step === 'approving' || step === 'swapping'}
                      className="px-4 py-2 rounded-lg bg-green-400 text-black text-xs font-mono tracking-widest font-semibold disabled:opacity-50"
                    >
                      {step === 'approving' ? 'APPROVE IN WALLET…' : step === 'swapping' ? 'SIGN SWAP IN WALLET…' : quote.tx.approve ? 'APPROVE + SWAP IN MY WALLET' : 'SWAP IN MY WALLET'}
                    </button>
                    <span className="text-[11px] text-white/40 font-mono">router {quote.venue.router.slice(0, 8)}… · deadline 20 min · simulated with your address before signing</span>
                  </div>
                )}
                {txHash && (
                  <div className="text-xs font-mono">
                    <a className="text-green-300 underline" href={`https://basescan.org/tx/${txHash}`} target="_blank" rel="noreferrer">
                      {receipt.isSuccess ? 'Confirmed on Base' : receipt.isError ? 'Reverted' : 'Pending'} · {txHash.slice(0, 10)}…
                    </a>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        <footer className="text-[11px] text-white/40 font-mono leading-relaxed space-y-1">
          <div>Non-custodial, user-signed execution. Bobby prepares calldata and never signs, holds funds, or touches your exchange. Ticket cap 500 USDC per swap during the quest.</div>
          <div>Tokenized stocks are issued by Coinbase under Regulation S for eligible non-US persons; availability depends on your jurisdiction. Analysis, not advice.</div>
        </footer>
      </div>
    </KineticShell>
  );
}
