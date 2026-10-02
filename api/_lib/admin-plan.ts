// ============================================================
// "Plan de la semana": Claude turns the dashboard's deterministic findings (admin-insights.ts) into at most three
// priorities for the next 7 days. The model only orders and phrases what the findings already say: every priority
// must cite finding ids that exist, and the prompt forbids numbers that are not in the input. On demand only
// (an admin presses the button), cached 6 hours per set of findings, and written to the cost ledger (surface 'admin').
// ============================================================
import { createHash } from 'node:crypto';
import { completeJson, type LlmUsage } from './llm.js';
import { logLlmUsage } from './llm-usage.js';
import { getCache, setCache } from './api-cache.js';
import type { Insight } from './admin-insights.js';

const MODEL = 'claude-sonnet-5-5';
const CACHE_SEC = 6 * 3600;

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

const SYSTEM = `Eres el analista de crecimiento de Bobby (una app que analiza activos con tres perspectivas de IA). Recibes los hallazgos que el panel del dueño ya calculó con datos reales, sin el tráfico del equipo.
Escribe en español de México, claro y directo, para el dueño (no es analista de datos).
Reglas:
- Elige como máximo 3 prioridades para los próximos 7 días, ordenadas por impacto en traer y retener usuarios que leen.
- Cada prioridad debe citar en "findings" los ids exactos de los hallazgos que la justifican. No inventes hallazgos.
- No escribas ninguna cifra que no aparezca en los hallazgos o en las métricas recibidas. Si una muestra es pequeña, dilo.
- Primero lo que está roto y le cuesta usuarios hoy (urgente), después adquisición y activación; la monetización solo si ya hay gente activa.
- Pasos concretos que una persona pueda hacer esta semana; nada genérico como "mejorar la experiencia".`;

/** Builds (or reuses) the plan for this set of findings. */
export async function growthPlan(insights: Insight[], metrics: Record<string, unknown>, force = false): Promise<GrowthPlan> {
  const input = {
    metrics,
    findings: insights.map((i) => ({ id: i.id, level: i.level, area: i.area, title: i.title, detail: i.detail, action: i.action, evidence: i.evidence, sample: i.sample })),
  };
  const key = `admin-plan:${createHash('sha256').update(JSON.stringify(input)).digest('hex').slice(0, 24)}`;
  if (!force) {
    const hit = await getCache<GrowthPlan>(key);
    if (hit) return { ...hit, cached: true };
  }
  const usage: LlmUsage[] = [];
  try {
    const raw = await completeJson(
      { provider: 'anthropic', model: MODEL, effort: 'low', maxTokens: 4000, timeoutMs: 45_000 },
      SYSTEM, JSON.stringify(input), SCHEMA, { endpoint: 'admin-plan', role: 'plan', usage },
    ) as { summary?: unknown; priorities?: unknown };
    const ids = new Set(insights.map((i) => i.id));
    const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
    const priorities = (Array.isArray(raw.priorities) ? raw.priorities : []).slice(0, 3).map((p) => {
      const x = (p ?? {}) as Record<string, unknown>;
      return {
        title: str(x.title, 140), why: str(x.why, 600), measure: str(x.measure, 240),
        steps: (Array.isArray(x.steps) ? x.steps : []).map((s) => str(s, 240)).filter(Boolean).slice(0, 4),
        findings: (Array.isArray(x.findings) ? x.findings : []).map((f) => str(f, 60)).filter(Boolean),
      };
    // A priority that cites any finding that does not exist is dropped whole (its text may lean on it): F15.
    }).filter((p) => p.title && p.findings.length && p.findings.every((f) => ids.has(f)));
    const plan: GrowthPlan = {
      generatedAt: new Date().toISOString(), model: MODEL, summary: str(raw.summary, 400), priorities, cached: false,
      usd: Number(usage.reduce((t, u) => t + u.usd, 0).toFixed(4)),
    };
    if (priorities.length) await setCache(key, plan, CACHE_SEC);
    return plan;
  } finally {
    await logLlmUsage(usage, { surface: 'admin' }).catch(() => undefined);
  }
}
