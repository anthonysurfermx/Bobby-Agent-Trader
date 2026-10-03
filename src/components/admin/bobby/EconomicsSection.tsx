// "Economía unitaria": revenue, CAC and ROI observed from the server's /api/admin?view=lifecycle, each with the
// formula it came from; LTV, LTV:CAC and payback, which are a projection from the owner's assumptions while no
// account has ever paid (ltv.scenario); the costs that feed them (register / delete) and the assumptions.
// Payers and MRR are verified ones only (production, not a trial, with a positive charge); revenue with no
// purchase event ever received is "Sin medir", never an observed $0. Cost dates are UTC, like the server's.
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { adminAction, type AdminError, type CostKind, type CostRow, type Economics } from '@/lib/admin-client';
import { Btn, Card, CardHead, Empty, ErrorState, Field, FormMessage, Loading, Modal, Note, Segmented, StaleBanner, TableScroll, Tag, TextInput, td, th, tr } from './ui';
import { BigNumber, StatusBars, type StatusRow } from './charts';
import { fmtDate, fmtDec, fmtInt, fmtUsd, todayUtc } from './format';
import { toAdminError } from './useLoad';

type Notify = (text: string, ok?: boolean) => void;

const pct = (v: number | null | undefined, digits = 1) => (v == null || !Number.isFinite(v) ? '—' : `${(v * 100).toFixed(digits).replace(/\.0$/, '')}%`);
const KIND_LABEL: Record<CostKind, string> = { marketing: 'Marketing', infra: 'Infra', other: 'Otro' };
const channelInput = (v: string) => v.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').slice(0, 32);
function moneyInput(raw: string): string {
  const [int = '', ...rest] = raw.replace(/,/g, '.').replace(/[^\d.]/g, '').split('.');
  return rest.length ? `${int.slice(0, 7)}.${rest.join('').slice(0, 2)}` : int.slice(0, 7);
}

/** One cell of the unit-economics strips: label, big mono value, details and the formula behind it. */
function EconCell({ label, value, tone, details, formula, hint, tag }: {
  label: string; value: ReactNode; tone?: 'green' | 'red' | 'amber' | 'dim'; details?: ReactNode[]; formula: string; hint?: string; tag?: ReactNode;
}) {
  const color = tone === 'green' ? 'text-[#4ADE80]' : tone === 'red' ? 'text-[#F06A6A]' : tone === 'amber' ? 'text-[#F7A04B]' : tone === 'dim' ? 'text-[#8B8B8B]' : 'text-[#EDEDED]';
  return (
    <div className="flex min-w-0 flex-col justify-between gap-4 p-5">
      <div className="min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] text-[#EDEDED]/90">{label}</span>
          {tag}
        </div>
        <div className={`mt-2 truncate font-mono text-[28px] font-medium leading-none tracking-[-0.02em] ${color}`}>{value}</div>
        {hint && <div className="mt-2 font-mono text-[11.5px] text-[#F7A04B]/90">{hint}</div>}
        {details && details.length > 0 && (
          <div className="mt-3 flex flex-col gap-1 font-mono text-[12px] leading-snug text-[#8B8B8B]">
            {details.map((d, i) => <div key={i} className="min-w-0">{d}</div>)}
          </div>
        )}
      </div>
      <div className="border-t border-white/[0.05] pt-2 font-mono text-[10.5px] leading-relaxed text-[#5C5C5C]">{formula}</div>
    </div>
  );
}

