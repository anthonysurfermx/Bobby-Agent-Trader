// "Dónde mejorar": the server's diagnosis (api/_lib/admin-insights.ts) as cards the owner can act on. Each card
// says what is happening, the numbers behind it and its sample, and what to do next; the first ones are open.
import { useState } from 'react';
import { ArrowUpRight, ChevronDown } from 'lucide-react';
import { adminAction, type GrowthPlan, type Insight, type InsightArea, type InsightLevel } from '@/lib/admin-client';
import { Btn, Card, Modal, Tag } from './ui';
import { toAdminError } from './useLoad';
import { fmtDateTime, fmtInt, fmtUsd } from './format';

const LEVEL: Record<InsightLevel, { label: string; tone: 'red' | 'orange' | 'blue' | 'neutral'; dot: string }> = {
  critical: { label: 'Urgente', tone: 'red', dot: '#F06A6A' },
  warn: { label: 'Atender', tone: 'orange', dot: '#F7A04B' },
  opportunity: { label: 'Oportunidad', tone: 'blue', dot: '#6CC4FF' },
  info: { label: 'Para saber', tone: 'neutral', dot: '#5C5C5C' },
};
const AREA: Record<InsightArea, string> = {
  operacion: 'Operación', medicion: 'Medición', adquisicion: 'Adquisición', activacion: 'Activación',
  conversion: 'Conversión', retencion: 'Retención', monetizacion: 'Monetización',
};
const TAB_LABEL: Record<string, string> = {
  resumen: 'Resumen', funnel: 'Funnel', audiencia: 'Audiencia', usuarios: 'Usuarios', membresias: 'Membresías', ia: 'IA', integraciones: 'Integraciones',
};

