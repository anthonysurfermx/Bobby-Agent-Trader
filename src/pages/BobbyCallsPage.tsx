// /protocol/calls — the public, verifiable calls ledger (mainnet blocker #2).
// Proofs, not a dashboard: every call links its commit/resolve/challenge tx
// and its Pyth evidence. Clearly labeled CANARY while it points at Sepolia.
import { useCallback, useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft, ArrowUpRight, ShieldCheck, Swords } from 'lucide-react';
import { useAccount, useSwitchChain, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { useAppKit } from '@reown/appkit/react';

const BASE_SEPOLIA_ID = 84532;
const PYTH_FEE_BUFFER = 20_000_000_000_000n; // contract refunds the excess
const CHALLENGE_ABI = [
  {
    type: 'function',
    name: 'challengeStopBreach',
    stateMutability: 'payable',
    inputs: [
      { name: '_debateHash', type: 'bytes32' },
      { name: '_anchorTs', type: 'uint64' },
      { name: '_breachUpdateData', type: 'bytes[]' },
    ],
    outputs: [],
  },
] as const;

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

interface ScanResult {
  verdict: string;
  detail: string;
  symbol?: string;
  stopPrice?: string;
  tickPrice?: string;
  tickPublishTime?: number;
  castCommand?: string;
  updateData?: string;
  error?: string;
}

export default function BobbyCallsPage() {
  const [data, setData] = useState<CallsPayload | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [challenging, setChallenging] = useState<CallRow | null>(null);
  const [anchorTs, setAnchorTs] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [scan, setScan] = useState<ScanResult | null>(null);

  const { isConnected, chainId } = useAccount();
  const { open: openWallet } = useAppKit();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync, isPending: submitting } = useWriteContract();
  const [challengeTxHash, setChallengeTxHash] = useState<`0x${string}` | undefined>();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const receipt = useWaitForTransactionReceipt({ hash: challengeTxHash, chainId: BASE_SEPOLIA_ID });

  const openChallenge = (call: CallRow) => {
    setChallenging(call);
    setAnchorTs(call.entryPublishTime || Math.floor(Date.now() / 1000) - 600);
    setScan(null);
    setChallengeTxHash(undefined);
    setSubmitError(null);
  };

  /** Submit the REAL challenge from the visitor's wallet — permissionless. */
  const submitChallenge = async () => {
    if (!challenging || !scan?.updateData || !data) return;
    setSubmitError(null);
    try {
      if (!isConnected) {
        openWallet();
        return;
      }
      if (chainId !== BASE_SEPOLIA_ID) await switchChainAsync({ chainId: BASE_SEPOLIA_ID });
      const hash = await writeContractAsync({
        address: data.contract as `0x${string}`,
        abi: CHALLENGE_ABI,
        functionName: 'challengeStopBreach',
        args: [challenging.debateHash as `0x${string}`, BigInt(anchorTs), [scan.updateData as `0x${string}`]],
        value: PYTH_FEE_BUFFER,
        chainId: BASE_SEPOLIA_ID,
      });
      setChallengeTxHash(hash);
    } catch (e) {
      setSubmitError((e as Error)?.message?.split('\n')[0]?.slice(0, 160) || 'wallet rejected');
    }
  };

  const runScan = async () => {
    if (!challenging) return;
    setScanning(true);
    setScan(null);
    try {
      const res = await fetch(`/api/challenge-scan?hash=${challenging.debateHash}&ts=${anchorTs}`);
      setScan((await res.json()) as ScanResult);
    } catch {
      setScan({ verdict: 'ERROR', detail: 'scan failed — retry shortly' });
    } finally {
      setScanning(false);
    }
  };

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

  // A mined challenge changes the ledger — re-read it.
  useEffect(() => {
    if (receipt.isSuccess) refresh();
  }, [receipt.isSuccess, refresh]);

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
                    {c.mode === 'VERIFIED' && !c.reclassified && (
                      <button
                        onClick={() => openChallenge(c)}
                        className="mt-1 inline-flex items-center gap-1 rounded border border-red-400/30 bg-red-400/10 px-2 py-1 font-bold text-red-300 transition hover:bg-red-400/20"
                      >
                        <Swords className="h-3 w-3" /> retar
                      </button>
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

        {challenging && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setChallenging(null)}>
            <div className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-white/15 bg-[#0a0a0f] p-6" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-[0.2em] text-red-300">
                  <Swords className="h-4 w-4" /> Retar {challenging.symbol}
                </div>
                <button onClick={() => setChallenging(null)} className="font-mono text-xs text-white/40 hover:text-white">cerrar ✕</button>
              </div>
              <p className="mt-3 text-sm leading-6 text-white/55">
                Elige un instante y el escáner busca el primer tick firmado de Pyth en ese punto,
                y <b className="text-white/80">simula el challenge contra el contrato real</b> — el
                veredicto lo da el contrato, no nosotros. Gratis, sin wallet, sin gas.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {([
                  ['entrada', challenging.entryPublishTime || 0],
                  ['+15 min', (challenging.entryPublishTime || 0) + 900],
                  ['+1 h', (challenging.entryPublishTime || 0) + 3600],
                  ['salida', challenging.exitPublishTime || 0],
                ] as Array<[string, number]>).filter(([, v]) => v > 0).map(([label, value]) => (
                  <button
                    key={label}
                    onClick={() => setAnchorTs(value)}
                    className={`rounded-full border px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.12em] transition ${anchorTs === value ? 'border-[#0052ff] bg-[#0052ff]/20 text-white' : 'border-white/15 bg-white/5 text-white/50 hover:text-white'}`}
                  >
                    {label}
                  </button>
                ))}
                <input
                  type="number"
                  value={anchorTs}
                  onChange={(e) => setAnchorTs(Number(e.target.value))}
                  className="w-40 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 font-mono text-xs text-white outline-none focus:border-[#0052ff]"
                  aria-label="anchor unix timestamp"
                />
              </div>
              <button
                onClick={runScan}
                disabled={scanning}
                className="mt-4 w-full rounded-lg bg-white px-6 py-3 font-mono text-xs font-bold uppercase tracking-[0.15em] text-black transition hover:bg-[#0052ff] hover:text-white disabled:opacity-40"
              >
                {scanning ? 'escaneando la cadena…' : 'escanear tick y simular challenge'}
              </button>

              {scan && (
                <div className={`mt-4 rounded-xl border p-4 ${scan.verdict === 'BREACH' ? 'border-red-400/40 bg-red-400/10' : scan.verdict === 'NO_BREACH' ? 'border-emerald-400/30 bg-emerald-400/10' : 'border-amber-400/30 bg-amber-400/10'}`}>
                  <div className={`font-mono text-sm font-bold tracking-[0.1em] ${scan.verdict === 'BREACH' ? 'text-red-300' : scan.verdict === 'NO_BREACH' ? 'text-emerald-300' : 'text-amber-300'}`}>
                    {scan.verdict === 'BREACH' ? '⚡ BREACH REAL' : scan.verdict === 'NO_BREACH' ? '✓ EL CALL AGUANTA' : scan.verdict}
                  </div>
                  {scan.tickPrice && (
                    <div className="mt-2 font-mono text-xs text-white/60">
                      tick ${Number(scan.tickPrice).toLocaleString('en-US')} @ pt {scan.tickPublishTime} · stop ${Number(scan.stopPrice).toLocaleString('en-US')}
                    </div>
                  )}
                  <p className="mt-2 text-sm leading-6 text-white/70">{scan.detail || scan.error}</p>
                  {scan.verdict === 'BREACH' && scan.updateData && (
                    <div className="mt-3 space-y-2">
                      {challengeTxHash ? (
                        <div className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-3">
                          <div className="font-mono text-xs font-bold text-emerald-300">
                            {receipt.isSuccess ? '✓ CHALLENGE MINADO — el call se reclasificó on-chain' : receipt.isError ? 'la tx revirtió — revisa en Basescan' : 'challenge enviado — esperando confirmación…'}
                          </div>
                          <a href={`https://sepolia.basescan.org/tx/${challengeTxHash}`} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 font-mono text-[11px] text-[#7da6ff] hover:text-white">
                            {short(challengeTxHash)} <ArrowUpRight className="h-3 w-3" />
                          </a>
                        </div>
                      ) : (
                        <button
                          onClick={submitChallenge}
                          disabled={submitting}
                          className="w-full rounded-lg bg-red-400 px-6 py-3 font-mono text-xs font-bold uppercase tracking-[0.15em] text-black transition hover:bg-red-300 disabled:opacity-40"
                        >
                          {submitting ? 'firma en tu wallet…' : isConnected ? (chainId === BASE_SEPOLIA_ID ? '⚡ mandar challenge on-chain' : '⚡ cambiar a base sepolia y mandar') : 'conectar wallet para retar'}
                        </button>
                      )}
                      {submitError && <p className="font-mono text-[11px] text-red-300">{submitError}</p>}
                      <p className="text-xs text-white/50">O mándalo tú por CLI — el contrato reclasifica igual (fee Pyth ~10 wei + gas Sepolia):</p>
                      <button
                        onClick={() => navigator.clipboard.writeText(scan.updateData || '')}
                        className="rounded border border-white/15 bg-white/5 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-white/70 hover:text-white"
                      >
                        copiar updateData ({Math.round((scan.updateData.length - 2) / 2)} bytes)
                      </button>
                      <pre className="overflow-x-auto rounded-lg bg-black/50 p-3 font-mono text-[10px] leading-4 text-white/60">{scan.castCommand}</pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        <p className="mt-10 font-mono text-[11px] leading-5 text-white/30">
          Contract{' '}
          <a href={`${data?.explorer || 'https://sepolia.basescan.org'}/address/${data?.contract || ''}`} target="_blank" rel="noreferrer" className="text-white/50 underline-offset-2 hover:underline">
            {data?.contract || '…'}
          </a>{' '}
          on {data?.chain.name || 'Base Sepolia'} · canary deployment — mainnet ships behind a 2-of-3 Safe.
          Analysis, not investment advice · <a href="/protocol/risk" className="text-white/50 underline-offset-2 hover:underline">risk & claims</a>
        </p>
      </div>
    </div>
  );
}
