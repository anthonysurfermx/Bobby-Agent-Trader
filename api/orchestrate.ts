// ============================================================
// POST /api/orchestrate — Financial Orchestration for AI Agents
// The core endpoint of Hardness Finance.
// Any agent submits a prediction → Bobby stress-tests it through
// the full harness: debate → judge → score → prove.
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { computeHardnessScore, isHardnessRegistryConfigured, recordHardnessActivity } from './_lib/hardness-registry.js';
import { createProof, createSession, evaluatePolicy, getAgent, updateSession } from './_lib/hardness-control-plane.js';
import { buildAuthChallenge, verifyAgentRequest } from './_lib/agent-auth.js';
import { enforcePublicRateLimit, isInternalRequest } from './_lib/request-security.js';
import { z } from 'zod';
import { DEFAULT_CHAIN } from './_lib/chains.js';
import { BOBBY_HARDNESS_REGISTRY } from './_lib/protocol-constants.js';
import { rpcErrorMessage } from './_lib/rpc-redact.js';

export const config = { maxDuration: 120 };

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

interface OrchestrateBody {
  agent?: string;
  agentId?: string;
  intent?: string;
  prediction: {
    symbol: string;
    direction: 'long' | 'short';
    entry: number;
    target: number;
    stop: number;
    conviction?: number;
    thesis: string;
    catalysts?: string[];
    invalidation?: string;
    timeframe?: string;
    /** BP-13: executable advice needs a validated size — units of the symbol… */
    quantity?: number;
    /** …or the notional in USD (both may be given; they must agree). */
    notionalUsd?: number;
  };
  options?: {
    runDebate?: boolean;
    runJudge?: boolean;
    commitOnchain?: boolean;
    publishSignal?: boolean;
    acknowledgeHighRisk?: boolean;
  };
}

// Isolated LLM call — each agent role gets ONLY what it should see
async function callRole(system: string, context: string, maxTokens = 500): Promise<string> {
  if (!OPENAI_API_KEY) throw new Error('LLM not configured');
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: context },
      ],
    }),
  });
  if (!res.ok) throw new Error(`LLM ${res.status}`);
  const data = await res.json() as { choices: Array<{ message: { content: string } }> };
  return data.choices[0]?.message?.content || '{}';
}

type OrchestrateAction =
  | 'execute'
  | 'reduce_size'
  | 'paper_only'
  | 'publish_only'
  | 'reject'
  | 'require_human_approval';

function determineAction(score: number): OrchestrateAction {
  if (score >= 80) return 'execute';
  if (score >= 65) return 'reduce_size';
  if (score >= 50) return 'paper_only';
  if (score >= 30) return 'publish_only';
  return 'reject';
}

// ── BP-13 (2026-09-04 review): the model proposes, the policy disposes ──
//
// The score-derived action used to be the final answer: an agent whose policy
// said "paper only" or "proof required" still received `execute`, the policy
// was evaluated against the ENTRY PRICE as if it were the notional, the session
// was marked `proved` with no proof, and the LLM JSON was trusted verbatim.

const RecommendationSchema = z.enum(['execute', 'pass', 'reduce_size']);
const AlphaSchema = z.object({
  thesis: z.string().max(4_000).optional().default(''),
  evidence: z.array(z.string().max(1_000)).max(20).optional().default([]),
  catalyst: z.string().max(1_000).optional().default(''),
  conviction: z.number().min(1).max(10).optional(),
}).passthrough();
const RedSchema = z.object({
  counterpoints: z.array(z.string().max(1_000)).max(20).optional().default([]),
  biases_detected: z.array(z.string().max(200)).max(20).optional().default([]),
  failure_modes: z.array(z.string().max(1_000)).max(20).optional().default([]),
}).passthrough();
const CioSchema = z.object({
  recommendation: RecommendationSchema,
  conviction: z.number().min(1).max(10).optional(),
  rationale: z.string().max(4_000).optional().default(''),
  adjusted_entry: z.number().positive().nullable().optional(),
  adjusted_stop: z.number().positive().nullable().optional(),
}).passthrough();
const DimensionScore = z.number().int().min(1).max(5);
const JudgeSchema = z.object({
  dimensions: z.object({
    data_integrity: DimensionScore,
    adversarial_quality: DimensionScore,
    decision_logic: DimensionScore,
    risk_management: DimensionScore,
    calibration_alignment: DimensionScore,
    novelty: DimensionScore,
  }),
  biases_detected: z.array(z.string().max(200)).max(20).optional().default([]),
  recommendation: RecommendationSchema,
  rationale: z.string().max(4_000).optional().default(''),
  red_flags: z.array(z.string().max(500)).max(20).optional().default([]),
}).passthrough();