function InsightCard({ i, open, onToggle, onOpenTab }: { i: Insight; open: boolean; onToggle: () => void; onOpenTab?: (tab: string) => void }) {
  const lv = LEVEL[i.level];
  return (
    <li className="min-w-0 rounded-xl border border-white/[0.06] bg-[#1A1A1B]">
      <button type="button" onClick={onToggle} aria-expanded={open}
        className="flex w-full items-start gap-3 px-4 py-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#F28C38]">
        <span className="mt-[7px] h-2 w-2 shrink-0 rounded-full" style={{ background: lv.dot }} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <Tag tone={lv.tone}>{lv.label}</Tag>
            <Tag>{AREA[i.area] ?? i.area}</Tag>
            {i.sample != null && <span className="font-mono text-[10.5px] text-[#5C5C5C]">n={fmtInt(i.sample)}</span>}
          </span>
          <span className="mt-1.5 block text-[14px] leading-snug text-[#EDEDED]">{i.title}</span>
        </span>
        <ChevronDown className={`mt-1 h-4 w-4 shrink-0 text-[#5C5C5C] transition-transform ${open ? 'rotate-180' : ''}`} strokeWidth={1.6} aria-hidden />
      </button>
      {open && (
        <div className="border-t border-white/[0.05] px-4 pb-4 pt-3 sm:pl-9">
          <p className="m-0 text-[13px] leading-relaxed text-[#BDBDBD]">{i.detail}</p>
          <div className="mt-3 rounded-lg border border-[#F28C38]/20 bg-[#F28C38]/[0.06] px-3 py-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#F7A04B]">Qué hacer</span>
            <p className="m-0 mt-1 text-[13px] leading-relaxed text-[#EDEDED]">{i.action}</p>
          </div>
          {(i.evidence.length > 0 || onOpenTab) && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {i.evidence.map((e) => (
                <span key={e} className="rounded-md border border-white/[0.06] px-1.5 py-[3px] font-mono text-[10.5px] text-[#8B8B8B]">{e}</span>
              ))}
              {onOpenTab && i.tab !== 'resumen' && TAB_LABEL[i.tab] && (
                <button type="button" onClick={() => onOpenTab(i.tab)}
                  className="ml-auto inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.06em] text-[#8B8B8B] hover:text-[#EDEDED]">
                  Ver en {TAB_LABEL[i.tab]} <ArrowUpRight className="h-3 w-3" strokeWidth={1.8} aria-hidden />
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

/** "Plan de la semana": Claude orders the findings into ≤3 priorities (api/_lib/admin-plan.ts), on demand. */
function WeeklyPlan({ insights, period, internal, notify }: { insights: Insight[]; period: number; internal: boolean; notify: (text: string, ok?: boolean) => void }) {
  const [plan, setPlan] = useState<GrowthPlan | null>(null);
  // The plan's own load could not mark this browser: its figures may include the owner's traffic (the model was told).
  const [planMarkFailed, setPlanMarkFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const titles = new Map(insights.map((i) => [i.id, i.title]));
  const run = async (force: boolean) => {
    setBusy(true);
    try {
      const r = await adminAction<{ plan?: GrowthPlan; internalMarkFailed?: unknown }>({ action: 'growth-plan', days: period, internal, force });
      if (r.plan && r.plan.priorities.length) { setPlan(r.plan); setPlanMarkFailed(!internal && r.internalMarkFailed === true); }
      else notify('El modelo no devolvió un plan apoyado en los hallazgos. Intenta de nuevo.', false);
    } catch (e) {
      notify(toAdminError(e).message, false);
    } finally { setBusy(false); }
  };
  return (
    <div className="mt-4 border-t border-white/[0.06] pt-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1">
          <div className="text-[13px] text-[#EDEDED]/90">Plan de la semana</div>
          <p className="m-0 mt-1 text-[12px] leading-snug text-[#8B8B8B]">Claude ordena estos hallazgos en 3 prioridades para 7 días. No agrega cifras: cada prioridad cita los hallazgos en los que se basa.</p>
        </div>
        <Btn size="sm" variant={plan ? 'ghost' : 'secondary'} busy={busy} onClick={() => void run(!!plan)}>{plan ? 'Rehacer' : 'Escribir plan'}</Btn>
      </div>
      {plan && (
        <div className="mt-3 flex flex-col gap-3">
          {planMarkFailed && (
            <p className="m-0 font-mono text-[11px] text-[#F7A04B]">Sin verificar: este plan se calculó sin poder marcar este navegador como del equipo; sus cifras pueden incluir tu propio tráfico.</p>
          )}
          {plan.summary && <p className="m-0 text-[13px] leading-relaxed text-[#EDEDED]">{plan.summary}</p>}
          <ol className="m-0 flex list-none flex-col gap-2 p-0">
            {plan.priorities.map((p, k) => (
              <li key={p.title} className="rounded-xl border border-white/[0.06] bg-[#1A1A1B] px-4 py-3">
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-[12px] text-[#F7A04B]">{k + 1}</span>
                  <span className="text-[14px] leading-snug text-[#EDEDED]">{p.title}</span>
                </div>
                {p.why && <p className="m-0 mt-1.5 text-[12.5px] leading-relaxed text-[#BDBDBD]">{p.why}</p>}
                {p.steps.length > 0 && (
                  <ul className="m-0 mt-2 flex list-disc flex-col gap-1 pl-5 text-[12.5px] leading-relaxed text-[#EDEDED]">
                    {p.steps.map((st) => <li key={st}>{st}</li>)}
                  </ul>
                )}
                {p.measure && <p className="m-0 mt-2 font-mono text-[11px] text-[#8B8B8B]">Medir: {p.measure}</p>}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {p.findings.map((f) => <span key={f} className="rounded-md border border-white/[0.06] px-1.5 py-[3px] font-mono text-[10.5px] text-[#5C5C5C]" title={titles.get(f)}>{titles.get(f) ?? f}</span>)}
                </div>
              </li>
            ))}
          </ol>
          <p className="m-0 font-mono text-[10.5px] text-[#5C5C5C]">
            {plan.model} · {fmtDateTime(plan.generatedAt)}{plan.cached ? ' · guardado (6 h)' : ''} · costo {fmtUsd(plan.usd, true)} (registrado en IA)
          </p>
        </div>
      )}
    </div>
  );
}

/** The manual send's result in words. Resend accepting an email is not its delivery to the inbox. */
function digestSendMessage(r: { accepted?: unknown; emailId?: unknown; emailError?: unknown }): { text: string; ok: boolean } {
  if (r.accepted === true) return { text: `Resend aceptó el resumen${typeof r.emailId === 'string' && r.emailId ? ` (id ${r.emailId})` : ''}. Su entrega a tu bandeja no se confirma aquí.`, ok: true };
  if (r.emailError === 'not_configured') return { text: 'No hay destinatario configurado (BOBBY_ALERT_EMAIL).', ok: false };
  return { text: `Resend no aceptó el correo (${typeof r.emailError === 'string' && r.emailError ? r.emailError : 'sin detalle'}).`, ok: false };
}

/** The daily email (api/_lib/admin-digest.ts): what it would say right now, and a manual send. */
function DigestControls({ notify }: { notify: (text: string, ok?: boolean) => void }) {
  const [busy, setBusy] = useState<'preview' | 'send' | null>(null);
  const [preview, setPreview] = useState<{ subject: string; text: string; fresh: number; weekly: boolean } | null>(null);
  const run = async (kind: 'preview' | 'send') => {
    setBusy(kind);
    try {
      if (kind === 'preview') {
        const r = await adminAction<{ subject?: string; text?: string; fresh?: number; weekly?: boolean }>({ action: 'preview-digest' });
        setPreview({ subject: String(r.subject ?? ''), text: String(r.text ?? ''), fresh: Number(r.fresh ?? 0), weekly: Boolean(r.weekly) });
      } else {
        const r = await adminAction<{ accepted?: unknown; emailId?: unknown; emailError?: unknown }>({ action: 'send-digest' });
        const m = digestSendMessage(r);
        notify(m.text, m.ok);
        if (m.ok) setPreview(null);
      }
    } catch (e) {
      notify(toAdminError(e).message, false);
    } finally { setBusy(null); }
  };
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-white/[0.06] pt-3">
      <p className="m-0 min-w-0 flex-1 text-[12px] leading-snug text-[#8B8B8B]">
        Te aviso por email cada día a las 13:00 UTC si aparece algo urgente o por atender que no te haya mandado esta semana (lunes a domingo, UTC); los lunes, un resumen semanal. Solo se da por avisado cuando Resend acepta el correo.
      </p>
      <Btn size="sm" variant="ghost" busy={busy === 'preview'} onClick={() => void run('preview')}>Vista previa</Btn>
      <Modal
        open={!!preview} onOpenChange={(v) => { if (!v) setPreview(null); }}
        title="Así se vería el aviso hoy"
        description={preview ? (preview.fresh || preview.weekly ? `Asunto: ${preview.subject}` : 'Hoy no se enviaría: no hay hallazgos urgentes nuevos y no es lunes.') : undefined}
        footer={<Btn size="sm" busy={busy === 'send'} onClick={() => void run('send')}>Enviármelo ahora</Btn>}
      >
        <pre className="m-0 max-h-[50vh] overflow-auto whitespace-pre-wrap rounded-lg border border-white/[0.06] bg-[#0F0F10] p-3 font-mono text-[11.5px] leading-relaxed text-[#BDBDBD]">{preview?.text}</pre>
      </Modal>
    </div>
  );
}

export default function InsightsPanel({ insights, missing, onOpenTab, notify, period, internal, markFailed = false }: {
  insights: Insight[]; missing?: boolean; onOpenTab?: (tab: string) => void; notify?: (text: string, ok?: boolean) => void;
  period?: number; internal?: boolean;
  /** This load could not mark the owner's browser as the team's (the exclusion is not verified). */
  markFailed?: boolean;
}) {
  const urgent = insights.filter((i) => i.level === 'critical' || i.level === 'warn').length;
  const [showAll, setShowAll] = useState(false);
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const priority = ['critical', 'warn', 'opportunity', 'info'];
  const ordered = [...insights].sort((a, b) => priority.indexOf(a.level) - priority.indexOf(b.level));
  const visible = showAll ? ordered : ordered.slice(0, 3);
  const counts = (['critical', 'warn', 'opportunity', 'info'] as InsightLevel[]).map((l) => [l, insights.filter((i) => i.level === l).length] as const).filter(([, n]) => n > 0);
  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="m-0 text-[13px] font-medium text-[#EDEDED]">Prioridades</h2>
          <p className="m-0 mt-1 text-[11px] text-[#8B8B8B]">{missing ? 'Diagnóstico no disponible' : urgent ? `${fmtInt(urgent)} hallazgos por atender · primero los de mayor urgencia` : insights.length ? 'Sin hallazgos urgentes en la cobertura observada' : 'Sin hallazgos en la cobertura observada'}</p>
        </div>
        {counts.length > 0 && <div className="flex gap-1.5">{counts.filter(([l]) => l === 'critical' || l === 'warn').map(([l, n]) => <Tag key={l} tone={LEVEL[l].tone}>{LEVEL[l].label} {n}</Tag>)}</div>}
      </div>
      {missing ? (
        <p className="m-0 font-mono text-[12px] text-[#5C5C5C]">El diagnóstico no está disponible (el servidor no envió los datos de crecimiento).</p>
      ) : insights.length ? (
        <>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {visible.map((i) => <InsightCard key={i.id} i={i} open={open.has(i.id)} onToggle={() => toggle(i.id)} onOpenTab={onOpenTab} />)}
          </ul>
          {insights.length > 3 && (
            <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-3 font-mono text-[11px] uppercase tracking-[0.06em] text-[#8B8B8B] hover:text-[#EDEDED]">
              {showAll ? 'Mostrar 3 prioridades' : `Ver los ${insights.length} hallazgos`}
            </button>
          )}
          {!showAll && insights.length > 3 && <span className="ml-2 text-[10.5px] text-[#8B8B8B]">Incluye oportunidades e información</span>}
        </>
      ) : (
        <p className="m-0 font-mono text-[12px] text-[#5C5C5C]">Ninguna regla encontró algo que atender con los datos de este periodo.</p>
      )}
      {!missing && <details className="mt-3 border-t border-white/[0.06] pt-3 text-[11px] text-[#8B8B8B]">
        <summary className="cursor-pointer">Cómo se calcula y herramientas del diagnóstico</summary>
        <p className="m-0 mt-3 leading-relaxed">Reglas basadas en las cifras del periodo, {internal ? 'incluyendo al equipo' : markFailed ? 'con exclusión del equipo sin verificar para esta carga' : 'sin el tráfico del equipo'}. Cada hallazgo conserva su muestra y evidencia; una cobertura incompleta limita el diagnóstico.</p>
        {notify && insights.length > 0 && period != null && <WeeklyPlan insights={insights} period={period} internal={!!internal} notify={notify} />}
        {notify && <DigestControls notify={notify} />}
      </details>}
    </Card>
  );
}
