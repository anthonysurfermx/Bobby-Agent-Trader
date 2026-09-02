// ============================================================
// effects — one answer to "may this run touch the outside world?"
//
// External effects are: Telegram messages, tweets, on-chain transactions,
// payments, deliveries to third parties. They are allowed only when
//   - the run is not a canary (control flag or BOBBY_CYCLE_CANARY=1), and
//   - the challenge mode is not 'dryrun'.
// A dryrun therefore means exactly that: analysis and rows, nothing that
// leaves the building. Every suppressed effect is logged once so a canary
// run is auditable.
// ============================================================

export type EffectMode = 'dryrun' | 'paper' | 'live';

export interface EffectContext {
  mode: EffectMode;
  canary: boolean;
}

export function externalEffectsAllowed(ctx: EffectContext): boolean {
  return !ctx.canary && ctx.mode !== 'dryrun';
}

/** Log a suppressed effect (kind = 'telegram' | 'twitter' | 'onchain' | 'delivery' | 'payment'). */
export function noteSuppressedEffect(kind: string, ctx: EffectContext, detail?: string): void {
  console.log(`[effects] suppressed ${kind} (mode=${ctx.mode} canary=${ctx.canary})${detail ? ` — ${detail}` : ''}`);
}