class ModelOutputError extends Error {
  constructor(public readonly role: string, detail: string) {
    super(`${role} output rejected: ${detail}`);
  }
}

/** One role call whose JSON is validated against the schema the decision relies on. */
async function callRoleValidated<T>(role: string, schema: z.ZodType<T, z.ZodTypeDef, unknown>, system: string, context: string, maxTokens?: number): Promise<T> {
  const raw = await callRole(system, context, maxTokens);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ModelOutputError(role, 'not a JSON object');
  }
  const result = schema.safeParse(parsed);
  if (!result.success) {
    const detail = result.error.issues.slice(0, 3).map((i) => `${i.path.join('.') || 'root'}: ${i.message}`).join('; ');
    throw new ModelOutputError(role, detail);
  }
  return result.data;
}

interface Sizing { quantity: number | null; notionalUsd: number | null }

/** Either field may be given; both must agree (1% tolerance). Absent → no executable advice. */
function resolveSizing(p: OrchestrateBody['prediction']): { ok: true; sizing: Sizing } | { ok: false; error: string } {
  const q = p.quantity;
  const notional = p.notionalUsd;
  if (q == null && notional == null) return { ok: true, sizing: { quantity: null, notionalUsd: null } };
  const valid = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= 1e9;
  if (q != null && !valid(q)) return { ok: false, error: 'prediction.quantity must be a positive number <= 1e9' };
  if (notional != null && !valid(notional)) return { ok: false, error: 'prediction.notionalUsd must be a positive number <= 1e9' };
  const derived = q != null ? q * p.entry : null;
  if (q != null && notional != null && derived !== null && Math.abs(derived - notional) > Math.max(1, notional * 0.01)) {
    return { ok: false, error: 'prediction.notionalUsd does not equal quantity x entry (1% tolerance)' };
  }
  const notionalUsd = notional ?? derived;
  return { ok: true, sizing: { quantity: q ?? (notionalUsd as number) / p.entry, notionalUsd } };
}

type ProofState = 'analysis' | 'proof_submitted' | 'proof_confirmed' | 'proof_failed';
const PROOF_CONFIRM_TIMEOUT_MS = 20_000;

/** A tx hash is a submission, not a proof: only a mined receipt with status 1 confirms it. */
async function confirmProof(txHash: string): Promise<ProofState> {
  try {
    const { JsonRpcProvider } = await import('ethers');
    const provider = new JsonRpcProvider(DEFAULT_CHAIN.rpcUrl, DEFAULT_CHAIN.id, { staticNetwork: true });
    const receipt = await provider.waitForTransaction(txHash, 1, PROOF_CONFIRM_TIMEOUT_MS);
    if (!receipt) return 'proof_submitted';
    return receipt.status === 1 ? 'proof_confirmed' : 'proof_failed';
  } catch (error) {
    console.warn('[Orchestrate] proof confirmation pending:', rpcErrorMessage(error));
    return 'proof_submitted';
  }
}

type PolicyEvaluation = ReturnType<typeof evaluatePolicy>;

/**
 * The final action is a function of the EFFECTIVE policy, the model's action
 * and the proof state — the model's action is an upper bound, never the answer.
 * Precedence: blocked → reject; no validated size → nothing executable; paper
 * mode/result → paper at most; reduction → reduce_size at most; a required
 * proof that is not confirmed → human approval; advisory mode → human approval.
 */
