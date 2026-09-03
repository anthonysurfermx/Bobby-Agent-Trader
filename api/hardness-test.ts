import type { VercelRequest, VercelResponse } from '@vercel/node';
import OpenAI from 'openai';
import { computeHardnessScore, isHardnessRegistryConfigured, recordHardnessActivity } from './_lib/hardness-registry.js';
import { enforcePublicRateLimit, isInternalRequest } from './_lib/request-security.js';

export const config = { maxDuration: 90 };

/** Long must be target > entry > stop; short must be target < entry < stop. */
export function levelGeometryError(direction: string, entry: number, target: number, stop: number): string | null {
  if (![entry, target, stop].every((v) => Number.isFinite(v) && v > 0)) return 'entry, target and stop must be positive numbers';
  const d = String(direction).toLowerCase();
  if (d === 'long') return target > entry && entry > stop ? null : 'long requires target > entry > stop';
  if (d === 'short') return target < entry && entry < stop ? null : 'short requires target < entry < stop';
  return 'direction must be long or short';
}

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

interface HardnessTestRequest {
  agent?: string;
  prediction?: {
    symbol?: string;
    direction?: 'long' | 'short';
    conviction?: number;
    entry?: number;
    target?: number;
    stop?: number;
    thesis?: string;
  };
  commitOnchain?: boolean;
}

const client = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

