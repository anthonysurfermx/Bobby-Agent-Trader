// ============================================================
// POST /api/orchestrate — Financial Orchestration for AI Agents
// The core endpoint of Hardness Finance.
// Any agent submits a prediction → Bobby stress-tests it through
// the full harness: debate → judge → score → prove.
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { computeHardnessScore, isHardnessRegistryConfigured, recordHardnessActivity } from './_lib/hardness-registry';
import { createProof, createSession, evaluatePolicy, getAgent, updateSession } from './_lib/hardness-control-plane';
import { buildAuthChallenge, verifyAgentRequest } from './_lib/agent-auth';

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
  };
  options?: {
    runDebate?: boolean;
    runJudge?: boolean;
    commitOnchain?: boolean;
    publishSignal?: boolean;
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

function determineAction(score: number): 'execute' | 'reduce_size' | 'paper_only' | 'publish_only' | 'reject' {
  if (score >= 80) return 'execute';
  if (score >= 65) return 'reduce_size';
  if (score >= 50) return 'paper_only';
  if (score >= 30) return 'publish_only';
  return 'reject';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    return res.status(200).json({
      endpoint: 'POST /api/orchestrate',
      description: 'Financial orchestration for AI agents. Submit a structured prediction, get it stress-tested through adversarial debate, scored on 6 dimensions, and proven on-chain.',
      usage: 'POST with JSON body: { agent, prediction: { symbol, direction, entry, target, stop, thesis }, options: { runDebate, runJudge, commitOnchain } }',
      docs: 'https://bobbyprotocol.xyz/protocol/console',
      registry: process.env.HARDNESS_REGISTRY_ADDRESS || '0xD89c1721CD760984a31dE0325fD96cD27bB31040',
      auth: {
        headers: ['x-agent-address', 'x-agent-timestamp', 'x-agent-signature'],
        challengeExample: buildAuthChallenge(
          'orchestrate',
          { agentId: 'your-agent', symbol: 'BTC', direction: 'long', entry: 83000, target: 95000, stop: 78000 },
          new Date().toISOString()
        ),
        fallback: 'If omitted, Bobby accepts demo-mode orchestration.',
      },
    });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

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

  if (!OPENAI_API_KEY) {
    return res.status(503).json({ error: 'LLM not configured' });
  }

  const opts = body.options || {};
  const runDebate = opts.runDebate !== false;
  const runJudge = opts.runJudge !== false;
  const commitOnchain = opts.commitOnchain !== false;
  const publishSignal = opts.publishSignal !== false;
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
      {
        agentId,
        symbol: p.symbol,
        direction: p.direction,
        entry: p.entry,
        target: p.target,
        stop: p.stop,
      },
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

    let alpha: Record<string, unknown> = {};
    let red: Record<string, unknown> = {};
    let cio: Record<string, unknown> = {};
    let judge: Record<string, unknown> = {};

    if (runDebate) {
      // ISOLATED DEBATE — each role sees only what it should

      // Alpha Hunter: sees ONLY the spec packet, strengthens the thesis
      const alphaRaw = await callRole(
        'You are Alpha Hunter. Strengthen this trade thesis with verifiable evidence. Be specific: cite price levels, indicators, catalysts. Return JSON: {"thesis":string,"evidence":string[],"catalyst":string,"conviction":number}',
        specPacket
      );
      alpha = JSON.parse(alphaRaw);

      // Red Team: sees spec packet + Alpha's CONCLUSION only (not reasoning)
      // This is the isolation guarantee — Red doesn't see Alpha's evidence
      const redContext = `${specPacket}\n\nALPHA CONCLUSION: ${(alpha as Record<string, string>).thesis || 'bullish'} (conviction ${(alpha as Record<string, number>).conviction || conviction}/10)`;
      const redRaw = await callRole(
        'You are Red Team. Destroy this thesis with adversarial rigor. Find data gaps, selection bias, timing risks. Return JSON: {"counterpoints":string[],"biases_detected":string[],"failure_modes":string[]}',
        redContext
      );
      red = JSON.parse(redRaw);

      // CIO: sees FULL transcript (Alpha evidence + Red counterpoints)
      const cioContext = `${specPacket}\n\nALPHA THESIS:\n${JSON.stringify(alpha)}\n\nRED TEAM ATTACK:\n${JSON.stringify(red)}`;
      const cioRaw = await callRole(
        'You are Bobby CIO. Decide if this trade survives. Be decisive. Return JSON: {"recommendation":"execute"|"pass"|"reduce_size","conviction":number,"rationale":string,"adjusted_entry":number,"adjusted_stop":number}',
        cioContext
      );
      cio = JSON.parse(cioRaw);
    }

    let dimensions: Record<string, number> = {};
    let hardnessScore = 0;
    let judgeRecommendation = 'pass';

    if (runJudge) {
      // Judge: enters ONLY at the end, scores debate quality (not market direction)
      const judgeContext = `${specPacket}\n\nDEBATE TRANSCRIPT:\nAlpha: ${JSON.stringify(alpha)}\nRed: ${JSON.stringify(red)}\nCIO: ${JSON.stringify(cio)}`;
      const judgeRaw = await callRole(
        'You are Judge Mode. Score debate QUALITY, not market direction. Return JSON: {"dimensions":{"data_integrity":1-5,"adversarial_quality":1-5,"decision_logic":1-5,"risk_management":1-5,"calibration_alignment":1-5,"novelty":1-5},"biases_detected":string[],"recommendation":"execute"|"pass"|"reduce_size","rationale":string,"red_flags":string[]}',
        judgeContext,
        400
      );
      judge = JSON.parse(judgeRaw);
      dimensions = (judge as Record<string, Record<string, number>>).dimensions || {};
      hardnessScore = computeHardnessScore(dimensions);
      judgeRecommendation = (judge as Record<string, string>).recommendation || 'pass';
    }

    const action = determineAction(hardnessScore);
    const finalConviction = Math.max(1, Math.min(10,
      (cio as Record<string, number>).conviction || conviction
    ));
    const policy = evaluatePolicy(agent?.risk_policy_json, {
      symbol: p.symbol,
      hardnessScore,
      judgePresent: runJudge,
      requestedNotionalUsd: p.entry,
    });

    // On-chain proof
    let proofs: Record<string, string | null> | null = null;
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
        await createProof({
          session_id: sessionId,
          prediction_hash: proof.predictionHash,
          commit_tx_hash: proof.commitTxHash || null,
          signal_tx_hash: proof.signalTxHash || null,
          chain_id: 196,
        });
      }
    }

    const biases = Array.from(new Set([
      ...((red as Record<string, string[]>).biases_detected || []),
      ...((judge as Record<string, string[]>).biases_detected || []),
    ]));

    const responseBody = {
      ok: true,
      debateId,
      sessionId,
      agent: agentId,
      authMode: auth.mode,
      decision: policy.result === 'blocked' ? 'reject' : action,
      policyResult: policy.result,
      policyReason: policy.reason,
      hardnessScore,
      conviction: finalConviction,
      biases,
      redFlags: (judge as Record<string, string[]>).red_flags || [],
      rationale: (cio as Record<string, string>).rationale || '',
      debate: {
        alpha: { thesis: (alpha as Record<string, string>).thesis || '', evidence: (alpha as Record<string, string[]>).evidence || [] },
        redTeam: { counterpoints: (red as Record<string, string[]>).counterpoints || [], failureModes: (red as Record<string, string[]>).failure_modes || [] },
        cio: { recommendation: (cio as Record<string, string>).recommendation || '', conviction: finalConviction, rationale: (cio as Record<string, string>).rationale || '' },
      },
      judge: { dimensions, recommendation: judgeRecommendation },
      proofs,
      sizing: {
        suggestedAction: policy.result === 'blocked' ? 'reject' : action,
        riskReward: parseFloat(rr.toFixed(2)),
        maxConviction: finalConviction,
      },
    };

    await updateSession(sessionId, {
      status: 'proved',
      hardness_score: hardnessScore,
      policy_result: policy.result,
      decision_json: {
        decision: responseBody.decision,
        conviction: finalConviction,
        recommendation: (cio as Record<string, string>).recommendation || '',
        judgeRecommendation,
        biases,
        redFlags: (judge as Record<string, string[]>).red_flags || [],
        prediction: p,
        proofs,
      },
    });

    return res.status(200).json(responseBody);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Orchestrate] Error:', msg);
    return res.status(500).json({ error: msg });
  }
}
