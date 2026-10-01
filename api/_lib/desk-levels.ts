// ============================================================
// The desk's analysis levels (docs/ai/2026-09-29-bobby-intelligence-brief.md §4b) — the single source
// for what each level runs and how much of it each plan gets. The SQL (20260929150000) only counts.
//   · Rápido:   gpt-6-luna ×3 on the 1H evidence, with the horizon-sufficiency note (L0);
//   · Profundo: gpt-6-luna debaters and a Claude Sonnet 5.5 CIO, on evidence v2 (more timeframes,
//               crypto derivatives, Bobby's own record on the asset);
//   · Máximo:   Claude Sonnet 5.5 at high effort for every role, evidence v2, a second round
//               (Alpha answers Red Team) and scenarios. Opus is not used in the product.
// Rápido rides the existing read meter (bobby_consume_read); Profundo and Máximo have their own.
// ============================================================
import type { ModelSpec } from './llm.js';

export type DeskLevel = 'rapido' | 'profundo' | 'maximo';
export type PremiumLevel = Exclude<DeskLevel, 'rapido'>;
export const DESK_LEVELS: readonly DeskLevel[] = ['rapido', 'profundo', 'maximo'];
export const isDeskLevel = (v: unknown): v is DeskLevel => typeof v === 'string' && (DESK_LEVELS as readonly string[]).includes(v);

/** [uses, window in days] per plan for the premium levels. Conservative until the real cost is measured. */
export const LEVEL_LIMITS = {
  anon: { profundo: [1, 30], maximo: [0, 30] },
  free: { profundo: [3, 7], maximo: [1, 7] },
  pro: { profundo: [60, 30], maximo: [10, 30] },
} as const;

/** Invite a friend: each new Apple/Google account through your link adds Bobby Pro days, up to `maxFriends`. */
export const REFERRAL = {
  maxFriends: 5,
  rewardDays: (() => { const n = Number(process.env.BOBBY_REFERRAL_PRO_DAYS); return Number.isInteger(n) && n > 0 && n <= 366 ? n : 30; })(),
  /** A friend counts only if their account is this new when they accept. */
  newAccountDays: 7,
};

export interface LevelPlan {
  alpha: ModelSpec; red: ModelSpec; cio: ModelSpec;
  /** Rápido only: the model that answers if the account cannot use the primary one (401/403/404),
   *  so the default desk never goes down on a key's model access. Premium levels never fall back. */
  fallback: ModelSpec | null;
  /** Máximo: Alpha answers Red Team before the CIO decides. */
  rebuttal: ModelSpec | null;
  evidence: 'v1' | 'v2';
  scenarios: boolean;
  /** Whole-debate budget, inside the endpoint's maxDuration. */
  budgetMs: number;
}

const luna = (): ModelSpec => ({ provider: 'openai', model: process.env.BOBBY_DESK_MODEL || 'gpt-6-luna', maxTokens: 2400, timeoutMs: 30_000 });
const sonnet = (effort: 'medium' | 'high'): ModelSpec => ({ provider: 'anthropic', model: 'claude-sonnet-5-5', effort, maxTokens: effort === 'high' ? 6000 : 4000, timeoutMs: effort === 'high' ? 70_000 : 55_000 });

export function levelPlan(level: DeskLevel): LevelPlan {
  if (level === 'maximo') {
    const s = sonnet('high');
    return { alpha: s, red: s, rebuttal: s, cio: s, fallback: null, evidence: 'v2', scenarios: true, budgetMs: 160_000 };
  }
  if (level === 'profundo') return { alpha: luna(), red: luna(), rebuttal: null, cio: sonnet('medium'), fallback: null, evidence: 'v2', scenarios: false, budgetMs: 120_000 };
  return { alpha: luna(), red: luna(), rebuttal: null, cio: luna(), fallback: { provider: 'openai', model: 'gpt-4o-mini', maxTokens: 650, timeoutMs: 25_000 }, evidence: 'v1', scenarios: false, budgetMs: 85_000 };
}

/** Does this level need the Anthropic key? */
export const needsAnthropic = (level: DeskLevel) => level !== 'rapido';

/** Equivalent role on the other provider; the evidence, schemas and safety gates stay unchanged. */
export function alternateProvider(spec: ModelSpec, level: DeskLevel): ModelSpec | null {
  if (spec.provider === 'openai') {
    if (!process.env.ANTHROPIC_API_KEY) return null;
    return { ...sonnet(level === 'maximo' ? 'high' : 'medium'),
      timeoutMs: level === 'rapido' ? 25_000 : spec.timeoutMs,
      maxTokens: spec.maxTokens };
  }
  if (!process.env.OPENAI_API_KEY) return null;
  return { provider: 'openai', model: level === 'maximo' ? 'gpt-6-sol' : luna().model,
    effort: level === 'maximo' ? 'high' : undefined, maxTokens: spec.maxTokens, timeoutMs: spec.timeoutMs };
}