function Split({ children, cols }: { children: ReactNode; cols: 2 | 3 }) {
  return (
    <Card padded={false} className={`grid grid-cols-1 divide-y divide-white/[0.06] sm:divide-y-0 sm:divide-x ${cols === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
      {children}
    </Card>
  );
}

function CostForm({ onSaved }: { onSaved: (text: string) => void }) {
  const [kind, setKind] = useState<CostKind>('marketing');
  const [channel, setChannel] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(() => todayUtc());
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const value = Number(amount);
  const valid = amount !== '' && Number.isFinite(value) && value > 0 && value <= 1_000_000 && (!date || date <= todayUtc());

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setBusy(true); setMsg(null);
    try {
      await adminAction({
        action: 'add-cost', kind, amountUsd: Math.round(value * 100) / 100,
        ...(channel ? { channel } : {}), ...(date ? { spentOn: date } : {}), ...(note.trim() ? { note: note.trim() } : {}),
      });
      setAmount(''); setNote('');
      onSaved(`Costo de ${fmtUsd(value)} registrado.`);
    } catch (err) {
      setMsg({ ok: false, text: toAdminError(err).message });
    } finally { setBusy(false); }
  };

  return (
    <Card>
      <CardHead title="Registrar costo" sub="Marketing alimenta el CAC; todo suma a los costos del ROI." />
      <form onSubmit={submit} className="grid grid-cols-2 gap-3">
        <div className="col-span-2 flex flex-col gap-1.5">
          <span className="text-[12px] text-[#8B8B8B]">Tipo</span>
          <Segmented<CostKind> label="Tipo de costo" value={kind} onChange={setKind} options={[{ value: 'marketing', label: 'Marketing' }, { value: 'infra', label: 'Infra' }, { value: 'other', label: 'Otro' }]} />
        </div>
        <Field label="Canal" hint={kind === 'marketing' ? 'tiktok, meta, google, influencer…' : 'vercel, supabase, apple…'}>
          <TextInput mono value={channel} onChange={(e) => setChannel(channelInput(e.target.value))} placeholder={kind === 'marketing' ? 'tiktok' : 'vercel'} autoCapitalize="none" spellCheck={false} />
        </Field>
        <Field label="Monto (USD)">
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-[13px] text-[#5C5C5C]">$</span>
            <TextInput mono inputMode="decimal" value={amount} onChange={(e) => setAmount(moneyInput(e.target.value))} placeholder="0.00" className="pl-7" />
          </div>
        </Field>
        <Field label="Fecha (UTC)"><TextInput mono type="date" value={date} max={todayUtc()} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Nota (opcional)"><TextInput value={note} onChange={(e) => setNote(e.target.value.slice(0, 160))} placeholder="Campaña, factura…" /></Field>
        <div className="col-span-2 flex flex-col gap-2">
          <FormMessage message={msg} />
          <div className="flex justify-end"><Btn type="submit" variant="primary" busy={busy} disabled={!valid}>{!busy && <Plus className="h-4 w-4" aria-hidden />}Registrar costo</Btn></div>
        </div>
      </form>
    </Card>
  );
}

function CostList({ costs, error, onRetry, onDeleted }: { costs: CostRow[] | null; error: AdminError | null; onRetry: () => void; onDeleted: (text: string) => void }) {
  const [target, setTarget] = useState<CostRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { if (target) setMsg(null); }, [target]);

  const confirm = async () => {
    if (!target) return;
    setBusy(true); setMsg(null);
    try {
      await adminAction({ action: 'delete-cost', id: target.id });
      setTarget(null);
      onDeleted(`Costo de ${fmtUsd(target.amount_usd)} borrado.`);
    } catch (err) {
      setMsg({ ok: false, text: toAdminError(err).message });
    } finally { setBusy(false); }
  };

  return (
    <Card>
      <CardHead title="Costos registrados" count={costs ? `${fmtInt(costs.length)}` : undefined} sub="Todos los periodos; el resumen de arriba usa solo los del periodo." />
      {costs && error && <div className="mb-3"><StaleBanner error={error} onRetry={onRetry} /></div>}
      {error && !costs ? <ErrorState message={error.message} onRetry={onRetry} />
        : !costs ? <Loading label="Cargando costos" />
        : costs.length === 0 ? <Empty>Sin costos registrados</Empty>
        : (
          <TableScroll minWidth={560}>
            <thead><tr><th className={th}>Fecha</th><th className={th}>Tipo</th><th className={th}>Canal</th><th className={`${th} text-right`}>Monto</th><th className={th}>Nota</th><th className={th}><span className="sr-only">Borrar</span></th></tr></thead>
            <tbody>
              {costs.map((c) => (
                <tr key={c.id} className={tr}>
                  <td className={`${td} font-mono text-[12px] text-[#8B8B8B]`}>{fmtDate(c.spent_on)}</td>
                  <td className={td}><Tag tone={c.kind === 'marketing' ? 'orange' : 'neutral'}>{KIND_LABEL[c.kind]}</Tag></td>
                  <td className={`${td} font-mono text-[12px] uppercase text-[#8B8B8B]`}>{c.channel ?? '—'}</td>
                  <td className={`${td} text-right font-mono text-[12.5px]`}>{fmtUsd(c.amount_usd)}</td>
                  <td className={`${td} text-[12.5px] text-[#8B8B8B]`}><div className="max-w-[220px] truncate" title={c.note ?? undefined}>{c.note ?? '—'}</div></td>
                  <td className={`${td} text-right`}>
                    <Btn size="sm" variant="danger" onClick={() => setTarget(c)} aria-label={`Borrar costo de ${fmtUsd(c.amount_usd)} del ${fmtDate(c.spent_on)}`} title="Borrar">
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </Btn>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableScroll>
        )}
      <Modal
        open={!!target} onOpenChange={(o) => { if (!o) setTarget(null); }} tone="danger" title="Borrar costo"
        description={target && <>Se borra <span className="font-mono text-[#EDEDED]">{fmtUsd(target.amount_usd)}</span> de {KIND_LABEL[target.kind].toLowerCase()}{target.channel ? ` (${target.channel})` : ''} del {fmtDate(target.spent_on)}. CAC, LTV:CAC y ROI se recalculan.</>}
        footer={(
          <>
            <FormMessage message={msg} />
            <Btn variant="ghost" onClick={() => setTarget(null)}>Cancelar</Btn>
            <Btn variant="danger" className="border border-[#F06A6A]/30" busy={busy} onClick={() => void confirm()}>Borrar</Btn>
          </>
        )}
      />
    </Card>
  );
}

