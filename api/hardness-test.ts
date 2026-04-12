import type { VercelRequest, VercelResponse } from '@vercel/node';
import OpenAI from 'openai';
import { computeHardnessScore, isHardnessRegistryConfigured, recordHardnessActivity } from './_lib/hardness-registry.js';

export const config = { maxDuration: 90 };

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

  const body = (req.body || {}) as HardnessTestRequest;
  const prediction = body.prediction || {};

  if (!prediction.symbol || !prediction.direction || !prediction.entry || !prediction.target || !prediction.stop || !prediction.thesis) {
    return res.status(400).json({
      error: 'Missing prediction fields: symbol, direction, entry, target, stop, thesis',
    });
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
    const shouldCommitOnchain = body.commitOnchain !== false;
    if (shouldCommitOnchain && isHardnessRegistryConfigured()) {
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

      if (proof) {
        onChainProof = {
          enabled: true,
          predictionHash: proof.predictionHash,
          commitTxHash: proof.commitTxHash || null,
          signalTxHash: proof.signalTxHash || null,
        };
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
