import { useEffect, useState, type FormEvent } from 'react';
import { Activity, ArrowUpRight, Plus, Wallet } from 'lucide-react';
import { adminAction, isMissing, probeLlm, type LlmProvider, type LlmProviderStats, type OverviewResponse, type ProbeResult } from '@/lib/admin-client';
import { Btn, Card, Field, FormMessage, MissingNote, Modal, Note, Row, Segmented, Tag, TextInput } from './ui';
import { BarsChart, BigNumber, HeroCard, StatusBars } from './charts';
import { growthWindows, MIN_BASE, windowDelta, type CompareSeries } from './deltas';
import { LLM_NAME, llmProviderState } from './health';
import { fmtDate, fmtDateTime, fmtInt, fmtPct, fmtRelative, fmtUsd } from './format';
import { toAdminError } from './useLoad';

type Notify = (text: string, ok?: boolean) => void;
type Series = 'total' | LlmProvider;

/** Keeps a typed amount a valid decimal: one separator (comma or dot), at most 2 decimals. */
function moneyInput(raw: string): string {
  const [int = '', ...rest] = raw.replace(/,/g, '.').replace(/[^\d.]/g, '').split('.');
  const whole = int.slice(0, 7);
  return rest.length ? `${whole}.${rest.join('').slice(0, 2)}` : whole;
}

const NAME = LLM_NAME;
const CONSOLE: Record<LlmProvider, string> = {
  anthropic: 'https://console.anthropic.com/settings/billing',
  openai: 'https://platform.openai.com/settings/organization/billing/overview',
};

/** a of b: a percentage only with a base of MIN_BASE or more; under it the raw counts and "muestra pequeña". */
function Share({ a, b }: { a: number; b: number }) {
  if (!b) return <span className="text-[#5C5C5C]">—</span>;
  if (b < MIN_BASE) return <span>{fmtInt(a)}/{fmtInt(b)} <span className="text-[#5C5C5C]">· muestra pequeña</span></span>;
  return <span>{fmtPct(a, b)} <span className="text-[#5C5C5C]">· n={fmtInt(b)}</span></span>;
}

function ProbeLine({ result }: { result: ProbeResult | { error: string } | null }) {
  if (!result) return null;
  const base = 'm-0 mt-3 font-mono text-[11.5px] leading-snug';
  if ('error' in result) return <p role="alert" className={`${base} text-[#F06A6A]`}>No se pudo probar: {result.error}</p>;
  const detail = `HTTP ${result.httpStatus || '—'}${result.code ? ` · ${result.code}` : ''}`;
  if (result.status === 'ok') return <p role="status" className={`${base} text-[#4ADE80]`}>Responde bien · {detail}</p>;
  if (result.status === 'no_credit') return <p role="alert" className={`${base} text-[#F06A6A]`}>Sin crédito: el proveedor rechazó la llamada · {detail}. Recarga en su consola.</p>;
  return <p role="alert" className={`${base} text-[#F06A6A]`}>Falló la llamada · {detail}</p>;
}

const dim = (text: string) => <span className="text-[#5C5C5C]">{text}</span>;

/** Where the credit ran out, and whether Resend accepted the owner's alert email (accepted is not delivered). */
function creditAlertHint(a: NonNullable<LlmProviderStats['creditAlert']>): string | undefined {
  const email = !a.email ? null
    : a.email.accepted ? 'aviso por correo: aceptado'
    : `aviso por correo: no aceptado${a.email.error ? ` (${a.email.error === 'not_configured' ? 'sin destinatario' : a.email.error})` : ''}`;
  return [a.endpoint, a.code, email].filter(Boolean).join(' · ') || undefined;
}

