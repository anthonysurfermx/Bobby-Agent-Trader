// ============================================================
// The desk's analysis levels (docs/ai/2026-09-29-bobby-intelligence-brief.md §4b) — the single source
// for what each level runs and how much of it each plan gets. The SQL (20260929150000) only counts.
//   · Rápido:   gpt-6-luna ×3 on the 1H evidence, with the horizon-sufficiency note (L0);
//   · Profundo: gpt-6-luna debaters and a Claude Sonnet 5.5 CIO, on evidence v2 (more timeframes,
//               crypto derivatives, Bobby's own record on the asset);
//   · Máximo:   Claude Sonnet 5.5 at high effort for every role, evidence v2, a second round
//               (Alpha answers Red Team) and scenarios. Opus is not used in the product.
// A provider outage switches the current role to the other provider. BOBBY_DESK_PRIMARY_PROVIDER
// can temporarily prioritize one provider across levels without changing the product's spend caps.
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
  /** Máximo: Alpha answers Red Team before the CIO decides. */
  rebuttal: ModelSpec | null;
  evidence: 'v1' | 'v2';
  scenarios: boolean;
  /** Whole-debate budget, inside the endpoint's maxDuration. */
  budgetMs: number;
}

const luna = (): ModelSpec => ({ provider: 'openai', model: process.env.BOBBY_DESK_MODEL || 'gpt-6-luna', maxTokens: 2400, timeoutMs: 30_000 });
/** Retain the existing Rápido model-access fallback when Sonnet cannot answer either. */
export const quickAccessFallback = (): ModelSpec => ({ provider: 'openai', model: 'gpt-4o-mini', maxTokens: 650, timeoutMs: 25_000 });
const sol = (effort: 'medium' | 'high'): ModelSpec => ({ provider: 'openai', model: 'gpt-6-sol', effort, maxTokens: effort === 'high' ? 6000 : 4000, timeoutMs: effort === 'high' ? 70_000 : 55_000 });
const sonnet = (effort: 'low' | 'medium' | 'high'): ModelSpec => ({
  provider: 'anthropic', model: 'claude-sonnet-5-5', effort,
  maxTokens: effort === 'high' ? 6000 : effort === 'medium' ? 4000 : 2400,
  timeoutMs: effort === 'high' ? 70_000 : effort === 'medium' ? 55_000 : 22_000,
});

/** The other provider answers the same role with the same output schema. */
export function alternateModel(level: DeskLevel, primary: ModelSpec): ModelSpec {
  if (primary.provider === 'openai') return sonnet(level === 'rapido' ? 'low' : level === 'maximo' ? 'high' : 'medium');
  return level === 'rapido' ? luna() : sol(level === 'maximo' ? 'high' : 'medium');
}

export function levelPlan(level: DeskLevel): LevelPlan {
  if (level === 'maximo') {
    const s = sonnet('high');
    return { alpha: s, red: s, rebuttal: s, cio: s, evidence: 'v2', scenarios: true, budgetMs: 160_000 };
  }
  if (level === 'profundo') return { alpha: luna(), red: luna(), rebuttal: null, cio: sonnet('medium'), evidence: 'v2', scenarios: false, budgetMs: 120_000 };
  return { alpha: luna(), red: luna(), rebuttal: null, cio: luna(), evidence: 'v1', scenarios: false, budgetMs: 85_000 };
}
