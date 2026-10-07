// ============================================================
// "Plan de la semana": Claude turns the dashboard's deterministic findings (admin-insights.ts) into at most three
// priorities for the next 7 days. The model only orders and phrases what the findings already say: a priority is
// kept only if every finding id it cites exists and every figure in its title, why, steps and measure appears in those findings
// (7, the plan's horizon, and the period length only as a span of days: "7 días", "30d").
// On demand only (an admin presses the button), cached 6 hours per set of findings, one generation at a time across
// instances (an atomic lock with a nonce: only its holder releases it, also for a forced refresh), bounded by the
// caller's deadline, and written to the cost ledger (surface 'admin') as soon as the model answers.
// ============================================================
import { createHash, randomBytes } from 'node:crypto';
import { waitUntil } from '@vercel/functions';
import { completeJson, type LlmUsage } from './llm.js';
import { logLlmUsage } from './llm-usage.js';
import { claimCache, getCache, releaseCache, setCache } from './api-cache.js';
import type { Insight } from './admin-insights.js';
import { AdminError } from './admin.js';
import { appModelSpec, appTextModel } from './app-model.js';

const CACHE_SEC = 6 * 3600;
const LOCK_KEY = 'admin-plan:lock';
const LOCK_SEC = 120;               // longer than one generation (45 s model timeout); a crashed one frees itself
const MODEL_TIMEOUT_MS = 45_000;
const MIN_MODEL_MS = 10_000;        // less time than this left before the deadline: no model call at all

export interface PlanPriority { title: string; why: string; steps: string[]; measure: string; findings: string[] }
export interface GrowthPlan { generatedAt: string; model: string; summary: string; priorities: PlanPriority[]; cached: boolean; usd: number }

const SCHEMA = {
  name: 'growth_plan',
  schema: {
    type: 'object', additionalProperties: false, required: ['summary', 'priorities'],
    properties: {
      summary: { type: 'string', description: 'Dos frases: el estado real y la apuesta de la semana.' },
      // No maxItems: Anthropic's structured outputs reject array bounds over raw HTTP; the limits are applied after parsing.
      priorities: {
        type: 'array', description: 'Tres como máximo.',
        items: {
          type: 'object', additionalProperties: false, required: ['title', 'why', 'steps', 'measure', 'findings'],
          properties: {
            title: { type: 'string' },
            why: { type: 'string' },
            steps: { type: 'array', description: 'Cuatro pasos como máximo.', items: { type: 'string' } },
            measure: { type: 'string', description: 'Qué cifra del panel mirar en 7 días para saber si funcionó.' },
            findings: { type: 'array', items: { type: 'string' }, description: 'ids de los hallazgos en los que se basa.' },
          },
        },
      },
    },
  },
};

/** Whether the figures behind the findings leave the team out, and whether that exclusion was verified for this load. */
export type PlanTeam = 'excluded' | 'unverified' | 'included';
const TEAM_LINE: Record<PlanTeam, string> = {
  excluded: 'sin el tráfico del equipo',
  // The /admin session mark failed: the owner's own browser may be inside the figures.
  unverified: 'en principio sin el tráfico del equipo, pero en esta carga no se pudo marcar el navegador del dueño, así que las cifras pueden incluir su propio tráfico (no lo des por excluido; si una cifra pequeña podría ser del equipo, dilo)',
  included: 'incluyendo el tráfico del propio equipo (el dueño lo pidió así)',
};
const system = (team: PlanTeam) => `Eres el analista de crecimiento de Bobby (una app que analiza activos con tres perspectivas de IA). Recibes los hallazgos que el panel del dueño ya calculó con datos reales, ${TEAM_LINE[team]}.
Escribe en español de México, claro y directo, para el dueño (no es analista de datos).
Reglas:
- Elige como máximo 3 prioridades para los próximos 7 días, ordenadas por impacto en traer y retener usuarios que leen.
- Cada prioridad debe citar en "findings" los ids exactos de los hallazgos que la justifican. No inventes hallazgos.
- Toda cifra que escribas en "title", "why", "steps" o "measure" debe estar copiada tal cual de los hallazgos que citas; si no está ahí, no la escribas (una prioridad con otra cifra se descarta). La única excepción es un lapso de días: "7 días" o la duración del periodo ("30 días"). Si una muestra es pequeña, dilo.
- En "summary" tampoco escribas cifras que no estén en los hallazgos o en las métricas recibidas.
- "Pro" es acceso, no pago: solo memberships.paidVerified son pagadores verificados. El acceso por sí solo no prueba ingresos. Las membresías sin verificar, de prueba o regaladas no son pagadores; sólo los cobros de producción registrados prueban ingresos.
- Primero lo que está roto y le cuesta usuarios hoy (urgente), después adquisición y activación; la monetización solo si ya hay gente activa.
- Pasos concretos que una persona pueda hacer esta semana; nada genérico como "mejorar la experiencia".`;

/** The numbers in a text ("1,234" → "1234") and what follows each one, to check that a priority only repeats figures
 *  of its findings. */
const tokens = (text: string) => [...text.matchAll(/\d+(?:[.,]\d+)*/g)].map((m) => ({ value: m[0].replace(/,/g, ''), after: text.slice(m.index! + m[0].length) }));
const numbers = (text: string) => tokens(text).map((t) => t.value);
const DAY_UNIT = /^\s*(?:d|d[ií]as?)(?![A-Za-zÁÉÍÓÚáéíóúÑñ])/i;
/** 7 (the plan's horizon) and the period length are free only as a span of days ("7 días", "30d"); as any other
 *  figure ("7 lectores", "30 cuentas") they must come from the cited findings like every number. */
