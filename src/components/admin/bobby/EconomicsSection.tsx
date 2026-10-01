// "Economía unitaria": revenue, CAC, LTV, ROI and LTV:CAC from the server's /api/admin?view=lifecycle, each
// with the formula it came from; the costs that feed them (register / delete) and the owner's assumptions.
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { adminAction, type AdminError, type CostKind, type CostRow, type Economics } from '@/lib/admin-client';
import { Btn, Card, CardHead, Empty, ErrorState, Field, FormMessage, Loading, Modal, Segmented, StaleBanner, TableScroll, Tag, TextInput, td, th, tr } from './ui';
import { BigNumber, StatusBars, type StatusRow } from './charts';
import { fmtDate, fmtDec, fmtInt, fmtUsd } from './format';
import { toAdminError } from './useLoad';

type Notify = (text: string, ok?: boolean) => void;

const pct = (v: number | null | undefined, digits = 1) => (v == null || !Number.isFinite(v) ? '—' : `${(v * 100).toFixed(digits).replace(/\.0$/, '')}%`);
const KIND_LABEL: Record<CostKind, string> = { marketing: 'Marketing', infra: 'Infra', other: 'Otro' };
const todayLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const channelInput = (v: string) => v.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').slice(0, 32);
function moneyInput(raw: string): string {
  const [int = '', ...rest] = raw.replace(/,/g, '.').replace(/[^\d.]/g, '').split('.');
  return rest.length ? `${int.slice(0, 7)}.${rest.join('').slice(0, 2)}` : int.slice(0, 7);
}

/** One cell of the unit-economics strips: label, big mono value, details and the formula behind it. */
function EconCell({ label, value, tone, details, formula, hint, tag }: {
  label: string; value: ReactNode; tone?: 'green' | 'red' | 'amber'; details?: ReactNode[]; formula: string; hint?: string; tag?: ReactNode;
}) {
  const color = tone === 'green' ? 'text-[#4ADE80]' : tone === 'red' ? 'text-[#F06A6A]' : tone === 'amber' ? 'text-[#F7A04B]' : 'text-[#EDEDED]';
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
  const [date, setDate] = useState(todayLocal);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const value = Number(amount);
  const valid = amount !== '' && Number.isFinite(value) && value > 0 && value <= 1_000_000 && (!date || date <= todayLocal());

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
        <Field label="Fecha"><TextInput mono type="date" value={date} max={todayLocal()} onChange={(e) => setDate(e.target.value)} /></Field>
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
              El precio del último cobro real y la comisión real de las compras tienen prioridad; el churn observado reemplaza al supuesto cuando hay 5+ suscripciones en la base.
            </p>
            <Btn type="submit" variant="primary" busy={busy} disabled={problems.length > 0}>Guardar supuestos</Btn>
          </div>
        </div>
      </form>
    </Card>
  );
}

