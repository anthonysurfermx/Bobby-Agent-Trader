import { useEffect, useState, type FormEvent } from 'react';
import { Activity, ArrowUpRight, Plus, Wallet } from 'lucide-react';
import { adminAction, isMissing, probeLlm, type LlmProvider, type LlmProviderStats, type OverviewResponse, type ProbeResult } from '@/lib/admin-client';
import { Btn, Card, Field, FormMessage, MissingNote, Modal, Note, Row, Segmented, Tag, TextInput } from './ui';
import { BarsChart, BigNumber, HeroCard, StatusBars } from './charts';
import { growthWindows, windowDelta, type CompareSeries } from './deltas';
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

const NAME: Record<LlmProvider, string> = { anthropic: 'Anthropic', openai: 'OpenAI' };
const CONSOLE: Record<LlmProvider, string> = {
  anthropic: 'https://console.anthropic.com/settings/billing',
  openai: 'https://platform.openai.com/settings/organization/billing/overview',
};

function ProbeLine({ result }: { result: ProbeResult | { error: string } | null }) {
  if (!result) return null;
  const base = 'm-0 mt-3 font-mono text-[11.5px] leading-snug';
  if ('error' in result) return <p role="alert" className={`${base} text-[#F06A6A]`}>No se pudo probar: {result.error}</p>;
  const detail = `HTTP ${result.httpStatus || '—'}${result.code ? ` · ${result.code}` : ''}`;
  if (result.status === 'ok') return <p role="status" className={`${base} text-[#4ADE80]`}>Responde bien · {detail}</p>;
  if (result.status === 'no_credit') return <p role="alert" className={`${base} text-[#F06A6A]`}>Sin crédito: el proveedor rechazó la llamada · {detail}. Recarga en su consola.</p>;
  return <p role="alert" className={`${base} text-[#F06A6A]`}>Falló la llamada · {detail}</p>;
}

function ProviderCard({ provider, p, period, onMark, notify }: {
  provider: LlmProvider; p: LlmProviderStats; period: number; onMark: (kind: 'balance' | 'topup') => void; notify: Notify;
}) {
  const [probing, setProbing] = useState(false);
  const [probe, setProbe] = useState<ProbeResult | { error: string } | null>(null);
  const empty = p.estimatedLeft != null && p.estimatedLeft <= 0;

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
        {empty ? <Tag tone="red">Sin crédito</Tag> : p.estimatedLeft != null ? <Tag tone="green">Con crédito</Tag> : <Tag>Sin saldo registrado</Tag>}
      </div>

      <div className="mt-4 grid grid-cols-3 divide-x divide-white/[0.06] border-y border-white/[0.06]">
        {([['Hoy', p.today], ['7 días', p.week], ['30 días', p.month]] as const).map(([k, v]) => (
          <div key={k} className="min-w-0 px-5 py-4">
            <div className="text-[12px] text-[#8B8B8B]">{k}</div>
            <div className="mt-1.5 truncate font-mono text-[20px] font-medium leading-none text-[#EDEDED]">{fmtUsd(v, true)}</div>
          </div>
        ))}
      </div>

      <div className="px-5 py-2">
        <Row label={`Llamadas · ${period}d`} value={fmtInt(p.calls)} />
        <Row label={`Fallos · ${period}d`} value={<span className={p.failures > 0 ? 'text-[#F06A6A]' : undefined}>{fmtInt(p.failures)}</span>} hint={p.calls ? fmtPct(p.failures, p.calls) : undefined} />
        <Row
          label="Crédito estimado"
          value={p.estimatedLeft != null
            ? <span className={empty ? 'text-[#F06A6A]' : 'text-[#EDEDED]'}>{fmtUsd(p.estimatedLeft)}</span>
            : <button type="button" onClick={() => onMark('balance')} className="font-mono text-[12px] text-[#F7A04B] underline underline-offset-2">Registra tu saldo</button>}
        />
        <Row
          label="Último saldo"
          value={p.balanceMark ? <span title={fmtDateTime(p.balanceMark.at)}>{fmtUsd(p.balanceMark.amount)} <span className="text-[11px] text-[#5C5C5C]">{fmtDate(p.balanceMark.at)}</span></span> : <span className="text-[#5C5C5C]">ninguno</span>}
        />
        <Row
          label="Aviso de crédito agotado"
          value={p.lastCreditAlert ? <span className="text-[#F06A6A]" title={fmtDateTime(p.lastCreditAlert)}>{fmtRelative(p.lastCreditAlert)}</span> : <span className="text-[#5C5C5C]">ninguno</span>}
        />
      </div>

      <div className="flex flex-wrap gap-1 border-t border-white/[0.06] px-4 py-3">
        <Btn size="sm" variant="ghost" onClick={() => onMark('balance')}><Wallet className="h-3.5 w-3.5" aria-hidden />Registrar saldo</Btn>
        <Btn size="sm" variant="ghost" onClick={() => onMark('topup')}><Plus className="h-3.5 w-3.5" aria-hidden />Registrar recarga</Btn>
        <Btn size="sm" variant="ghost" onClick={() => void runProbe()} busy={probing}>{!probing && <Activity className="h-3.5 w-3.5" aria-hidden />}Probar ahora</Btn>
      </div>
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
  const guard = i.llmGuard;
  const [mark, setMark] = useState<{ provider: LlmProvider; kind: 'balance' | 'topup' } | null>(null);
  const [series, setSeries] = useState<Series>('total');
  const dailyMissing = isMissing(o.missing, 'llm.daily');
  const values = o.llm.daily.map((d) => (series === 'total' ? d.anthropic + d.openai : d[series]));
  const cmpSeries = series === 'total' ? cmp?.llm : cmp?.[series];
  const periodTotal = values.reduce((a, b) => a + b, 0);
  const surfaces = o.llm.bySurface;
  const surfacesTotal = surfaces.reduce((a, s) => a + s.usd, 0);
  const ledgerSurfaces = o.coverage?.ledgerSurfaces ?? [];

  // The caps compare the spend guard's own figures: desk only, UTC calendar day and month.
  const capRow = (label: string, spent: number | null, cap: number) => {
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
      <Note tag="Saldo">Los proveedores no exponen el saldo por API: el estimado = último saldo registrado + recargas − gasto del ledger.</Note>

      <div className="grid gap-4 lg:grid-cols-2">
        {(['anthropic', 'openai'] as const).map((p) => (
          <ProviderCard key={p} provider={p} p={o.llm.providers[p]} period={period} onMark={(kind) => setMark({ provider: p, kind })} notify={notify} />
        ))}
      </div>

      <HeroCard
        title="Gasto diario (ledger)"
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
      >
        <BarsChart days={o.days} values={values} format="usd-precise" emptyLabel={dailyMissing ? 'Dato no disponible' : 'Sin gasto en el periodo'} />
      </HeroCard>

      <div className="grid gap-4 lg:grid-cols-2">
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
        <Card>
          <BigNumber label="Gasto por superficie" value={isMissing(o.missing, 'llm.bySurface') ? '—' : fmtUsd(surfacesTotal, true)} caption={`${period}d · ledger`} />
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
            El ledger cubre: {ledgerSurfaces.length ? ledgerSurfaces.join(', ') : 'sin registros todavía'}{o.coverage?.ledgerSince ? ` (desde ${fmtDate(o.coverage.ledgerSince)})` : ''}. TTS/voz no está incluido.
          </p>
        </Card>
      </div>

      <CreditDialog target={mark} onClose={() => setMark(null)} onDone={(text) => { notify(text); onChanged(); }} />
    </div>
  );
}
