// ============================================================
// api/_lib/llm-voucher.ts
// Phase 3 (OnchainOS Payments) — pay-as-you-go LLM metering.
//
// SDK status (0.1.0): the `upto` scheme exists in dist but is NOT yet
// listed in `@okxweb3/x402-evm`'s package.json `exports`. Until OKX
// publishes a stable surface for it, we run the voucher accumulation
// off-chain in `llm_calls` (Bobby V3 schema migration `20260424_bobby_v3_schema.sql`)
// and keep the public API stable so the swap to on-chain is a single
// implementation change.
//
// Design contract:
//   const voucher = await openSession({ cycleId, payer, capUsd: 5 });
//   await voucher.append({ provider, model, tokensIn, tokensOut, costUsd });
//   await voucher.settle();   // closes voucher; on-chain when SDK exposes upto
// ============================================================

import { createClient } from '@supabase/supabase-js';

const SB_URL = process.env.SB_URL || process.env.SUPABASE_URL || '';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function db() {
  if (!SB_URL || !SB_KEY) {
    throw new Error('Supabase env not configured for llm-voucher');
  }
  return createClient(SB_URL, SB_KEY);
}

export interface OpenSessionOpts {
  cycleId: string;        // FK to agent_cycles.id
  payer?: string;         // EVM address — populated when on-chain wire lands
  capUsd?: number;        // hard cap; appends past cap throw
  network?: string;       // default eip155:196
}

export interface AppendOpts {
  provider: 'openai' | 'anthropic' | 'deepseek' | string;
  model: string;
  agent?: string;         // 'alpha' | 'red' | 'cio' | 'arbiter' | 'reflect' | 'evolve'
  endpoint?: string;
  tokensIn?: number;
  tokensOut?: number;
  costUsd: number;
}

export interface VoucherSession {
  cycleId: string;
  capUsd: number;
  totalUsd: number;
  payer?: string;
  network: string;
  append: (opts: AppendOpts) => Promise<void>;
  settle: () => Promise<{ totalUsd: number; calls: number; onChainTxHash?: string }>;
}

/**
 * Open a metered LLM session for one Bobby cycle.
 *
 * Off-chain path (active today):
 *   - Each `append` writes a row to `llm_calls` with cost_usd.
 *   - `settle` sums them and stamps `agent_cycles.cost_usd`.
 *
 * On-chain path (Phase 3 cutover, when SDK exposes upto):
 *   - `openSession` authorizes a Session Key bounded by `capUsd`.
 *   - Each `append` produces an EIP-712 voucher signed by the Session Key.
 *   - `settle` submits the cumulative voucher; unused balance refunded by the
 *     Escrow contract automatically.
 */
export async function openSession(opts: OpenSessionOpts): Promise<VoucherSession> {
  const cap = opts.capUsd ?? 5;
  const network = opts.network ?? process.env.X402_NETWORK ?? 'eip155:196';
  let totalUsd = 0;
  let calls = 0;

  return {
    cycleId: opts.cycleId,
    capUsd: cap,
    network,
    payer: opts.payer,
    get totalUsd() {
      return totalUsd;
    },

    async append(a: AppendOpts) {
      const next = totalUsd + a.costUsd;
      if (next > cap) {
        throw new Error(`llm voucher cap exceeded: $${next.toFixed(4)} > $${cap.toFixed(2)}`);
      }
      totalUsd = next;
      calls += 1;
      try {
        await db().from('llm_calls').insert({
          cycle_id: opts.cycleId,
          provider: a.provider,
          model: a.model,
          agent: a.agent ?? null,
          endpoint: a.endpoint ?? null,
          tokens_in: a.tokensIn ?? null,
          tokens_out: a.tokensOut ?? null,
          cost_usd: a.costUsd,
        });
      } catch (err) {
        console.error('[llm-voucher] failed to write llm_calls row', err);
      }
    },

    async settle() {
      try {
        await db()
          .from('agent_cycles')
          .update({ cost_usd: totalUsd })
          .eq('id', opts.cycleId);
      } catch (err) {
        console.error('[llm-voucher] failed to stamp agent_cycles.cost_usd', err);
      }
      // TODO(phase-3-onchain): when @okxweb3/x402-evm exports `upto/client`,
      // submit the cumulative EIP-712 voucher here and capture the tx hash.
      return { totalUsd, calls };
    },
  };
}
