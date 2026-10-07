// ============================================================
// The desk's analysis levels (docs/ai/2026-09-29-bobby-intelligence-brief.md §4b) — the single source
// for what each level runs and how much of it each plan gets. The SQL (20260929150000) only counts.
// Each level uses Haiku 5.5 for Free readers and Opus 5.5 for server-confirmed Bobby Pro accounts.
//   · Rápido:   the plan's Claude model (low effort) ×3 on the 1H evidence, with the horizon-sufficiency note (L0);
//   · Profundo: low-effort debaters and a medium-effort CIO, on evidence v2 (more timeframes,
//               crypto derivatives, Bobby's own record on the asset);
//   · Máximo:   the same plan's model at high effort for every role, evidence v2, a second round
//               (Alpha answers Red Team) and scenarios. A Free reader's Máximo stays on Haiku.
// BOBBY_APP_TEXT_MODEL and BOBBY_PRO_TEXT_MODEL configure the Free and Pro models respectively.
// When its credit runs out a role switches to OpenAI
// (gpt-6-luna, gpt-6-sol on Máximo) and the other way round — see alternateProvider. BOBBY_LLM_PRIMARY=openai
// restores the earlier OpenAI-first plans for Rápido/Profundo without a code change.
// Rápido rides the existing read meter (bobby_consume_read); Profundo and Máximo have their own.
// ============================================================
import type { ModelSpec } from './llm.js';
import { appModelSpec, appPrimaryProvider, type AppTextTier } from './app-model.js';

export type DeskLevel = 'rapido' | 'profundo' | 'maximo';
export type PremiumLevel = Exclude<DeskLevel, 'rapido'>;
export const DESK_LEVELS: readonly DeskLevel[] = ['rapido', 'profundo', 'maximo'];
export const isDeskLevel = (v: unknown): v is DeskLevel => typeof v === 'string' && (DESK_LEVELS as readonly string[]).includes(v);

/** The Rápido reads a person gets without paying: a guest per 30 days, a free account per rolling 7 days.
 *  Doubled on 2026-10-07 (owner's decision: see more of Bobby before deciding to pay). The meter itself is SQL
 *  (bobby_consume_read / bobby_read_access, 20261007161949) and states the same two numbers;
 *  scripts/test-free-reads-pg.mts fails if the two places disagree. */
export const FREE_READS = { guest: 6, weekly: 20 } as const;

/** [uses, window in days] per plan for the premium levels. What a guest and a free account get doubled with the
 *  reads (2026-10-07, owner's decision, Máximo included: a free account's two a week come to 8–9 a month, close
 *  to the 10 of Bobby Pro, whose advantage is Quick without a cap and 60 Profundo). */
export const LEVEL_LIMITS = {
  anon: { profundo: [2, 30], maximo: [0, 30] },
  free: { profundo: [6, 7], maximo: [2, 7] },
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
const claude = (effort: 'low' | 'medium' | 'high', tier: AppTextTier): ModelSpec => appModelSpec(effort, effort === 'high' ? 6000 : 4000,
  effort === 'high' ? 70_000 : effort === 'medium' ? 55_000 : 40_000, tier);

/** The provider every role tries first. Anything but `openai` means the configured app Claude model. */
export const primaryProvider = appPrimaryProvider;

export function levelPlan(level: DeskLevel, tier: AppTextTier = 'free'): LevelPlan {
  if (level === 'maximo') {
    const s = claude('high', tier);
    return { alpha: s, red: s, rebuttal: s, cio: s, fallback: null, evidence: 'v2', scenarios: true, budgetMs: 160_000 };
  }
  const claudeFirst = primaryProvider() === 'anthropic';
  if (level === 'profundo') {
    return claudeFirst
      ? { alpha: claude('low', tier), red: claude('low', tier), rebuttal: null, cio: claude('medium', tier), fallback: null, evidence: 'v2', scenarios: false, budgetMs: 120_000 }
      : { alpha: luna(), red: luna(), rebuttal: null, cio: claude('medium', tier), fallback: null, evidence: 'v2', scenarios: false, budgetMs: 120_000 };
  }
  // Rápido keeps a model-access fallback (401/403/404 on the primary model) on the other provider.
  return claudeFirst
    ? { alpha: claude('low', tier), red: claude('low', tier), rebuttal: null, cio: claude('low', tier), fallback: { ...luna(), timeoutMs: 25_000 }, evidence: 'v1', scenarios: false, budgetMs: 85_000 }
    : { alpha: luna(), red: luna(), rebuttal: null, cio: luna(), fallback: { provider: 'openai', model: 'gpt-4o-mini', maxTokens: 650, timeoutMs: 25_000 }, evidence: 'v1', scenarios: false, budgetMs: 85_000 };
}

/** Does this level need the Anthropic key? */
export const needsAnthropic = (level: DeskLevel) => level !== 'rapido';

/** Equivalent role on the other provider; the evidence, schemas and safety gates stay unchanged. */
export function alternateProvider(spec: ModelSpec, level: DeskLevel, tier: AppTextTier = 'free'): ModelSpec | null {
  if (spec.provider === 'openai') {
    if (!process.env.ANTHROPIC_API_KEY) return null;
    return { ...claude(level === 'maximo' ? 'high' : level === 'profundo' ? 'medium' : 'low', tier),
      timeoutMs: level === 'rapido' ? 25_000 : spec.timeoutMs,
      maxTokens: spec.maxTokens };
  }
  if (!process.env.OPENAI_API_KEY) return null;
  return { provider: 'openai', model: level === 'maximo' ? 'gpt-6-sol' : luna().model,
    effort: level === 'maximo' ? 'high' : undefined, maxTokens: spec.maxTokens, timeoutMs: spec.timeoutMs };
}