function Assumptions({ e, onSaved }: { e: Economics; onSaved: (text: string) => void }) {
  const a = e.assumptions;
  const fromServer = () => ({
    churn: a.monthlyChurn != null ? String(+(a.monthlyChurn * 100).toFixed(2)) : '',
    fee: a.storeFee != null ? String(+(a.storeFee * 100).toFixed(2)) : '',
    price: a.priceUsd != null ? String(a.priceUsd) : '',
    life: a.maxLifetimeMonths != null ? String(a.maxLifetimeMonths) : '',
  });
  // The parent remounts this form (key) whenever the server's assumptions change.
  const [v, setV] = useState(fromServer);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const parse = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')));
  const churn = parse(v.churn), fee = parse(v.fee), price = parse(v.price), life = parse(v.life);
  const problems = [
    churn != null && !(churn >= 0.1 && churn <= 100) && 'Churn mensual: entre 0.1% y 100%.',
    fee != null && !(fee >= 0 && fee <= 50) && 'Comisión de tienda: entre 0% y 50%.',
    price != null && !(price >= 0.5 && price <= 1000) && 'Precio: entre $0.50 y $1,000.',
    life != null && !(life >= 1 && life <= 120) && 'Vida máxima: entre 1 y 120 meses.',
  ].filter(Boolean) as string[];

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (problems.length) return;
    setBusy(true); setMsg(null);
    try {
      await adminAction({
        action: 'set-assumptions',
        monthlyChurn: churn == null ? null : churn / 100, storeFee: fee == null ? null : fee / 100, priceUsd: price, maxLifetimeMonths: life,
      });
      onSaved('Supuestos guardados.');
    } catch (err) {
      setMsg({ ok: false, text: toAdminError(err).message });
    } finally { setBusy(false); }
  };
  const field = (key: keyof typeof v, value: string) => setV((s) => ({ ...s, [key]: value.replace(/[^\d.,]/g, '').slice(0, 7) }));

  return (
    <Card>
      <CardHead title="Supuestos" sub="Vacío = valor por defecto del servidor." />
      <form onSubmit={submit} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Field label="Churn mensual (%)" hint={`en uso: ${pct(e.ltv.monthlyChurn)} · ${e.ltv.churnSource === 'observed' ? 'observado' : e.ltv.churnSource === 'assumed' ? 'supuesto' : 'default'}`}>
          <TextInput mono inputMode="decimal" value={v.churn} onChange={(x) => field('churn', x.target.value)} placeholder="10" />
        </Field>
        <Field label="Comisión de tienda (%)" hint={`en uso: ${pct(1 - e.revenue.takehome)}`}>
          <TextInput mono inputMode="decimal" value={v.fee} onChange={(x) => field('fee', x.target.value)} placeholder="15" />
        </Field>
        <Field label="Precio (USD / mes)" hint={`en uso: ${fmtUsd(e.revenue.priceUsd)}`}>
          <TextInput mono inputMode="decimal" value={v.price} onChange={(x) => field('price', x.target.value)} placeholder={String(e.revenue.priceUsd || 4.99)} />
        </Field>
        <Field label="Vida máxima (meses)" hint="tope del LTV">
          <TextInput mono inputMode="decimal" value={v.life} onChange={(x) => field('life', x.target.value)} placeholder="36" />
        </Field>
        <div className="col-span-2 flex flex-col gap-2 lg:col-span-4">
          {problems.map((p) => <FormMessage key={p} message={{ ok: false, text: p }} />)}
          <FormMessage message={msg} />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="m-0 max-w-[620px] font-mono text-[10.5px] leading-relaxed text-[#5C5C5C]">
              El importe del último cobro registrado y la tasa disponible en los eventos tienen prioridad sobre los supuestos; el churn observado reemplaza al supuesto cuando hay 5+ suscripciones en la base. Las comisiones de Stripe siguen sin confirmar.
            </p>
            <Btn type="submit" variant="primary" busy={busy} disabled={problems.length > 0}>Guardar supuestos</Btn>
          </div>
        </div>
      </form>
    </Card>
  );
}