function ProviderCard({ provider, p, period, onMark, notify }: {
  provider: LlmProvider; p: LlmProviderStats; period: number; onMark: (kind: 'balance' | 'topup') => void; notify: Notify;
}) {
  const [probing, setProbing] = useState(false);
  const [probe, setProbe] = useState<ProbeResult | { error: string } | null>(null);
  const state = llmProviderState(p);
  const fail = p.lastFailure;

  const runProbe = async () => {
    setProbing(true); setProbe(null);
    try {
      const r = await probeLlm(provider);
      setProbe(r);
      notify(r.status === 'ok' ? `${NAME[provider]} responde bien.` : `${NAME[provider]}: ${r.status === 'no_credit' ? 'sin crédito' : 'falló la prueba'}.`, r.status === 'ok');
    } catch (err) {
      setProbe({ error: toAdminError(err).message });
    } finally { setProbing(false); }
  };

  return (
    <Card padded={false}>
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
        <div>
          <div className="text-[13px] text-[#EDEDED]/90">{NAME[provider]}</div>
          <a href={CONSOLE[provider]} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 font-mono text-[10.5px] uppercase tracking-[0.06em] text-[#5C5C5C] hover:text-[#8B8B8B]">
            Consola de facturación<ArrowUpRight className="h-3 w-3" aria-hidden />
          </a>
        </div>
        <Tag tone={state.tone}>{state.label}</Tag>
      </div>
      {state.detail && <p className={`m-0 px-5 pt-2 font-mono text-[11.5px] leading-snug ${state.tone === 'red' ? 'text-[#F06A6A]' : 'text-[#8B8B8B]'}`}>{state.detail}</p>}

      <div className="mt-4 grid grid-cols-3 divide-x divide-white/[0.06] border-t border-white/[0.06]">
        {([['Hoy (UTC)', p.today], ['Últimos 7 días', p.week], ['Últimos 30 días', p.month]] as const).map(([k, v]) => (
          <div key={k} className="min-w-0 px-5 py-4">
            <div className="truncate text-[12px] text-[#8B8B8B]">{k}</div>
            <div className="mt-1.5 truncate font-mono text-[20px] font-medium leading-none text-[#EDEDED]">{fmtUsd(v, true)}</div>
          </div>
        ))}
      </div>
      <p className="m-0 border-b border-white/[0.06] px-5 pb-3 font-mono text-[10.5px] text-[#5C5C5C]">Ventanas fijas: no siguen el selector de periodo.</p>

      <div className="px-5 py-2">
        <Row label="Gasto en el periodo" hint={`${period}d`} value={fmtUsd(p.period, true)} />
        <Row label="Llamadas en el periodo" hint={`${period}d`} value={fmtInt(p.calls)} />
        <Row label="Fallos en el periodo" hint={<Share a={p.failures} b={p.calls} />} value={<span className={p.failures > 0 ? 'text-[#F06A6A]' : undefined}>{fmtInt(p.failures)}</span>} />
        <Row label="Últimas 24 h" value={<span>{fmtInt(p.failures24h)} fallos / {fmtInt(p.calls24h)} llamadas</span>} />
        <Row label="Última llamada OK" value={p.lastOk ? <span title={fmtDateTime(p.lastOk)}>{fmtRelative(p.lastOk)}</span> : dim('ninguna registrada')} />
        <Row
          label="Último fallo"
          value={fail
            ? <span title={fmtDateTime(fail.at)} className="text-[#F06A6A]">{fmtRelative(fail.at)}</span>
            : dim('ninguno')}
          hint={fail ? [fail.stop, fail.surface].filter(Boolean).join(' · ') || undefined : undefined}
        />
        <Row
          label="Crédito estimado"
          value={p.estimatedLeft != null
            ? <span className={p.estimatedLeft <= 0 ? 'text-[#F06A6A]' : 'text-[#EDEDED]'}>≈ {fmtUsd(p.estimatedLeft)}</span>
            : <button type="button" onClick={() => onMark('balance')} className="font-mono text-[12px] text-[#F7A04B] underline underline-offset-2">Registra tu saldo</button>}
        />
        <Row
          label="Último saldo"
          value={p.balanceMark ? <span title={fmtDateTime(p.balanceMark.at)}>{fmtUsd(p.balanceMark.amount)} <span className="text-[11px] text-[#5C5C5C]">{fmtDate(p.balanceMark.at)}</span></span> : dim('ninguno')}
        />
        <Row label="Última recarga" value={p.lastTopup ? <span title={fmtDateTime(p.lastTopup)}>{fmtDate(p.lastTopup)}</span> : dim('ninguna')} />
        <Row
          label="Aviso de crédito agotado"
          value={p.lastCreditAlert ? <span className={state.key === 'no_credit' ? 'text-[#F06A6A]' : 'text-[#8B8B8B]'} title={fmtDateTime(p.lastCreditAlert)}>{fmtRelative(p.lastCreditAlert)}</span> : dim('ninguno')}
          hint={p.lastCreditAlert && p.creditAlert ? creditAlertHint(p.creditAlert) : undefined}
        />
      </div>

      <div className="flex flex-wrap gap-1 border-t border-white/[0.06] px-4 py-3">
        <Btn size="sm" variant="ghost" onClick={() => onMark('balance')}><Wallet className="h-3.5 w-3.5" aria-hidden />Registrar saldo</Btn>
        <Btn
          size="sm" variant="ghost" onClick={() => onMark('topup')} disabled={!p.balanceMark}
          title={p.balanceMark ? undefined : 'Primero registra un saldo: la recarga se suma al último saldo registrado'}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />Registrar recarga
        </Btn>
        <Btn size="sm" variant="ghost" onClick={() => void runProbe()} busy={probing}>{!probing && <Activity className="h-3.5 w-3.5" aria-hidden />}Probar ahora</Btn>
      </div>
      {!p.balanceMark && <p className="m-0 px-5 pb-3 font-mono text-[10.5px] leading-snug text-[#5C5C5C]">La recarga se activa cuando haya un saldo registrado: sin él no hay a qué sumarla.</p>}
      {probe && <div className="px-5 pb-4"><ProbeLine result={probe} /></div>}
    </Card>
  );
}

function CreditDialog({ target, onClose, onDone }: {
  target: { provider: LlmProvider; kind: 'balance' | 'topup' } | null; onClose: () => void; onDone: (text: string) => void;
}) {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { if (target) { setAmount(''); setNote(''); setMsg(null); } }, [target]);
  const value = Number(amount);
  const valid = amount !== '' && Number.isFinite(value) && value >= 0 && value <= 100000 && (target?.kind === 'balance' || value > 0);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!target || !valid) return;
    setBusy(true); setMsg(null);
    try {
      await adminAction({ action: 'credit-mark', provider: target.provider, kind: target.kind, amountUsd: Math.round(value * 100) / 100, ...(note.trim() ? { note: note.trim() } : {}) });
      onClose();
      onDone(target.kind === 'balance' ? `Saldo de ${NAME[target.provider]} registrado.` : `Recarga de ${NAME[target.provider]} registrada.`);
    } catch (err) {
      setMsg({ ok: false, text: toAdminError(err).message });
    } finally { setBusy(false); }
  };

  const balance = target?.kind === 'balance';
  return (
    <Modal
      open={!!target} onOpenChange={(o) => { if (!o) onClose(); }}
      title={target ? `${balance ? 'Registrar saldo' : 'Registrar recarga'} · ${NAME[target.provider]}` : ''}
      description={balance
        ? 'Copia el saldo que ves ahora en la consola del proveedor. Desde aquí, el estimado resta el gasto que registra Bobby.'
        : 'Cuánto acabas de recargar. Se suma al último saldo registrado.'}
    >
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Field label={balance ? 'Saldo actual (USD)' : 'Recarga (USD)'}>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-[13px] text-[#5C5C5C]">$</span>
            <TextInput mono inputMode="decimal" value={amount} onChange={(e) => setAmount(moneyInput(e.target.value))} placeholder="0.00" className="pl-7" autoFocus />
          </div>
        </Field>
        <Field label="Nota (opcional)">
          <TextInput value={note} onChange={(e) => setNote(e.target.value.slice(0, 200))} placeholder={balance ? 'Visto en la consola' : 'Tarjeta, factura…'} />
        </Field>
        <FormMessage message={msg} />
        <div className="flex justify-end gap-2">
          <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
          <Btn type="submit" variant="primary" busy={busy} disabled={!valid}>Guardar</Btn>
        </div>
      </form>
    </Modal>
  );
}