async function callJson<T>(system: string, prompt: string): Promise<T> {
  if (!client) throw new Error('OPENAI_API_KEY not configured');
  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: prompt },
    ],
    max_tokens: 700,
  });

  const raw = response.choices[0]?.message?.content || '{}';
  return JSON.parse(raw) as T;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    return res.status(200).json({
      endpoint: 'POST /api/hardness-test',
      description: 'Hardness-as-a-Service. Submit a prediction for adversarial stress-testing. Returns hardness score, dimensions, biases, and on-chain proof.',
      usage: 'POST with JSON body: { prediction: { symbol, direction, entry, target, stop, thesis }, commitOnchain: boolean }',
      docs: 'https://bobbyprotocol.xyz/protocol/console',
    });
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!await enforcePublicRateLimit(req, res, 'hardness-test', 5, 600)) return;

  const body = (req.body || {}) as HardnessTestRequest;
  const prediction = body.prediction || {};

  if (!prediction.symbol || !prediction.direction || !prediction.entry || !prediction.target || !prediction.stop || !prediction.thesis) {
    return res.status(400).json({
      error: 'Missing prediction fields: symbol, direction, entry, target, stop, thesis',
    });
  }

  const prices = [prediction.entry, prediction.target, prediction.stop].map(Number);
  // Codex r3 P2: the registry now refuses incoherent levels at commit; refuse
  // them here first, so a bad request never spends three model calls.
  const geometryError = levelGeometryError(prediction.direction, prices[0], prices[1], prices[2]);
  if (geometryError) return res.status(400).json({ error: geometryError });
  if (!/^[A-Z0-9.-]{1,20}$/i.test(prediction.symbol)
    || !['long', 'short'].includes(prediction.direction)
    || prices.some((value) => !Number.isFinite(value) || value <= 0)
    || typeof prediction.thesis !== 'string'
    || prediction.thesis.length > 4_000
    || (body.agent != null && (typeof body.agent !== 'string' || body.agent.length > 80))) {
    return res.status(400).json({ error: 'Invalid prediction' });
  }

  if (!client) {
    return res.status(503).json({ error: 'OPENAI_API_KEY not configured' });
  }

  try {
    const debateId = crypto.randomUUID();
    const normalizedConviction = Math.max(1, Math.min(10, Math.round(prediction.conviction || 7)));
    const setupBlock = JSON.stringify({
      agent: body.agent || 'external-agent',
      prediction: {
        symbol: prediction.symbol,
        direction: prediction.direction,
        conviction: normalizedConviction,
        entry: prediction.entry,
        target: prediction.target,
        stop: prediction.stop,
        thesis: prediction.thesis,
      },
    }, null, 2);

    const alpha = await callJson<{
      thesis: string;
      evidence: string[];
      catalyst: string;
      conviction: number;
    }>(
      'You are Alpha Hunter. Strengthen the trade thesis with concise, verifiable market logic. Respond as JSON only.',
      `${setupBlock}\nReturn JSON: { "thesis": string, "evidence": string[], "catalyst": string, "conviction": number }`
    );

    const red = await callJson<{
      counterpoints: string[];
      biases_detected: string[];
      failure_modes: string[];
    }>(
      'You are Red Team. Break the trade thesis with adversarial rigor. Respond as JSON only.',
      `${setupBlock}\nAlpha thesis:\n${JSON.stringify(alpha, null, 2)}\nReturn JSON: { "counterpoints": string[], "biases_detected": string[], "failure_modes": string[] }`
    );

    const cio = await callJson<{
      recommendation: 'execute' | 'pass' | 'reduce_size';
      conviction: number;
      adjusted_entry: number;
      adjusted_target: number;
      adjusted_stop: number;
      rationale: string;
    }>(
      'You are Bobby CIO. Decide whether this trade survives adversarial review. Respond as JSON only.',
      `${setupBlock}\nAlpha:\n${JSON.stringify(alpha, null, 2)}\nRed Team:\n${JSON.stringify(red, null, 2)}\nReturn JSON: { "recommendation": "execute"|"pass"|"reduce_size", "conviction": number, "adjusted_entry": number, "adjusted_target": number, "adjusted_stop": number, "rationale": string }`
    );

    const judge = await callJson<{
      dimensions: Record<string, number>;
      biases_detected: string[];
      recommendation: 'execute' | 'pass' | 'reduce_size' | 'reverse';
      rationale: string;
      red_flags: string[];
    }>(
      'You are Judge Mode. Score debate quality, not market direction. Use 1-5 per dimension and JSON only.',
      `${setupBlock}\nAlpha:\n${JSON.stringify(alpha, null, 2)}\nRed Team:\n${JSON.stringify(red, null, 2)}\nCIO:\n${JSON.stringify(cio, null, 2)}\nReturn JSON: { "dimensions": { "data_integrity": 1-5, "adversarial_quality": 1-5, "decision_logic": 1-5, "risk_management": 1-5, "calibration_alignment": 1-5, "novelty": 1-5 }, "biases_detected": string[], "recommendation": "execute"|"pass"|"reduce_size"|"reverse", "rationale": string, "red_flags": string[] }`
    );

    const hardnessScore = computeHardnessScore(judge.dimensions || {});
    const finalConviction = Math.max(1, Math.min(10, Math.round(cio.conviction || normalizedConviction)));

    let onChainProof: Record<string, string | null | boolean> | null = null;
    // Public Hardness requests are analysis-only. Spending the recorder wallet
    // and writing chain state is an explicitly authenticated operation.
    const shouldCommitOnchain = body.commitOnchain === true && isInternalRequest(req);
    if (shouldCommitOnchain && isHardnessRegistryConfigured()) {
      // Codex r3 P2: re-validate after the CIO moved the levels — an adjusted
      // stop on the wrong side of the entry would revert on-chain.
      const adjustedError = levelGeometryError(prediction.direction, Number(cio.adjusted_entry || prediction.entry), Number(cio.adjusted_target || prediction.target), Number(cio.adjusted_stop || prediction.stop));
      if (adjustedError) {
        onChainProof = { enabled: false, error: `CIO-adjusted levels rejected: ${adjustedError}` };
      } else {
      const proof = await recordHardnessActivity({
        threadId: debateId,
        symbol: prediction.symbol,
        direction: prediction.direction,
        conviction: finalConviction,
        entryPrice: Number(cio.adjusted_entry || prediction.entry),
        targetPrice: Number(cio.adjusted_target || prediction.target),
        stopPrice: Number(cio.adjusted_stop || prediction.stop),
        shouldCommitPrediction: true,
      });

      if (proof && proof.commitTxHash) {
        onChainProof = {
          enabled: true,
          predictionHash: proof.predictionHash,
          commitTxHash: proof.commitTxHash,
          signalTxHash: proof.signalTxHash || null,
        };
      } else {
        // Codex r3 P2: never answer enabled:true with commitTxHash:null.
        onChainProof = { enabled: false, error: proof?.commitError || 'commit did not land', predictionHash: proof?.predictionHash || null };
      }
      }
    }

    return res.status(200).json({
      ok: true,
      debateId,
      agent: body.agent || 'external-agent',
      hardnessScore,
      dimensions: judge.dimensions,
      recommendation: cio.recommendation,
      judgeRecommendation: judge.recommendation,
      biasesDetected: Array.from(new Set([...(red.biases_detected || []), ...(judge.biases_detected || [])])),
      redFlags: judge.red_flags || [],
      recommendationRationale: cio.rationale,
      judgeRationale: judge.rationale,
      alpha,
      redTeam: red,
      cio: {
        ...cio,
        conviction: finalConviction,
      },
      onChainProof,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[HardnessTest] failed:', message);
    return res.status(500).json({ error: message });
  }
}