const PRICE_SOURCE: Record<Economics['revenue']['priceSource'], string> = { observed: 'último cobro real', assumed: 'supuesto tuyo', default: 'default del servidor' };
const CHURN_SOURCE: Record<Economics['ltv']['churnSource'], string> = { observed: 'observado', assumed: 'supuesto tuyo', default: 'default del servidor' };

export default function EconomicsSection({ e, costs, costsError, onCostsRetry, period, notify, onChanged, ledgerSurfaces }: {
  e: Economics; costs: CostRow[] | null; costsError: AdminError | null; onCostsRetry: () => void; period: number; notify: Notify; onChanged: () => void;
  /** Surfaces that write the LLM ledger (overview.coverage); IA cost only covers those. */
  ledgerSurfaces?: string[] | null;
}) {
  const r = e.revenue, c = e.costs, acq = e.acquisition, l = e.ltv;
  const done = (text: string) => { notify(text); onChanged(); };
  const noMarketing = c.marketingUsd <= 0;
  const noPaying = acq.newPaying <= 0;
  const cacHint = noMarketing ? 'registra gasto de marketing' : noPaying ? 'sin pagadores en el periodo' : undefined;
  const ratio = l.ltvToCac;
  const capped = l.monthlyChurn > 0 && l.lifetimeMonths < 1 / l.monthlyChurn - 0.05;
  const scenario = l.scenario;
  const churnTag = l.churnSource === 'observed' ? <Tag tone="green">Churn observado</Tag> : l.churnSource === 'assumed' ? <Tag tone="orange">Churn supuesto</Tag> : <Tag>Churn default</Tag>;
  const surfaces = ledgerSurfaces?.length ? ledgerSurfaces.join(', ') : null;

  const rows: StatusRow[] = [
    ...c.byChannel.map((ch) => ({ label: `Mkt · ${ch.channel}`, value: ch.usd, fill: 'orange' as const, display: fmtUsd(ch.usd) })),
    ...(c.byChannel.length === 0 && c.marketingUsd > 0 ? [{ label: 'Marketing', value: c.marketingUsd, fill: 'orange' as const, display: fmtUsd(c.marketingUsd) }] : []),
    { label: 'Infra', value: c.infraUsd, fill: 'blue', display: fmtUsd(c.infraUsd) },
    { label: 'Otros', value: c.otherUsd, fill: 'blue', display: fmtUsd(c.otherUsd) },
    { label: 'IA (ledger)', value: c.llmUsd, fill: 'blue', display: fmtUsd(c.llmUsd, true) },
  ];
  const breakdown = rows.filter((row) => row.value > 0);
  const assumptionsLine = [
    `precio ${fmtUsd(r.priceUsd)}/mes (${PRICE_SOURCE[r.priceSource]})`,
    `comisión de tienda ${pct(1 - r.takehome)}`,
    `churn ${pct(l.monthlyChurn)}/mes (${CHURN_SOURCE[l.churnSource]})`,
    `vida ${fmtDec(l.lifetimeMonths)} meses${capped ? ' (tope)' : ''}`,
    `IA ${fmtUsd(l.monthlyLlmPerUserUsd, true)}/usuario/mes`,
  ].join(' · ');

  const ltvCells = (
    <>
      <EconCell
        label="LTV" value={fmtUsd(l.ltvUsd)} tone={scenario ? 'dim' : undefined} tag={scenario ? <Tag tone="orange">Proyección</Tag> : churnTag}
        details={[
          <>contribución mensual {fmtUsd(l.monthlyContributionUsd)} × vida {fmtDec(l.lifetimeMonths)} meses</>,
          <>churn {pct(l.monthlyChurn)} / mes ({CHURN_SOURCE[l.churnSource]}){capped ? ` · tope ${fmtDec(l.lifetimeMonths)} m` : ''}</>,
        ]}
        formula={`LTV = (${fmtUsd(l.monthlyNetPerSubUsd)} − ${fmtUsd(l.monthlyLlmPerUserUsd, true)} IA/usuario) ÷ ${pct(l.monthlyChurn)} churn${capped ? ` (tope ${fmtDec(l.lifetimeMonths)} m)` : ''}`}
      />
      <EconCell
        label="LTV : CAC" value={ratio != null ? `${fmtDec(ratio)}×` : '—'}
        // A projection gets no good/bad color: there is nothing observed to judge yet.
        tone={ratio == null ? undefined : scenario ? 'dim' : ratio >= 3 ? 'green' : ratio >= 1 ? 'amber' : 'red'}
        hint={ratio == null ? cacHint : undefined}
        tag={scenario ? <Tag tone="orange">Proyección</Tag> : undefined}
        details={[<>meta habitual: 3× o más</>]}
        formula="LTV:CAC = LTV ÷ CAC por pagador"
      />
      <EconCell
        label="Payback" value={l.paybackMonths != null ? `${fmtDec(l.paybackMonths)} meses` : '—'} tone={scenario ? 'dim' : undefined}
        hint={l.paybackMonths == null ? cacHint : undefined}
        tag={scenario ? <Tag tone="orange">Proyección</Tag> : undefined}
        details={[<>meses de contribución para recuperar lo que costó un pagador</>]}
        formula="payback = CAC por pagador ÷ contribución mensual"
      />
    </>
  );

  return (
    <section className="flex flex-col gap-4" aria-labelledby="econ-title">
      <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 id="econ-title" className="m-0 text-[16px] font-medium text-[#EDEDED]">Economía unitaria</h2>
        <span className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-[#5C5C5C]">{period}d · desde {fmtDate(e.since)}</span>
      </div>

      <Split cols={3}>
        <EconCell
          label="Ingresos · USD registrados" value={r.measured ? fmtUsd(r.netUsd) : 'Sin medir'} tone={r.measured ? undefined : 'dim'}
          hint={r.measured ? undefined : 'nunca ha llegado un evento de compra'}
          details={[
            r.measured
              ? <>neto estimado · bruto {fmtUsd(r.grossUsd)} · reembolsos {fmtUsd(r.refundsUsd)}{r.purchasesSince ? ` · eventos desde ${fmtDate(r.purchasesSince)}` : ''}{r.unverifiedGrossUsd ? ` · incluye ${fmtUsd(r.unverifiedGrossUsd)} de cuentas sin verificar (no son pagadores)` : ''}</>
              : <>no se distingue «sin ventas» de «webhook sin entregar»</>,
            r.unconvertedEvents == null ? <>No se confirmó la cobertura de importes USD pendientes.</> : r.unconvertedEvents > 0 ? <>{fmtInt(r.unconvertedEvents)} eventos sin importe USD confirmado · no se estima su conversión.</> : null,
            <>MRR neto verificado <span className="text-[#EDEDED]">{fmtUsd(r.mrrNetUsd)}</span> · {fmtInt(r.paidVerified)} pagadas verificadas · {fmtInt(r.unverifiedSubscriptions)} sin verificar y {fmtInt(r.testSubscriptions)} de prueba (fuera del MRR)</>,
            <>{fmtInt(r.newPaying)} nuevos pagadores verificados · {fmtInt(r.payingInPeriod)} con cobro en el periodo · {fmtInt(r.payersEver)} han pagado alguna vez (verificados)</>,
          ]}
          formula={`neto estimado = bruto × tasa disponible o supuesta − reembolsos (comisiones de Stripe sin confirmar) · MRR = ${fmtInt(r.paidVerified)} pagadas verificadas × ${fmtUsd(r.priceUsd)} × ${pct(r.takehome)} · nuevo pagador = pagador verificado (membresía de producción, sin prueba) cuyo primer cobro de toda su vida cae en el periodo`}
        />
        <EconCell
          label="CAC por pagador" value={acq.cacPerPaying != null ? fmtUsd(acq.cacPerPaying) : '—'} hint={acq.cacPerPaying == null ? cacHint : undefined}
          details={[
            <>por cuenta {acq.cacPerAccount != null ? fmtUsd(acq.cacPerAccount) : '—'} · {fmtInt(acq.newAccounts)} cuentas nuevas</>,
            <>mezclado: todo el marketing entre todas las cuentas (orgánicas incluidas), no por canal</>,
          ]}
          formula={`CAC = marketing ${fmtUsd(c.marketingUsd)} ÷ ${fmtInt(acq.newPaying)} nuevos pagadores · por cuenta = marketing ÷ cuentas nuevas`}
        />
        <EconCell
          label="ROI del periodo" value={e.roi.roi != null ? `${e.roi.roi >= 0 ? '+' : ''}${pct(e.roi.roi)}` : '—'}
          tone={e.roi.roi == null ? undefined : e.roi.roi >= 0 ? 'green' : 'red'}
          hint={e.roi.roi == null ? 'registra costos' : r.payersEver <= 0 && r.netUsd <= 0 ? 'sin pagadores: solo refleja el gasto' : r.payersEver <= 0 ? 'sin pagadores verificados' : undefined}
          details={[
            <>resultado <span className={e.roi.profitUsd >= 0 ? 'text-[#4ADE80]' : 'text-[#F06A6A]'}>{fmtUsd(e.roi.profitUsd)}</span> = neto {fmtUsd(r.netUsd)} − costos registrados {fmtUsd(c.totalUsd)}</>,
          ]}
          formula="ROI = (neto − costos registrados) ÷ costos registrados"
        />
      </Split>

      {scenario ? (
        <Card padded={false}>
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/[0.06] px-5 pb-3 pt-5">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[13px] text-[#EDEDED]/90">Escenario (sin pagadores reales) <Tag tone="orange">Proyección</Tag></div>
              <p className="m-0 mt-1 text-[12px] leading-snug text-[#8B8B8B]">
                Nadie ha pagado todavía: estas cifras no son resultados, son lo que pasaría si los supuestos de abajo se cumplen.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 divide-y divide-white/[0.06] sm:grid-cols-3 sm:divide-x sm:divide-y-0">{ltvCells}</div>
          <div className="border-t border-white/[0.06] px-5 py-3 font-mono text-[10.5px] leading-relaxed text-[#5C5C5C]">Supuestos: {assumptionsLine}</div>
        </Card>
      ) : (
        <Split cols={3}>{ltvCells}</Split>
      )}

      {c.manualEntries === 0 && (
        <Note tag="Costos incompletos" tone="orange">
          No hay costos manuales en el periodo: CAC y ROI solo ven el gasto de IA del ledger. Registra marketing (anuncios, influencers) e infraestructura (Vercel, Supabase, Apple) para que signifiquen algo.
        </Note>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <BigNumber label="Costos registrados del periodo" value={fmtUsd(c.totalUsd)} caption={`${period}d`} />
          <p className="-mt-2 mb-4 font-mono text-[11px] leading-relaxed text-[#5C5C5C]">
            Registrados: IA (ledger, solo superficies que lo escriben{surfaces ? `: ${surfaces}` : ''}) + {fmtInt(c.manualEntries)} {c.manualEntries === 1 ? 'costo manual' : 'costos manuales'}.
          </p>
          {c.totalUsd > 0 ? <StatusBars rows={breakdown} labelWidth={120} stackMobile /> : <Empty>Sin costos en el periodo</Empty>}
        </Card>
        <CostForm onSaved={done} />
      </div>

      <CostList costs={costs} error={costsError} onRetry={onCostsRetry} onDeleted={done} />
      <Assumptions key={JSON.stringify(e.assumptions)} e={e} onSaved={done} />
    </section>
  );
}
