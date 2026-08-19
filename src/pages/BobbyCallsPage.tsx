// /protocol/calls — the public, verifiable calls ledger (mainnet blocker #2).
// Proofs, not a dashboard: every call links its commit/resolve/challenge tx
// and its Pyth evidence. Clearly labeled CANARY while it points at Sepolia.
import { useCallback, useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft, ArrowUpRight, ShieldCheck, Swords } from 'lucide-react';

interface CallRow {
  debateHash: string;
  symbol: string;
  mode: string;
  conviction: number;
  committedAt: string | null;
  commitTx: string | null;
  entryOraclePrice: string | null;
  entryPublishTime: number | null;
  result: string;
  pnlBps: number | null;
  resolveTx: string | null;
  exitOraclePrice: string | null;
  exitPublishTime: number | null;
  reclassified: boolean;
  challengeTx: string | null;
}

interface CallsPayload {
  chain: { id: number; name: string; canary: boolean };
  contract: string;
  explorer: string;
  scorecard: {
    verified: { winRateBps: number; decided: number; resolved: number; expired: number; pending: number };
    attested: { winRateBps: number; resolved: number; expired: number; pending: number };
    totalCommitments: number;
  };
  calls: CallRow[];
}

const RESULT_STYLE: Record<string, string> = {
  WIN: 'text-emerald-400 border-emerald-400/30 bg-emerald-400/10',
  LOSS: 'text-red-400 border-red-400/30 bg-red-400/10',
  PENDING: 'text-white/60 border-white/15 bg-white/5',
  EXPIRED: 'text-amber-400 border-amber-400/30 bg-amber-400/10',
  BREAK_EVEN: 'text-white/70 border-white/20 bg-white/5',
};

function short(hash: string | null): string {
  return hash ? `${hash.slice(0, 10)}…${hash.slice(-6)}` : '—';
}