export function finalizeAction(input: {
  modelAction: OrchestrateAction;
  policy: PolicyEvaluation;
  proofState: ProofState;
  executable: boolean;
}): { action: OrchestrateAction; reasons: string[] } {
  const reasons: string[] = [];
  const executableAdvice = (a: OrchestrateAction) => a === 'execute' || a === 'reduce_size';
  if (input.policy.result === 'blocked') return { action: 'reject', reasons: [`policy blocked: ${input.policy.reason}`] };
  let action = input.modelAction;
  if (!input.executable && executableAdvice(action)) {
    action = 'publish_only';
    reasons.push('no validated quantity/notional: analysis only, no executable advice');
  }
  if ((input.policy.result === 'paper_only' || input.policy.policy.mode === 'paper') && executableAdvice(action)) {
    action = 'paper_only';
    reasons.push(`policy paper: ${input.policy.reason}`);
  }
  if (input.policy.result === 'allowed_with_reduction' && action === 'execute') {
    action = 'reduce_size';
    reasons.push(`policy reduction: notional above maxNotionalUsd ${input.policy.policy.maxNotionalUsd}`);
  }
  if (input.policy.policy.requireOnchainProof && input.proofState !== 'proof_confirmed' && executableAdvice(action)) {
    action = 'require_human_approval';
    reasons.push(`policy requires on-chain proof; proof state is ${input.proofState}`);
  }
  if (input.policy.policy.mode === 'advisory' && action === 'execute') {
    action = 'require_human_approval';
    reasons.push('advisory mode: execution needs a human');
  }
  return { action, reasons };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    return res.status(200).json({
      endpoint: 'POST /api/orchestrate',
      description: 'Financial orchestration for AI agents. Submit a structured prediction, get it stress-tested through adversarial debate, scored on 6 dimensions, and proven on-chain.',
      usage: 'POST with JSON body: { agent, prediction: { symbol, direction, entry, target, stop, thesis }, options: { runDebate, runJudge, commitOnchain } }',
      docs: 'https://bobbyprotocol.xyz/protocol/console',
      registry: BOBBY_HARDNESS_REGISTRY,
      chainId: DEFAULT_CHAIN.id,
      auth: {
        headers: ['x-agent-address', 'x-agent-timestamp', 'x-agent-signature'],
        challengeExample: buildAuthChallenge(
          'orchestrate',
          {
            agentId: 'your-agent',
            prediction: { symbol: 'BTC', direction: 'long', entry: 83000, target: 95000, stop: 78000, thesis: 'Structured thesis' },
          },
          new Date().toISOString()
        ),
        fallback: 'Mutations require a wallet signature. On-chain writes require internal authorization.',
      },
    });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const internalRequest = isInternalRequest(req);
  if (!internalRequest && !await enforcePublicRateLimit(req, res, 'orchestrate', 10, 3600)) return;

  const body = req.body as OrchestrateBody;
  const p = body?.prediction;

  // Strict schema validation — reject incomplete specs
  if (!p?.symbol || !p?.direction || !p?.entry || !p?.target || !p?.stop || !p?.thesis) {
    return res.status(400).json({
      error: 'Incomplete HardnessSpec',
      required: ['prediction.symbol', 'prediction.direction', 'prediction.entry', 'prediction.target', 'prediction.stop', 'prediction.thesis'],
      hint: 'Bobby requires a structured spec. Raw "long BTC" is not enough.',
    });
  }
  const prices = [p.entry, p.target, p.stop];
  const validShape = /^[A-Za-z0-9._-]{1,20}$/.test(p.symbol)
    && (p.direction === 'long' || p.direction === 'short')
    && prices.every((value) => Number.isFinite(value) && value > 0 && value <= 1e12)
    && typeof p.thesis === 'string' && p.thesis.length <= 4_000
    && (!p.catalysts || (Array.isArray(p.catalysts) && p.catalysts.length <= 10
      && p.catalysts.every((item) => typeof item === 'string' && item.length <= 500)))
    && (!p.invalidation || (typeof p.invalidation === 'string' && p.invalidation.length <= 1_000))
    && (!p.timeframe || (typeof p.timeframe === 'string' && p.timeframe.length <= 50))
    && (!body.agentId || (typeof body.agentId === 'string' && body.agentId.length <= 100))
    && (!body.agent || (typeof body.agent === 'string' && body.agent.length <= 100))
    && (!body.intent || (typeof body.intent === 'string' && body.intent.length <= 100))
    && (p.conviction == null || (Number.isFinite(p.conviction) && p.conviction >= 1 && p.conviction <= 10));
  const validLevels = p.direction === 'long'
    ? p.stop < p.entry && p.entry < p.target
    : p.target < p.entry && p.entry < p.stop;
  if (!validShape || !validLevels) {
    return res.status(400).json({ error: 'Invalid or oversized HardnessSpec' });
  }
  // BP-13: size is validated up front; without one the harness still analyses
  // but never returns executable advice.
  const sized = resolveSizing(p);
  if (sized.ok === false) return res.status(400).json({ error: sized.error });
  const sizing = sized.sizing;

  if (!OPENAI_API_KEY) {
    return res.status(503).json({ error: 'LLM not configured' });
  }

  // Principle #17: Approval Gates for high-risk actions
  const rr = p.direction === 'long'
    ? (p.target - p.entry) / Math.max(1, p.entry - p.stop)
    : (p.entry - p.target) / Math.max(1, p.stop - p.entry);
  // BP-13: the notional gate uses the VALIDATED notional (the entry price was
  // being treated as the notional, so a BTC long tripped it on price alone).
  const isHighRisk = (sizing.notionalUsd ?? 0) > 50000 || rr < 1.0;
  if (isHighRisk && !body.options?.acknowledgeHighRisk) {
    return res.status(200).json({
      ok: true,
      requiresApproval: true,
      reason: rr < 1.0 ? 'Risk/reward ratio below 1.0' : 'Notional exceeds $50K threshold',
      riskReward: parseFloat(rr.toFixed(2)),
      hint: 'Re-submit with options.acknowledgeHighRisk: true to proceed',
    });
  }

  const opts = body.options || {};
  const runDebate = opts.runDebate !== false;
  const runJudge = opts.runJudge !== false;
  // Public agents can request analysis, but only an authenticated backend job
  // may spend the recorder wallet's gas or publish under Bobby's identity.
  const commitOnchain = internalRequest && opts.commitOnchain !== false;
  const publishSignal = internalRequest && opts.publishSignal !== false;
  const agentId = body.agentId || body.agent || 'anonymous';

  try {
    const debateId = crypto.randomUUID();
    const conviction = Math.max(1, Math.min(10, Math.round(p.conviction || 5)));
    const rr = p.direction === 'long'
      ? (p.target - p.entry) / (p.entry - p.stop)
      : (p.entry - p.target) / (p.stop - p.entry);

    const agent = agentId !== 'anonymous' ? await getAgent(agentId) : null;
    const auth = await verifyAgentRequest(
      req,
      'orchestrate',
      body as unknown as Record<string, unknown>,
      agent?.owner_address || null
    );
    if (!auth.ok) {
      return res.status(401).json({ error: auth.error });
    }

    // Build the HardnessSpec packet (what enters the harness)
    const specPacket = `HARDNESS SPEC PACKET
Agent: ${agentId}
Symbol: ${p.symbol} | Direction: ${p.direction.toUpperCase()} | Timeframe: ${p.timeframe || '1D'}
Entry: $${p.entry} | Target: $${p.target} | Stop: $${p.stop}
Risk/Reward: ${rr.toFixed(2)} | Conviction: ${conviction}/10
Thesis: ${p.thesis}
Catalysts: ${(p.catalysts || []).join(', ') || 'none declared'}
Invalidation: ${p.invalidation || 'not specified'}`;

    const sessionId = `hs_${debateId}`;
    await createSession({
      session_id: sessionId,
      agent_id: agentId,
      intent: body.intent || 'evaluate_trade',
      symbol: p.symbol,
      direction: p.direction,
      request_json: body as unknown as Record<string, unknown>,
      context_json: {
        specPacket,
        riskReward: parseFloat(rr.toFixed(2)),
        policy: agent?.risk_policy_json || null,
        authMode: auth.mode,
      },
      status: 'received',
    });

    let alpha: z.infer<typeof AlphaSchema> = { thesis: '', evidence: [], catalyst: '' };
    let red: z.infer<typeof RedSchema> = { counterpoints: [], biases_detected: [], failure_modes: [] };
    let cio: z.infer<typeof CioSchema> | null = null;
    let judge: z.infer<typeof JudgeSchema> | null = null;

    try {
      if (runDebate) {
        // ISOLATED DEBATE — each role sees only what it should. Every role's
        // JSON is schema-validated (BP-13): a malformed or out-of-range answer
        // aborts the session instead of steering the decision.

        // Alpha Hunter: sees ONLY the spec packet, strengthens the thesis
        alpha = await callRoleValidated(
          'Alpha Hunter',
          AlphaSchema,
          'You are Alpha Hunter. Strengthen this trade thesis with verifiable evidence. Be specific: cite price levels, indicators, catalysts. Return JSON: {"thesis":string,"evidence":string[],"catalyst":string,"conviction":number}',
          specPacket
        );

        // Red Team: sees spec packet + Alpha's CONCLUSION only (not reasoning)
        // This is the isolation guarantee — Red doesn't see Alpha's evidence
        const redContext = `${specPacket}\n\nALPHA CONCLUSION: ${alpha.thesis || 'bullish'} (conviction ${alpha.conviction || conviction}/10)`;
        red = await callRoleValidated(
          'Red Team',
          RedSchema,
          'You are Red Team. Destroy this thesis with adversarial rigor. Find data gaps, selection bias, timing risks. Return JSON: {"counterpoints":string[],"biases_detected":string[],"failure_modes":string[]}',
          redContext
        );

        // CIO: sees FULL transcript (Alpha evidence + Red counterpoints)
        const cioContext = `${specPacket}\n\nALPHA THESIS:\n${JSON.stringify(alpha)}\n\nRED TEAM ATTACK:\n${JSON.stringify(red)}`;
        cio = await callRoleValidated(
          'CIO',
          CioSchema,
          'You are Bobby CIO. Decide if this trade survives. Be decisive. Return JSON: {"recommendation":"execute"|"pass"|"reduce_size","conviction":number,"rationale":string,"adjusted_entry":number,"adjusted_stop":number}',
          cioContext
        );
      }

      if (runJudge) {
        // Judge: enters ONLY at the end, scores debate quality (not market direction)
        const judgeContext = `${specPacket}\n\nDEBATE TRANSCRIPT:\nAlpha: ${JSON.stringify(alpha)}\nRed: ${JSON.stringify(red)}\nCIO: ${JSON.stringify(cio ?? {})}`;
        judge = await callRoleValidated(
          'Judge',
          JudgeSchema,
          'You are Judge Mode. Score debate QUALITY, not market direction. Return JSON: {"dimensions":{"data_integrity":1-5,"adversarial_quality":1-5,"decision_logic":1-5,"risk_management":1-5,"calibration_alignment":1-5,"novelty":1-5},"biases_detected":string[],"recommendation":"execute"|"pass"|"reduce_size","rationale":string,"red_flags":string[]}',
          judgeContext,
          400
        );
      }
    } catch (error) {
      if (error instanceof ModelOutputError) {
        console.error('[Orchestrate] model output rejected:', error.message);
        await updateSession(sessionId, { status: 'failed', decision_json: { error: error.message, role: error.role } });
        return res.status(502).json({ error: error.message, role: error.role, sessionId });
      }
      throw error;
    }

    const dimensions: Record<string, number> = judge ? { ...judge.dimensions } : {};
    const hardnessScore = judge ? computeHardnessScore(dimensions) : 0;
    const judgeRecommendation = judge?.recommendation ?? 'pass';

    const modelAction = determineAction(hardnessScore);
    const finalConviction = Math.max(1, Math.min(10, cio?.conviction || conviction));
    const policy = evaluatePolicy(agent?.risk_policy_json, {
      symbol: p.symbol,
      hardnessScore,
      judgePresent: runJudge,
      // BP-13: the validated notional — never the entry price.
      requestedNotionalUsd: sizing.notionalUsd,
    });

    // On-chain proof. A returned hash is a SUBMISSION; only a mined receipt
    // with status 1 is a proof the policy can rely on.
    let proofs: Record<string, string | null> | null = null;
    let proofState: ProofState = 'analysis';
    if ((commitOnchain || publishSignal) && isHardnessRegistryConfigured() && policy.result !== 'blocked') {
      const proof = await recordHardnessActivity({
        threadId: debateId,
        symbol: p.symbol,
        direction: p.direction,
        conviction: finalConviction,
        entryPrice: p.entry,
        targetPrice: p.target,
        stopPrice: p.stop,
        shouldCommitPrediction: commitOnchain,
      });
      if (proof) {
        proofs = {
          predictionHash: proof.predictionHash,
          commitTxHash: proof.commitTxHash || null,
          signalTxHash: proof.signalTxHash || null,
        };
        if (commitOnchain) {
          proofState = proof.commitTxHash ? await confirmProof(proof.commitTxHash) : 'proof_failed';
        }
        await createProof({
          session_id: sessionId,
          prediction_hash: proof.predictionHash,
          commit_tx_hash: proof.commitTxHash || null,
          signal_tx_hash: proof.signalTxHash || null,
          chain_id: DEFAULT_CHAIN.id,
        });
      } else if (commitOnchain) {
        proofState = 'proof_failed';
      }
    }

    const executable = sizing.notionalUsd !== null && sizing.quantity !== null;
    const finalAction = finalizeAction({ modelAction, policy, proofState, executable });
    const action = finalAction.action;
    const reducedNotionalUsd = action === 'reduce_size' && sizing.notionalUsd !== null
      ? Math.min(sizing.notionalUsd, policy.policy.maxNotionalUsd)
      : null;

    const biases = Array.from(new Set([
      ...red.biases_detected,
      ...(judge?.biases_detected ?? []),
    ]));

    const responseBody = {
      ok: true,
      debateId,
      sessionId,
      agent: agentId,
      authMode: auth.mode,
      decision: action,
      modelAction,
      finalActionReasons: finalAction.reasons,
      policyResult: policy.result,
      policyReason: policy.reason,
      policyMode: policy.policy.mode,
      proofState,
      hardnessScore,
      conviction: finalConviction,
      biases,
      redFlags: judge?.red_flags ?? [],
      rationale: cio?.rationale ?? '',
      debate: {
        alpha: { thesis: alpha.thesis, evidence: alpha.evidence },
        redTeam: { counterpoints: red.counterpoints, failureModes: red.failure_modes },
        cio: { recommendation: cio?.recommendation ?? '', conviction: finalConviction, rationale: cio?.rationale ?? '' },
      },
      judge: { dimensions, recommendation: judgeRecommendation },
      proofs,
      sizing: {
        suggestedAction: action,
        executable,
        quantity: sizing.quantity,
        notionalUsd: sizing.notionalUsd,
        maxNotionalUsd: policy.policy.maxNotionalUsd,
        reducedNotionalUsd,
        riskReward: parseFloat(rr.toFixed(2)),
        maxConviction: finalConviction,
      },
    };

    await updateSession(sessionId, {
      status: proofState,
      hardness_score: hardnessScore,
      policy_result: policy.result,
      decision_json: {
        decision: action,
        modelAction,
        finalActionReasons: finalAction.reasons,
        proofState,
        conviction: finalConviction,
        recommendation: cio?.recommendation ?? '',
        judgeRecommendation,
        biases,
        redFlags: judge?.red_flags ?? [],
        prediction: p,
        sizing: responseBody.sizing,
        proofs,
      },
    });

    return res.status(200).json(responseBody);
  } catch (error) {
    // BP-12: never echo a configured RPC URL to the client.
    const msg = rpcErrorMessage(error);
    console.error('[Orchestrate] Error:', msg);
    return res.status(500).json({ error: msg });
  }
}
// Hardness Finance v1.1 — Financial Orchestration Infrastructure