export default function EconomicsSection({ e, costs, costsError, onCostsRetry, period, notify, onChanged }: {
  e: Economics; costs: CostRow[] | null; costsError: AdminError | null; onCostsRetry: () => void; period: number; notify: Notify; onChanged: () => void;
}) {
  const r = e.revenue, c = e.costs, acq = e.acquisition, l = e.ltv;
  const done = (text: string) => { notify(text); onChanged(); };
  const noMarketing = c.marketingUsd <= 0;
  const noPaying = acq.newPaying <= 0;
  const cacHint = noMarketing ? 'registra gasto de marketing' : noPaying ? 'aún sin clientes de pago' : undefined;
  const ratio = l.ltvToCac;
  const capped = l.monthlyChurn > 0 && l.lifetimeMonths < 1 / l.monthlyChurn - 0.05;
  const churnTag = l.churnSource === 'observed' ? <Tag tone="green">Observado</Tag> : l.churnSource === 'assumed' ? <Tag tone="orange">Supuesto</Tag> : <Tag>Default</Tag>;

  const rows: StatusRow[] = [
    ...c.byChannel.map((ch) => ({ label: `Mkt · ${ch.channel}`, value: ch.usd, fill: 'orange' as const, display: fmtUsd(ch.usd) })),
    ...(c.byChannel.length === 0 && c.marketingUsd > 0 ? [{ label: 'Marketing', value: c.marketingUsd, fill: 'orange' as const, display: fmtUsd(c.marketingUsd) }] : []),
    { label: 'Infra', value: c.infraUsd, fill: 'blue', display: fmtUsd(c.infraUsd) },
    { label: 'Otros', value: c.otherUsd, fill: 'blue', display: fmtUsd(c.otherUsd) },
    { label: 'IA (ledger)', value: c.llmUsd, fill: 'blue', display: fmtUsd(c.llmUsd, true) },
  ];
  const breakdown = rows.filter((row) => row.value > 0);

  return (
    <section className="flex flex-col gap-4" aria-labelledby="econ-title">
      <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 id="econ-title" className="m-0 text-[16px] font-medium text-[#EDEDED]">Economía unitaria</h2>
        <span className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-[#5C5C5C]">{period}d · desde {fmtDate(e.since)}</span>
      </div>

      <Split cols={3}>
        <EconCell
          label="Neto estimado" value={fmtUsd(r.netUsd)}
          details={[
            <>bruto {fmtUsd(r.grossUsd)} · reembolsos {fmtUsd(r.refundsUsd)}</>,
            <>MRR neto <span className="text-[#EDEDED]">{fmtUsd(r.mrrNetUsd)}</span> · bruto {fmtUsd(r.mrrGrossUsd)}</>,
            <>{fmtInt(r.activeSubscriptions)} suscripciones activas · {fmtInt(r.newPaying)} nuevas</>,
          ]}
          formula={`neto estimado = bruto − comisión e impuestos de la tienda − reembolsos · MRR = ${fmtInt(r.activeSubscriptions)} × ${fmtUsd(r.priceUsd)} × ${pct(r.takehome)}`}
        />
        <EconCell
          label="CAC" value={acq.cacPerPaying != null ? fmtUsd(acq.cacPerPaying) : '—'} hint={acq.cacPerPaying == null ? cacHint : undefined}
          details={[
            <>por cuenta {acq.cacPerAccount != null ? fmtUsd(acq.cacPerAccount) : '—'} · {fmtInt(acq.newAccounts)} cuentas nuevas</>,
            <>marketing {fmtUsd(c.marketingUsd)} / {fmtInt(acq.newPaying)} nuevos de pago</>,
          ]}
          formula="CAC = marketing ÷ nuevos de pago"
        />
        <EconCell
          label="LTV" value={fmtUsd(l.ltvUsd)} tag={churnTag}
          details={[
            <>contribución mensual {fmtUsd(l.monthlyContributionUsd)} × vida {fmtDec(l.lifetimeMonths)} meses</>,
            <>churn {pct(l.monthlyChurn)} / mes{capped ? ` · tope ${fmtDec(l.lifetimeMonths)} m` : ''}</>,
          ]}
          formula={`LTV = (${fmtUsd(l.monthlyNetPerSubUsd)} − ${fmtUsd(l.monthlyLlmPerUserUsd, true)} IA/usuario) ÷ ${pct(l.monthlyChurn)} churn${capped ? ` (tope ${fmtDec(l.lifetimeMonths)} m)` : ''}`}
        />
      </Split>

      <Split cols={2}>
        <EconCell
          label="ROI" value={e.roi.roi != null ? `${e.roi.roi >= 0 ? '+' : ''}${pct(e.roi.roi)}` : '—'}
          tone={e.roi.roi == null ? undefined : e.roi.roi >= 0 ? 'green' : 'red'} hint={e.roi.roi == null ? 'registra costos' : undefined}
          details={[
            <>ganancia <span className={e.roi.profitUsd >= 0 ? 'text-[#4ADE80]' : 'text-[#F06A6A]'}>{fmtUsd(e.roi.profitUsd)}</span> = neto {fmtUsd(r.netUsd)} − costos {fmtUsd(c.totalUsd)}</>,
          ]}
          formula="ROI = (neto − costos) ÷ costos"
        />
        <EconCell
          label="LTV : CAC" value={ratio != null ? `${fmtDec(ratio)}×` : '—'}
          tone={ratio == null ? undefined : ratio >= 3 ? 'green' : ratio >= 1 ? 'amber' : 'red'} hint={ratio == null ? cacHint : undefined}
          details={[<>payback {l.paybackMonths != null ? `${fmtDec(l.paybackMonths)} meses` : '—'}</>, <>meta: 3× o más</>]}
          formula="LTV:CAC = LTV ÷ CAC · payback = CAC ÷ contribución mensual"
        />
      </Split>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <BigNumber label="Costos del periodo" value={fmtUsd(c.totalUsd)} caption={`${period}d`} />
          {c.totalUsd > 0 ? <StatusBars rows={breakdown} labelWidth={120} stackMobile /> : <Empty>Sin costos en el periodo</Empty>}
        </Card>
        <CostForm onSaved={done} />
      </div>

      <CostList costs={costs} error={costsError} onRetry={onCostsRetry} onDeleted={done} />
      <Assumptions key={JSON.stringify(e.assumptions)} e={e} onSaved={done} />
    </section>
  );
}