export default function BobbyCallsPage() {
  const [data, setData] = useState<CallsPayload | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/verified-calls', { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      setData((await res.json()) as CallsPayload);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = window.setInterval(refresh, 60_000);
    return () => window.clearInterval(t);
  }, [refresh]);

  const sc = data?.scorecard;
  const txUrl = (tx: string | null) => (tx && data ? `${data.explorer}/tx/${tx}` : undefined);

  return (
    <div className="min-h-screen bg-[#050505] text-white">
      <Helmet>
        <title>Verifiable calls — Bobby Protocol</title>
        <meta name="description" content="Every Bobby call anchored on-chain with signed Pyth evidence. Verify each one yourself — and challenge it." />
      </Helmet>
      <div className="pointer-events-none fixed inset-0 opacity-[0.05] [background-image:linear-gradient(rgba(255,255,255,.6)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.6)_1px,transparent_1px)] [background-size:52px_52px]" />

      <div className="relative mx-auto max-w-6xl px-5 py-12 lg:px-8">
        <a href="/protocol" className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.15em] text-white/50 transition hover:text-white">
          <ArrowLeft className="h-3.5 w-3.5" /> Bobby Protocol
        </a>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <h1 className="text-4xl font-extrabold tracking-[-0.06em] md:text-6xl">Verifiable <span className="text-[#0052ff]">calls.</span></h1>
          {data?.chain.canary && (
            <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-amber-300">
              Canary · {data.chain.name}
            </span>
          )}
        </div>
        <p className="mt-5 max-w-2xl text-lg leading-8 text-white/55">
          Every call commits BEFORE resolution with signed Pyth oracle evidence, and anyone can
          challenge a stop breach permissionlessly. VERIFIED (BTC/ETH/SOL, oracle-proven) and
          ATTESTED (self-reported) are separate ledgers that never mix.
        </p>

        <div className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-4">
          {[
            ['Verified win rate', sc && sc.verified.decided > 0 ? `${(sc.verified.winRateBps / 100).toFixed(1)}% (n=${sc.verified.decided})` : '—'],
            ['Verified resolved', sc ? String(sc.verified.resolved) : '—'],
            ['Pending', sc ? String(sc.verified.pending + sc.attested.pending) : '—'],
            ['Total commitments', sc ? String(sc.totalCommitments) : '—'],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-white/40">{label}</div>
              <div className="font-mono text-2xl font-bold tracking-[-0.04em]">{value}</div>
            </div>
          ))}
        </div>

        <div className="mt-10 overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full min-w-[900px] text-left">
            <thead>
              <tr className="border-b border-white/10 bg-white/[0.03] font-mono text-[10px] uppercase tracking-[0.16em] text-white/40">
                {['Asset', 'Mode', 'Committed', 'Oracle entry', 'Result', 'PnL', 'Proofs'].map((h) => (
                  <th key={h} className="px-4 py-3 font-bold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="font-mono text-sm">
              {loading && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-white/40">reading the chain…</td></tr>
              )}
              {error && !loading && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-red-400/80">on-chain read failed — retry shortly</td></tr>
              )}
              {!loading && !error && data?.calls.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-white/40">no calls committed yet</td></tr>
              )}
              {data?.calls.map((c) => (
                <tr key={c.debateHash} className="border-b border-white/5 align-top">
                  <td className="px-4 py-4 font-bold">{c.symbol}</td>
                  <td className="px-4 py-4">
                    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold tracking-[0.12em] ${c.mode === 'VERIFIED' ? 'border-[#0052ff]/40 bg-[#0052ff]/10 text-[#7da6ff]' : 'border-white/20 bg-white/5 text-white/60'}`}>
                      {c.mode}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-white/60">{c.committedAt ? new Date(c.committedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                  <td className="px-4 py-4 text-white/60">
                    {c.entryOraclePrice ? `$${Number(c.entryOraclePrice).toLocaleString('en-US', { maximumFractionDigits: 2 })}` : 'self-reported'}
                    {c.entryPublishTime && (
                      <div className="text-[10px] text-white/30">Pyth pt {c.entryPublishTime}</div>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold tracking-[0.12em] ${RESULT_STYLE[c.result] || RESULT_STYLE.PENDING}`}>{c.result}</span>
                    {c.reclassified && (
                      <div className="mt-1 inline-flex items-center gap-1 text-[10px] text-amber-300"><Swords className="h-3 w-3" /> reclassified by challenge</div>
                    )}
                  </td>
                  <td className={`px-4 py-4 ${c.pnlBps == null ? 'text-white/40' : c.pnlBps >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {c.pnlBps == null ? '—' : `${c.pnlBps >= 0 ? '+' : ''}${(c.pnlBps / 100).toFixed(2)}%`}
                  </td>
                  <td className="px-4 py-4 text-[11px]">
                    {[['commit', c.commitTx], ['resolve', c.resolveTx], ['challenge', c.challengeTx]].map(([label, tx]) =>
                      tx ? (
                        <a key={label} href={txUrl(tx as string)} target="_blank" rel="noreferrer" className="mb-1 flex items-center gap-1 text-[#7da6ff] transition hover:text-white">
                          {label} {short(tx as string)} <ArrowUpRight className="h-3 w-3" />
                        </a>
                      ) : null,
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
            <div className="mb-3 flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-[0.2em] text-[#7da6ff]">
              <ShieldCheck className="h-4 w-4" /> How to verify a call
            </div>
            <ol className="list-decimal space-y-2 pl-5 text-sm leading-6 text-white/60">
              <li>Open the <b className="text-white/80">commit tx</b> — it happened BEFORE resolution, with the entry anchored to a signed Pyth update (its publishTime is shown above).</li>
              <li>Open the <b className="text-white/80">resolve tx</b> — the exit price is checked on-chain against a Pyth benchmark update at the declared exit instant.</li>
              <li>Cross-check any price against Pyth&apos;s public benchmark API for the same publishTime. Same number, or the tx would have reverted.</li>
            </ol>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
            <div className="mb-3 flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-[0.2em] text-[#7da6ff]">
              <Swords className="h-4 w-4" /> Challenge a call
            </div>
            <p className="text-sm leading-6 text-white/60">
              Think a WIN crossed its stop? <b className="text-white/80">Anyone</b> can call{' '}
              <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs text-white/80">challengeStopBreach(debateHash, anchorTs, breachUpdate)</code>{' '}
              on the contract with a signed Pyth tick that crossed the committed stop. If the breach is
              real, the trade reclassifies to LOSS on-chain — no permission, no committee. A non-breaching
              tick simply reverts <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs text-white/80">NoBreach()</code>.
            </p>
            <a
              href={`${data?.explorer || 'https://sepolia.basescan.org'}/address/${data?.contract || ''}#writeContract`}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-4 py-2.5 font-mono text-xs font-bold uppercase tracking-[0.15em] text-white transition hover:bg-white/15"
            >
              Open contract on Basescan <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
            <p className="mt-3 text-xs text-white/35">One-click challenge UI is on the mainnet checklist — today the path is the contract itself.</p>
          </div>
        </div>

        <p className="mt-10 font-mono text-[11px] leading-5 text-white/30">
          Contract{' '}
          <a href={`${data?.explorer || 'https://sepolia.basescan.org'}/address/${data?.contract || ''}`} target="_blank" rel="noreferrer" className="text-white/50 underline-offset-2 hover:underline">
            {data?.contract || '…'}
          </a>{' '}
          on {data?.chain.name || 'Base Sepolia'} · canary deployment — mainnet ships behind a 2-of-3 Safe.
          Analysis, not investment advice.
        </p>
      </div>
    </div>
  );
}
