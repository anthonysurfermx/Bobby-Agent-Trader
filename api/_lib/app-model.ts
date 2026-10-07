import type { ModelSpec } from './llm.js';

/** One model policy for app text, debate and the thesis reviewer; audio has its own provider. */
export const DEFAULT_APP_TEXT_MODEL = 'claude-haiku-5-5';

export function appTextModel(env: NodeJS.ProcessEnv = process.env): string {
  const model = env.BOBBY_APP_TEXT_MODEL?.trim() || DEFAULT_APP_TEXT_MODEL;
  if (!/^claude-[a-z0-9][a-z0-9.-]{2,63}$/.test(model)) throw new Error('Invalid app text model configuration');
  return model;
}

/** Preserve the explicit emergency OpenAI-first switch and the reciprocal provider fallback. */
export const appPrimaryProvider = (env: NodeJS.ProcessEnv = process.env): ModelSpec['provider'] =>
  env.BOBBY_LLM_PRIMARY === 'openai' ? 'openai' : 'anthropic';

/** Availability is about either configured provider, including the permitted fallback. */
export const hasAppTextBackend = (env: NodeJS.ProcessEnv = process.env): boolean =>
  Boolean(env.ANTHROPIC_API_KEY || env.OPENAI_API_KEY);

export function appModelSpec(effort: 'low' | 'medium' | 'high', maxTokens: number, timeoutMs: number): ModelSpec {
  return { provider: 'anthropic', model: appTextModel(), effort, maxTokens, timeoutMs };
}