export default function LlmTab({ data, period, cmp, notify, onChanged }: { data: OverviewResponse; period: number; cmp: CompareSeries | null; notify: Notify; onChanged: () => void }) {
  const { overview: o, integrations: i } = data;
  const caps = i.llmCaps;
  // The overview's guard is read in the same transaction as the rest of the figures; integrations is the fallback.
  const guard = o.llm.guard ? { dayUsd: o.llm.guard.day, monthUsd: o.llm.guard.month } : i.llmGuard;
  const [mark, setMark] = useState<{ provider: LlmProvider; kind: 'balance' | 'topup' } | null>(null);
  const [series, setSeries] = useState<Series>('total');
  const llmMissing = isMissing(o.missing, 'llm');
  const dailyMissing = isMissing(o.missing, 'llm.daily');
  const values = o.llm.daily.map((d) => (series === 'total' ? d.anthropic + d.openai : d[series]));
  const cmpSeries = series === 'total' ? cmp?.llm : cmp?.[series];
  const periodTotal = values.reduce((a, b) => a + b, 0);
  const surfaces = o.llm.bySurface;
  const surfacesTotal = surfaces.reduce((a, s) => a + s.usd, 0);
  const cov = o.coverage;
  const ledgerSurfaces = cov?.ledgerSurfaces ?? [];
  const runs = o.llm.deskRuns;
  const unfinished = Math.max(0, runs.runs - runs.finished);
  // byDay carries one entry per analysis: sum them per day.
  const runsByDay = new Map<string, number>();
  for (const d of runs.byDay) runsByDay.set(d.day.slice(0, 10), (runsByDay.get(d.day.slice(0, 10)) ?? 0) + d.runs);
  const runValues = o.days.map((d) => runsByDay.get(d) ?? 0);
  const ledgerLine = cov
    ? `Ledger desde ${cov.ledgerSince ? fmtDate(cov.ledgerSince) : 'sin registros todavía'} · superficies que lo escriben: ${ledgerSurfaces.length ? ledgerSurfaces.join(', ') : 'ninguna todavía'}`
    : 'Cobertura del ledger no disponible';

  // The caps compare the spend guard's own figures: desk only, UTC calendar day and month.
  const capRow = (label: string, spent: number | null, cap: number | null) => {
    if (cap == null) return { label, value: 0, missing: 'tope pendiente de consulta', display: '—' };
    if (spent == null) return { label, value: 0, missing: 'dato no disponible', display: '—' };
    if (!cap) return { label, value: 0, missing: 'sin tope', display: fmtUsd(spent, true) };
    return {
      label, value: Math.min(1, spent / cap), fill: (spent >= cap * 0.8 ? 'orange' : 'blue') as 'orange' | 'blue',
      display: `${fmtUsd(spent, true)} / ${fmtUsd(cap)}`, sub: fmtPct(spent, cap),
    };
  };

  return (
    <div className="flex flex-col gap-4">
      <MissingNote missing={o.missing} sections={['llm', 'coverage', 'integrations']} />
      <Note tag="Cobertura">
        {ledgerLine}. TTS (voces), Realtime y otras superficies de OpenAI todavía no escriben el ledger: todo el gasto de esta pestaña es un mínimo, el real es mayor.
      </Note>
      <Note tag="Saldo">Los proveedores no exponen el saldo por API: el estimado = último saldo registrado + recargas − gasto del ledger (por eso puede quedarse corto).</Note>

      <div className="grid gap-4 lg:grid-cols-2">
        {(['anthropic', 'openai'] as const).map((p) => (
          <ProviderCard key={p} provider={p} p={o.llm.providers[p]} period={period} onMark={(kind) => setMark({ provider: p, kind })} notify={notify} />
        ))}
      </div>

      <HeroCard
        title={`Gasto diario (ledger) · ${period}d`}
        toggle={(
          <Segmented<Series>
            label="Proveedor" value={series} onChange={setSeries}
            options={[{ value: 'total', label: 'Total' }, { value: 'anthropic', label: 'Anthropic' }, { value: 'openai', label: 'OpenAI' }]}
          />
        )}
        value={dailyMissing ? '—' : fmtUsd(periodTotal, true)}
        delta={dailyMissing ? null : windowDelta(cmpSeries, period)}
        invert
        chips={dailyMissing ? [] : growthWindows(cmpSeries)}
        note={cov?.ledgerSince ? `Días antes del ${fmtDate(cov.ledgerSince)} no tienen registro (no son $0).` : undefined}
      >
        <BarsChart days={o.days} values={values} format="usd-precise" emptyLabel={dailyMissing ? 'Dato no disponible' : 'Sin gasto en el periodo'} />
      </HeroCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <BigNumber label="Análisis del desk" value={llmMissing ? '—' : fmtInt(runs.runs)} caption={`en el periodo · ${period}d`} />
          {llmMissing ? <p className="m-0 font-mono text-[12px] text-[#5C5C5C]">Dato no disponible</p> : (
            <>
              <Row label="Terminados" value={fmtInt(runs.finished)} hint={<Share a={runs.finished} b={runs.runs} />} />
              <Row label="Sin terminar" value={<span className={unfinished > 0 ? 'text-[#F06A6A]' : undefined}>{fmtInt(unfinished)}</span>} hint={<Share a={unfinished} b={runs.runs} />} />
              <Row label="Interrumpidos antes del final" value={runs.abandoned == null ? '—' : fmtInt(runs.abandoned)} hint="no son fallas ni cuentan en el total" />
              <div className="mt-4">
                <BarsChart days={o.days} values={runValues} height={120} emptyLabel="Sin análisis en el periodo" />
              </div>
            </>
          )}
          <p className="m-0 mt-4 border-t border-white/[0.06] pt-3 font-mono text-[10.5px] leading-relaxed text-[#5C5C5C]">
            Un análisis = un lote del ledger; terminado = el CIO respondió; interrumpido = la conexión se cerró antes del CIO (aparte, no es falla). Los fallos de cada proveedor (arriba) son por llamada; aquí son por análisis completo.
          </p>
        </Card>
        <Card>
          <BigNumber label="Topes de gasto (desk)" value={guard ? fmtUsd(guard.monthUsd, true) : '—'} caption={guard ? 'este mes calendario (UTC)' : 'dato no disponible'} />
          <StatusBars
            max={1}
            labelWidth={170}
            wrapLabels
            stackMobile
            rows={[
              capRow('Hoy (UTC)', guard?.dayUsd ?? null, caps.dayUsd),
              capRow('Mes calendario', guard?.monthUsd ?? null, caps.monthUsd),
              capRow('Aviso por gasto mensual acumulado (desk)', guard?.monthUsd ?? null, caps.alertUsd),
            ]}
          />
          <p className="m-0 mt-4 border-t border-white/[0.06] pt-3 font-mono text-[10.5px] leading-relaxed text-[#5C5C5C]">
            Los topes comparan solo el gasto del desk, por día y mes calendario UTC: lo mismo que mira el freno del servidor.
          </p>
        </Card>
      </div>

      <Card>
        <BigNumber label="Gasto por superficie" value={isMissing(o.missing, 'llm.bySurface') ? '—' : fmtUsd(surfacesTotal, true)} caption={`en el periodo · ${period}d · ledger`} />
        {isMissing(o.missing, 'llm.bySurface') ? <p className="m-0 font-mono text-[12px] text-[#5C5C5C]">Dato no disponible</p>
          : surfaces.length === 0 ? <p className="m-0 font-mono text-[12px] text-[#5C5C5C]">Sin gasto registrado en el periodo</p>
          : (
            <StatusBars
              uppercase={false}
              stackMobile
              wrapLabels
              labelWidth={150}
              rows={surfaces.map((s, idx) => ({
                label: `${s.surface} · ${s.provider}`, value: s.usd, fill: idx === 0 ? 'orange' : 'blue',
                display: fmtUsd(s.usd, true), sub: `${fmtInt(s.calls)} llamadas${s.failures ? ` · ${fmtInt(s.failures)} fallos` : ''}`,
              }))}
            />
          )}
        <p className="m-0 mt-4 border-t border-white/[0.06] pt-3 font-mono text-[10.5px] leading-relaxed text-[#5C5C5C]">
          {ledgerLine}. Voces (TTS) y Realtime no aparecen aquí aunque gasten.
        </p>
      </Card>

      <CreditDialog target={mark} onClose={() => setMark(null)} onDone={(text) => { notify(text); onChanged(); }} />
    </div>
  );
}