const dayFigure = (t: { value: string; after: string }, days: unknown) => (t.value === '7' || t.value === String(days)) && DAY_UNIT.test(t.after);
/** Every primitive value inside `v`, as text (so two array items never read as one number). */
const leaves = (v: unknown): string[] => (v == null ? [] : typeof v === 'object' ? Object.values(v).flatMap(leaves) : [String(v)]);

/** Builds (or reuses) the plan for this set of findings. `deadline` (epoch ms): the model must have answered by then
 *  (the caller's function budget); `team`: what the figures say about the team's own traffic. */
export async function growthPlan(insights: Insight[], metrics: Record<string, unknown>, force = false,
  opts: { deadline?: number; team?: PlanTeam } = {}): Promise<GrowthPlan> {
  const model = appTextModel();
  const team = opts.team ?? 'excluded';
  const input = {
    metrics: { ...metrics, team } as Record<string, unknown>,
    findings: insights.map((i) => ({ id: i.id, level: i.level, area: i.area, title: i.title, detail: i.detail, action: i.action, evidence: i.evidence, sample: i.sample })),
  };
  const key = `admin-plan:${createHash('sha256').update(JSON.stringify({ model, input })).digest('hex').slice(0, 24)}`;
  if (!force) {
    const hit = await getCache<GrowthPlan>(key);
    if (hit) return { ...hit, cached: true };
  }
  // One generation at a time, forced or not: a second press while the model runs is refused, not paid twice. The
  // nonce makes the release conditional: a holder whose claim expired never frees the next holder's lock.
  const nonce = randomBytes(12).toString('hex');
  const lock = await claimCache(LOCK_KEY, LOCK_SEC, { at: new Date().toISOString(), nonce });
  if (lock === false) throw new AdminError(409, 'A plan is already being generated. Try again in a minute.');
  if (lock === null) throw new AdminError(503, 'The plan lock is unavailable. Try again.');
  const usage: LlmUsage[] = [];
  try {
    if (!force) {
      const hit = await getCache<GrowthPlan>(key); // a generation that finished while this one waited for the lock
      if (hit) return { ...hit, cached: true };
    }
    const timeoutMs = Math.min(MODEL_TIMEOUT_MS, (opts.deadline ?? Date.now() + MODEL_TIMEOUT_MS) - Date.now());
    if (timeoutMs < MIN_MODEL_MS) throw new AdminError(503, 'There is not enough time left to write the plan. Try again.');
    let raw: { summary?: unknown; priorities?: unknown };
    try {
      raw = await completeJson(
        appModelSpec('low', 4000, timeoutMs),
        system(team), JSON.stringify(input), SCHEMA, { endpoint: 'admin-plan', role: 'plan', usage },
      ) as { summary?: unknown; priorities?: unknown };
    } finally {
      // The spend reaches the ledger as soon as the model answered (or failed), kept alive past the response.
      const logged = logLlmUsage(usage, { surface: 'admin' }).catch(() => undefined);
      try { waitUntil(logged); } catch { /* outside a request context the promise still runs */ }
    }
    const byId = new Map(insights.map((i) => [i.id, i]));
    const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
    const priorities = (Array.isArray(raw.priorities) ? raw.priorities : []).slice(0, 3).map((p) => {
      const x = (p ?? {}) as Record<string, unknown>;
      return {
        title: str(x.title, 140), why: str(x.why, 600), measure: str(x.measure, 240),
        steps: (Array.isArray(x.steps) ? x.steps : []).map((s) => str(s, 240)).filter(Boolean).slice(0, 4),
        findings: (Array.isArray(x.findings) ? x.findings : []).map((f) => str(f, 60)),
      };
    }).filter((p) => {
      // The plan never stands on an invented finding or figure: one unknown id, or one number in the title/why that
      // the cited findings do not carry, drops the whole priority.
      if (!p.title || !p.findings.length || !p.findings.every((f) => byId.has(f))) return false;
      const cited = p.findings.map((f) => byId.get(f)!);
      const allowed = new Set(cited.flatMap((i) => numbers([i.title, i.detail, i.action, ...i.evidence].join(' '))));
      return tokens([p.title, p.why, ...p.steps, p.measure].join(' ')).every((t) => allowed.has(t.value) || dayFigure(t, metrics.days));
    });
    // The summary cites no finding: its figures must exist somewhere in the findings or the metrics (the period length
    // only as a span of days, like 7), or it is left out.
    const { days: _days, ...figures } = input.metrics;
    const known = new Set(numbers([...leaves(input.findings), ...leaves(figures)].join(' ')));
    const summary = str(raw.summary, 400);
    const plan: GrowthPlan = {
      generatedAt: new Date().toISOString(), model, summary: tokens(summary).every((t) => known.has(t.value) || dayFigure(t, metrics.days)) ? summary : '', priorities, cached: false,
      usd: Number(usage.reduce((t, u) => t + u.usd, 0).toFixed(4)),
    };
    if (priorities.length) await setCache(key, plan, CACHE_SEC);
    return plan;
  } finally {
    await releaseCache(LOCK_KEY, nonce);
  }
}
