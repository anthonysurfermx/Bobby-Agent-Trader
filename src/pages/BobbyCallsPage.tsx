// /protocol/calls — the public, verifiable calls ledger (mainnet blocker #2).
// Proofs, not a dashboard: every call links its commit/resolve/challenge tx
// and its Pyth evidence. Clearly labeled CANARY while it points at Sepolia.
import { useCallback, useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import ProtocolLayout from '@/components/protocol/ProtocolLayout';
import { useProtocolLanguage } from '@/components/protocol/useProtocolLanguage';
import { ArrowUpRight, ShieldCheck, Swords } from 'lucide-react';
import { useAccount, useSwitchChain, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { useAppKit } from '@reown/appkit/react';
import { BOBBY_BASE_MAINNET, bobbyBaseAddressUrl } from '@/config/chains';

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
  PENDING: 'text-[#A39C91] border-white/15 bg-white/5',
  EXPIRED: 'text-amber-400 border-amber-400/30 bg-amber-400/10',
  BREAK_EVEN: 'text-[#A39C91] border-white/20 bg-white/5',
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
  const { t, locale } = useProtocolLanguage();
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
    <ProtocolLayout active="calls" wide>
      <Helmet>
        <title>{t("Verifiable calls — Bobby Protocol", "Señales verificables — Bobby Protocol", "Sinais verificáveis — Bobby Protocol")}</title>
        <meta name="description" content="Every Bobby call anchored on-chain with signed Pyth evidence. Verify each one yourself — and challenge it." />
      </Helmet>


      <div className="protocol-content">


        <header className="protocol-hero">
          <div className="mb-6 flex flex-wrap items-center gap-4">
            <p className="protocol-eyebrow">{t("Evidence / Verifiable calls", "Evidencia / Señales verificables", "Evidência / Sinais verificáveis")}</p>
            {data?.chain.canary && (
              <span className="rounded-full border border-amber-400/25 bg-amber-400/[0.06] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-amber-300">{t(" Canary · ", " Canario · ", " Canário · ")}{data.chain.name}
              </span>
            )}
          </div>
          <h1 className="protocol-title">{t("Every call.", "Cada señal.", "Cada sinal.")}<br /><span className="text-[#A39C91]">{t("Open to challenge.", "Abierta a un desafío.", "Aberto a um desafio.")}</span></h1>
          <p className="protocol-lead">{t(" Every call commits BEFORE resolution with signed Pyth oracle evidence, and anyone can challenge a stop breach permissionlessly. VERIFIED (BTC/ETH/SOL, oracle-proven) and ATTESTED (self-reported) are separate ledgers that never mix. ", " Cada señal se registra ANTES de resolverse con evidencia firmada del oráculo Pyth. Cualquiera puede desafiar un cruce del stop sin permiso. VERIFIED (BTC/ETH/SOL, probado por oráculo) y ATTESTED (autodeclarado) son registros separados que nunca se mezclan. ", " Cada sinal é registrado ANTES da resolução com evidência assinada do oráculo Pyth. Qualquer pessoa pode desafiar um cruzamento do stop sem permissão. VERIFIED (BTC/ETH/SOL, comprovado por oráculo) e ATTESTED (autodeclarado) são registros separados que nunca se misturam. ")}</p>
        </header>

        <a
          href={bobbyBaseAddressUrl(BOBBY_BASE_MAINNET.contracts.trackRecord)}
          target="_blank"
          rel="noreferrer"
          className="protocol-panel group block p-6 transition hover:border-[#d6c6ed]/30 md:p-8"
        >
          <div className="protocol-eyebrow flex items-center justify-between gap-4">{t("Base mainnet · chain 8453 ", "Base mainnet · red 8453 ", "Base mainnet · rede 8453 ")}<ArrowUpRight className="h-4 w-4 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" /></div>
          <p className="mt-2 text-sm leading-6 text-[#A39C91]">{t("The seven-contract proof layer is deployed. This table intentionally preserves the completed Sepolia canary evidence while mainnet writes remain frozen for Safe acceptance, verification and soak.", "La capa de pruebas de siete contratos está desplegada. Esta tabla conserva la evidencia del canario completado en Sepolia mientras las escrituras en mainnet permanecen congeladas hasta la aceptación del Safe, la verificación y la observación.", "A camada de provas de sete contratos está implantada. Esta tabela preserva a evidência do canário concluído na Sepolia enquanto as escritas na mainnet permanecem congeladas até a aceitação do Safe, verificação e observação.")}</p>
          <div className="mt-4 break-all font-mono text-[11px] leading-6 text-[#8A8378]">TrackRecord V2 · {BOBBY_BASE_MAINNET.contracts.trackRecord}</div>
        </a>

        <div className="my-10 grid grid-cols-2 gap-3 md:gap-5 md:grid-cols-4">
          {[
            ['Verified win rate', sc && sc.verified.decided > 0 ? `${(sc.verified.winRateBps / 100).toFixed(1)}% (n=${sc.verified.decided})` : '—'],
            ['Verified resolved', sc ? String(sc.verified.resolved) : '—'],
            ['Pending', sc ? String(sc.verified.pending + sc.attested.pending) : '—'],
            ['Total commitments', sc ? String(sc.totalCommitments) : '—'],
          ].map(([label, value]) => (
            <div key={label} className="protocol-panel min-w-0 p-5 md:p-6">
              <div className="mb-5 font-mono text-[10px] uppercase tracking-[0.14em] text-[#8A8378]">{label}</div>
              <div className="text-xl font-light tracking-[-0.04em] sm:text-3xl">{value}</div>
            </div>
          ))}
        </div>

        <section className="protocol-section">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="protocol-eyebrow mb-3">{t("The public ledger", "El registro público", "O registro público")}</p>
              <h2 className="protocol-section-title">{t("Inspect the evidence.", "Examina la evidencia.", "Examine a evidência.")}</h2>
            </div>
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#8A8378]">{t("Refreshes every 60 seconds", "Se actualiza cada 60 segundos", "Atualiza a cada 60 segundos")}</span>
          </div>
        <div className="protocol-panel overflow-x-auto">
          <table className="w-full min-w-[900px] text-left">
            <thead>
              <tr className="border-b border-[#F2EDE4]/10 bg-white/[0.03] font-mono text-[10px] uppercase tracking-[0.16em] text-[#A39C91]">
                {['Asset', 'Mode', 'Committed', 'Oracle entry', 'Result', 'PnL', 'Proofs'].map((h) => (
                  <th key={h} className="px-5 py-5 font-normal">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="font-mono text-sm">
              {loading && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-[#A39C91]">{t("reading the chain…", "leyendo la cadena…", "lendo a rede…")}</td></tr>
              )}
              {error && !loading && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-red-400/80">{t("on-chain read failed — retry shortly", "falló la lectura on-chain; reintenta pronto", "a leitura on-chain falhou; tente novamente em breve")}</td></tr>
              )}
              {!loading && !error && data?.calls.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-[#A39C91]">{t("no calls committed yet", "aún no hay señales registradas", "ainda não há sinais registrados")}</td></tr>
              )}
              {data?.calls.map((c) => (
                <tr key={c.debateHash} className="border-b border-[#F2EDE4]/[0.06] align-top">
                  <td className="px-5 py-5 font-bold">{c.symbol}</td>
                  <td className="px-5 py-5">
                    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold tracking-[0.12em] ${c.mode === 'VERIFIED' ? 'border-[#c4addf]/40 bg-[#b59bd2]/10 text-[#d6c6ed]' : 'border-white/20 bg-white/5 text-[#A39C91]'}`}>
                      {c.mode}
                    </span>
                  </td>
                  <td className="px-5 py-5 text-[#A39C91]">{c.committedAt ? new Date(c.committedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                  <td className="px-5 py-5 text-[#A39C91]">
                    {c.entryOraclePrice ? `$${Number(c.entryOraclePrice).toLocaleString('en-US', { maximumFractionDigits: 2 })}` : 'self-reported'}
                    {c.entryPublishTime && (
                      <div className="text-[10px] text-[#A39C91]">Pyth pt {c.entryPublishTime}</div>
                    )}
                  </td>
                  <td className="px-5 py-5">
                    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold tracking-[0.12em] ${RESULT_STYLE[c.result] || RESULT_STYLE.PENDING}`}>{c.result}</span>
                    {c.reclassified && (
                      <div className="mt-1 inline-flex items-center gap-1 text-[10px] text-amber-300"><Swords className="h-3 w-3" />{t(" reclassified by challenge", " reclasificado por un desafío", " reclassificado por um desafio")}</div>
                    )}
                  </td>
                  <td className={`px-5 py-5 ${c.pnlBps == null ? 'text-[#A39C91]' : c.pnlBps >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {c.pnlBps == null ? '—' : `${c.pnlBps >= 0 ? '+' : ''}${(c.pnlBps / 100).toFixed(2)}%`}
                  </td>
                  <td className="px-5 py-5 text-[11px]">
                    {[['commit', c.commitTx], ['resolve', c.resolveTx], ['challenge', c.challengeTx]].map(([label, tx]) =>
                      tx ? (
                        <a key={label} href={txUrl(tx as string)} target="_blank" rel="noreferrer" className="mb-1 flex items-center gap-1 text-[#d6c6ed] transition hover:text-white">
                          {label} {short(tx as string)} <ArrowUpRight className="h-3 w-3" />
                        </a>
                      ) : null,
                    )}
                    {c.mode === 'VERIFIED' && !c.reclassified && (
                      <button
                        onClick={() => openChallenge(c)}
                        className="mt-1 inline-flex items-center gap-1 rounded border border-red-400/30 bg-red-400/10 px-2 py-1 font-bold text-red-300 transition hover:bg-red-400/20"
                      >
                        <Swords className="h-3 w-3" />{t(" challenge ", " desafiar ", " desafiar ")}</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </section>

        <div className="mt-12 grid gap-6 md:grid-cols-2">
          <div className="protocol-panel p-6 md:p-8">
            <div className="mb-3 flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-[0.2em] text-[#d6c6ed]">
              <ShieldCheck className="h-4 w-4" />{t(" How to verify a call ", " Cómo verificar una señal ", " Como verificar um sinal ")}</div>
            <ol className="list-decimal space-y-2 pl-5 text-sm leading-6 text-[#A39C91]">
              <li>{t("Open the ", "Abre la ", "Abra a ")}<b className="text-[#F2EDE4]">{t("commit tx", "transacción de registro", "transação de registro")}</b>{t(" — it happened BEFORE resolution, with the entry anchored to a signed Pyth update (its publishTime is shown above).", " — ocurrió ANTES de la resolución, con la entrada anclada a una actualización firmada de Pyth (su publishTime aparece arriba).", " — ocorreu ANTES da resolução, com a entrada ancorada em uma atualização assinada da Pyth (o publishTime aparece acima).")}</li>
              <li>{t("Open the ", "Abre la ", "Abra a ")}<b className="text-[#F2EDE4]">{t("resolve tx", "transacción de resolución", "transação de resolução")}</b>{t(" — the exit price is checked on-chain against a Pyth benchmark update at the declared exit instant.", " — el precio de salida se verifica on-chain contra una referencia de Pyth en el instante de salida declarado.", " — o preço de saída é verificado on-chain contra uma referência da Pyth no instante de saída declarado.")}</li>
              <li>{t("Cross-check any price against Pyth's public benchmark API for the same publishTime. Same number, or the tx would have reverted.", "Contrasta cualquier precio con la API pública de referencia de Pyth para el mismo publishTime. El número debe coincidir o la transacción habría revertido.", "Compare qualquer preço com a API pública de referência da Pyth para o mesmo publishTime. O número deve coincidir ou a transação teria revertido.")}</li>
            </ol>
          </div>
          <div className="protocol-panel p-6 md:p-8">
            <div className="mb-3 flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-[0.2em] text-[#d6c6ed]">
              <Swords className="h-4 w-4" />{t(" Challenge a call ", " Desafía una señal ", " Desafie um sinal ")}</div>
            <p className="text-sm leading-6 text-[#A39C91]">{t(" Think a WIN crossed its stop? ", " ¿Crees que un WIN cruzó su stop? ", " Acha que um WIN cruzou seu stop? ")}<b className="text-[#F2EDE4]">{t("Anyone", "Cualquiera", "Qualquer pessoa")}</b>{t(" can call", " puede llamar a", " pode chamar")}{' '}
              <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs text-[#F2EDE4]">challengeStopBreach(debateHash, anchorTs, breachUpdate)</code>{' '}{t(" on the contract with a signed Pyth tick that crossed the committed stop. If the breach is real, the trade reclassifies to LOSS on-chain — no permission, no committee. A non-breaching tick simply reverts ", " en el contrato con un tick firmado de Pyth que haya cruzado el stop registrado. Si el cruce es real, la operación se reclasifica a LOSS on-chain, sin permiso ni comité. Un tick sin cruce simplemente revierte con ", " no contrato com um tick assinado da Pyth que tenha cruzado o stop registrado. Se o cruzamento for real, a operação é reclassificada para LOSS on-chain, sem permissão ou comitê. Um tick sem cruzamento simplesmente reverte com ")}<code className="rounded bg-white/10 px-1.5 py-0.5 text-xs text-[#F2EDE4]">NoBreach()</code>.
            </p>
            <a
              href={`${data?.explorer || 'https://sepolia.basescan.org'}/address/${data?.contract || ''}#writeContract`}
              target="_blank"
              rel="noreferrer"
              className="protocol-button-secondary mt-6 inline-flex items-center gap-2"
            >{t(" Open contract on Basescan ", " Abrir contrato en Basescan ", " Abrir contrato no Basescan ")}<ArrowUpRight className="h-3.5 w-3.5" />
            </a>
            <p className="mt-3 text-xs text-[#A39C91]">{t("This challenge interface targets the completed Base Sepolia canary. Mainnet challenges unlock with production writes.", "Esta interfaz de desafíos apunta al canario completado en Base Sepolia. Los desafíos en mainnet se habilitarán junto con las escrituras en producción.", "Esta interface de desafios aponta para o canário concluído na Base Sepolia. Os desafios na mainnet serão habilitados junto com as escritas em produção.")}</p>
          </div>
        </div>

        {challenging && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setChallenging(null)}>
            <div className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-[28px] border border-[#F2EDE4]/15 bg-[#15121C] p-6 md:p-8" role="dialog" aria-modal="true" aria-label={`Challenge ${challenging.symbol}`} onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-[0.2em] text-red-300">
                  <Swords className="h-4 w-4" />{t(" Challenge ", " Desafiar ", " Desafiar ")}{challenging.symbol}
                </div>
                <button onClick={() => setChallenging(null)} className="font-mono text-xs text-[#A39C91] hover:text-white">{t("close ✕", "cerrar ✕", "fechar ✕")}</button>
              </div>
              <p className="mt-3 text-sm leading-6 text-[#A39C91]">{t(" Choose an instant. The scanner finds the first signed Pyth tick at that point and ", " Elige un instante y el escáner busca el primer tick firmado de Pyth en ese punto, y ", " Escolha um instante e o scanner busca o primeiro tick assinado da Pyth nesse ponto, e ")}<b className="text-[#F2EDE4]">{t("simulates the challenge against the real contract", "simula el desafío contra el contrato real", "simula o desafio contra o contrato real")}</b>{t(" — the contract gives the verdict, not us. Free, no wallet, no gas. ", " — el veredicto lo da el contrato, no nosotros. Gratis, sin wallet, sin gas. ", " — o veredicto vem do contrato, não de nós. Grátis, sem carteira, sem gas. ")}</p>
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
                    className={`rounded-full border px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.12em] transition ${anchorTs === value ? 'border-[#c4addf] bg-[#b59bd2]/20 text-white' : 'border-white/15 bg-white/5 text-[#A39C91] hover:text-white'}`}
                  >
                    {label}
                  </button>
                ))}
                <input
                  type="number"
                  value={anchorTs}
                  onChange={(e) => setAnchorTs(Number(e.target.value))}
                  className="w-40 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 font-mono text-xs text-white outline-none focus:border-[#c4addf]"
                  aria-label="anchor unix timestamp"
                />
              </div>
              <button
                onClick={runScan}
                disabled={scanning}
                className="protocol-button mt-4 w-full disabled:opacity-40"
              >
                {scanning ? 'escaneando la cadena…' : 'escanear tick y simular challenge'}
              </button>

              {scan && (
                <div className={`mt-4 rounded-xl border p-4 ${scan.verdict === 'BREACH' ? 'border-red-400/40 bg-red-400/10' : scan.verdict === 'NO_BREACH' ? 'border-emerald-400/30 bg-emerald-400/10' : 'border-amber-400/30 bg-amber-400/10'}`}>
                  <div className={`font-mono text-sm font-bold tracking-[0.1em] ${scan.verdict === 'BREACH' ? 'text-red-300' : scan.verdict === 'NO_BREACH' ? 'text-emerald-300' : 'text-amber-300'}`}>
                    {scan.verdict === 'BREACH' ? '⚡ BREACH REAL' : scan.verdict === 'NO_BREACH' ? '✓ EL CALL AGUANTA' : scan.verdict}
                  </div>
                  {scan.tickPrice && (
                    <div className="mt-2 font-mono text-xs text-[#A39C91]">
                      tick ${Number(scan.tickPrice).toLocaleString('en-US')} @ pt {scan.tickPublishTime} · stop ${Number(scan.stopPrice).toLocaleString('en-US')}
                    </div>
                  )}
                  <p className="mt-2 text-sm leading-6 text-[#A39C91]">{scan.detail || scan.error}</p>
                  {scan.verdict === 'BREACH' && scan.updateData && (
                    <div className="mt-3 space-y-2">
                      {challengeTxHash ? (
                        <div className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-3">
                          <div className="font-mono text-xs font-bold text-emerald-300">
                            {receipt.isSuccess ? '✓ CHALLENGE MINADO — el call se reclasificó on-chain' : receipt.isError ? 'la tx revirtió — revisa en Basescan' : 'challenge enviado — esperando confirmación…'}
                          </div>
                          <a href={`https://sepolia.basescan.org/tx/${challengeTxHash}`} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 font-mono text-[11px] text-[#d6c6ed] hover:text-white">
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
                      <p className="text-xs text-[#A39C91]">{t("Or send it via CLI — the contract reclassifies it the same way (Pyth fee ~10 wei + Sepolia gas):", "O envíalo por CLI: el contrato lo reclasifica igual (tarifa Pyth ~10 wei + gas Sepolia):", "Ou envie pela CLI: o contrato reclassifica da mesma forma (taxa Pyth ~10 wei + gas Sepolia):")}</p>
                      <button
                        onClick={() => navigator.clipboard.writeText(scan.updateData || '')}
                        className="rounded border border-white/15 bg-white/5 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-[#A39C91] hover:text-white"
                      >{t(" copy updateData (", " copiar updateData (", " copiar updateData (")}{Math.round((scan.updateData.length - 2) / 2)} bytes)
                      </button>
                      <pre className="overflow-x-auto rounded-lg bg-black/50 p-3 font-mono text-[10px] leading-4 text-[#A39C91]">{scan.castCommand}</pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        <p className="mt-10 break-words font-mono text-[11px] leading-6 text-[#8A8378]">{t(" Contract", " Contrato", " Contrato")}{' '}
          <a href={`${data?.explorer || 'https://sepolia.basescan.org'}/address/${data?.contract || ''}`} target="_blank" rel="noreferrer" className="text-[#A39C91] underline-offset-2 hover:underline">
            {data?.contract || '…'}
          </a>{' '}{t(" on ", " en ", " na ")}{data?.chain.name || 'Base Sepolia'}{t(" · preserved canary evidence — Base mainnet contracts are deployed with writes frozen during controlled activation. Analysis, not investment advice · ", " · evidencia del canario preservada; los contratos de Base mainnet están desplegados con escrituras congeladas durante la activación controlada. Análisis, no asesoría de inversión · ", " · evidência do canário preservada; os contratos da Base mainnet estão implantados com escritas congeladas durante a ativação controlada. Análise, não aconselhamento de investimento · ")}<a href="/protocol/risk" className="text-[#A39C91] underline-offset-2 hover:underline">{t("risk & claims", "riesgos y afirmaciones", "riscos e afirmações")}</a>
        </p>
      </div>
    </ProtocolLayout>
  );
}
