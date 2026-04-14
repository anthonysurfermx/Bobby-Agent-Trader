// ============================================================
// POST /api/sandbox-run — Live adversarial simulation via SSE
// Streams the full 3-agent debate + Judge + 11 guardrails for a
// chosen playbook. Simulation only: never executes, never on-chain.
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = { maxDuration: 180 };

const OPENAI_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_MODEL = 'gpt-4o-mini';

// ── SSE helpers ────────────────────────────────────────────
type SseWriter = (event: string, data: Record<string, unknown>) => void;

function sseWriter(res: VercelResponse): SseWriter {
  return (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };
}

// ── Guardrail catalog (matches src/data/playbooks.ts) ──────
const GUARDRAILS = [
  { id: 'conviction_gate',     label: 'Conviction Gate' },
  { id: 'mandatory_stop',      label: 'Mandatory Stop Loss' },
  { id: 'circuit_breaker',     label: 'Circuit Breaker' },
  { id: 'drawdown_kill_switch',label: 'Drawdown Kill Switch' },
  { id: 'hard_risk_gate',      label: 'Hard Risk Gate' },
  { id: 'metacognition',       label: 'Metacognition' },
  { id: 'commit_reveal',       label: 'Commit-Reveal' },
  { id: 'judge_mode_6d',       label: 'Judge Mode (6D)' },
  { id: 'adversarial_bounties',label: 'Adversarial Bounties' },
  { id: 'yield_parking',       label: 'Yield Parking' },
  { id: 'wheel_market_breaker',label: 'Wheel Market Breaker' },
] as const;

const JUDGE_DIMENSIONS = [
  { id: 'data_integrity',        label: 'Data Integrity' },
  { id: 'adversarial_quality',   label: 'Adversarial Quality' },
  { id: 'decision_logic',        label: 'Decision Logic' },
  { id: 'risk_management',       label: 'Risk Management' },
  { id: 'calibration_alignment', label: 'Calibration' },
  { id: 'novelty',               label: 'Novelty' },
] as const;

// ── Agent prompts ──────────────────────────────────────────
const SYSTEM_ALPHA = `You are Alpha Hunter, a bold trader looking for asymmetric bets on X Layer (OKB ecosystem).
Output 3-5 short sentences. Build the BULL thesis for the ticker given. Mention 1 catalyst, 1 entry trigger, 1 invalidation. Terse, concrete, no hedging.`;

const SYSTEM_RED = `You are Red Team, an adversarial short seller. Your ONLY job is to destroy the thesis you just read.
Output 3-5 short sentences. Name the strongest counter-argument, the most likely failure mode, and one specific piece of evidence that would invalidate the bull case. Be ruthless. No "on the other hand."`;

const SYSTEM_CIO = `You are the CIO. You just read the bull thesis and the red team rebuttal.
Output 3-4 short sentences + a final line in this exact format:
VERDICT: <EXECUTE|YIELD_PARK|BLOCKED> | CONVICTION: <0.0-10.0>
Rules:
- BLOCKED if red team's counter is stronger than the thesis
- YIELD_PARK if the thesis is plausible but conviction < 3.5
- EXECUTE only if conviction >= 3.5 and no critical red-team flaw`;

const SYSTEM_JUDGE = `You are the Judge. Audit the debate that just happened. Rate each of the 6 dimensions 1-5.
Respond with ONLY valid JSON, no prose:
{"data_integrity": <1-5>, "adversarial_quality": <1-5>, "decision_logic": <1-5>, "risk_management": <1-5>, "calibration_alignment": <1-5>, "novelty": <1-5>}`;

// ── Stream a single agent turn via OpenAI, emitting phase_token events ─
async function streamAgent(
  send: SseWriter,
  phase: string,
  system: string,
  userPayload: string
): Promise<string> {
  send('phase_start', { phase });
  let full = '';

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      max_tokens: 400,
      stream: true,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userPayload },
      ],
    }),
  });

  if (!resp.ok || !resp.body) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`OpenAI ${resp.status}: ${errText.slice(0, 200)}`);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const ln of lines) {
      if (!ln.startsWith('data: ')) continue;
      const json = ln.slice(6).trim();
      if (json === '[DONE]') continue;
      try {
        const parsed = JSON.parse(json);
        const token = parsed.choices?.[0]?.delta?.content;
        if (token) {
          full += token;
          send('phase_token', { phase, token });
        }
      } catch {
        // ignore malformed chunk
      }
    }
  }

  send('phase_end', { phase, text: full });
  return full;
}

// ── One-shot OpenAI call (non-streaming) for Judge JSON ────
async function openaiOneShot(system: string, user: string, maxTokens: number): Promise<string> {
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`OpenAI ${resp.status}: ${errText.slice(0, 200)}`);
  }
  const data: any = await resp.json();
  return data.choices?.[0]?.message?.content || '';
}

// ── Parsers ────────────────────────────────────────────────
function parseCio(text: string): { action: 'EXECUTE' | 'YIELD_PARK' | 'BLOCKED'; conviction: number } {
  const m = text.match(/VERDICT:\s*(EXECUTE|YIELD_PARK|BLOCKED)\s*\|\s*CONVICTION:\s*([0-9.]+)/i);
  if (!m) return { action: 'BLOCKED', conviction: 0 };
  const action = m[1].toUpperCase() as 'EXECUTE' | 'YIELD_PARK' | 'BLOCKED';
  const conviction = Math.max(0, Math.min(10, parseFloat(m[2]) || 0));
  return { action, conviction };
}

function parseJudge(text: string): Record<string, number> {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const obj = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
    const out: Record<string, number> = {};
    for (const dim of JUDGE_DIMENSIONS) {
      const raw = Number(obj[dim.id]);
      out[dim.id] = Number.isFinite(raw) ? Math.max(1, Math.min(5, raw)) : 3;
    }
    return out;
  } catch {
    const out: Record<string, number> = {};
    for (const dim of JUDGE_DIMENSIONS) out[dim.id] = 3;
    return out;
  }
}

// ── Guardrail evaluation ───────────────────────────────────
function evalGuardrails(
  action: string,
  conviction: number,
  judge: Record<string, number>
): Array<{ id: string; label: string; status: 'pass' | 'fail' | 'skip' }> {
  const weighted =
    (judge.data_integrity ?? 3) * 0.2 +
    (judge.adversarial_quality ?? 3) * 0.25 +
    (judge.decision_logic ?? 3) * 0.2 +
    (judge.risk_management ?? 3) * 0.15 +
    (judge.calibration_alignment ?? 3) * 0.1 +
    (judge.novelty ?? 3) * 0.1;
  const judgeScore20 = weighted * 4;

  return GUARDRAILS.map((g) => {
    let status: 'pass' | 'fail' | 'skip';
    switch (g.id) {
      case 'conviction_gate':
        status = conviction >= 3.5 ? 'pass' : 'fail';
        break;
      case 'mandatory_stop':
        status = action === 'BLOCKED' ? 'skip' : 'pass';
        break;
      case 'circuit_breaker':
        status = 'pass';
        break;
      case 'drawdown_kill_switch':
        status = 'pass';
        break;
      case 'hard_risk_gate':
        status = action === 'EXECUTE' && conviction < 3.5 ? 'fail' : 'pass';
        break;
      case 'metacognition':
        status = (judge.decision_logic ?? 3) >= 3 ? 'pass' : 'fail';
        break;
      case 'commit_reveal':
        status = action === 'BLOCKED' ? 'skip' : 'pass';
        break;
      case 'judge_mode_6d':
        status = judgeScore20 >= 12 ? 'pass' : 'fail';
        break;
      case 'adversarial_bounties':
        status = (judge.adversarial_quality ?? 3) >= 3 ? 'pass' : 'fail';
        break;
      case 'yield_parking':
        status = action === 'YIELD_PARK' ? 'pass' : 'skip';
        break;
      case 'wheel_market_breaker':
        status = 'skip';
        break;
      default:
        status = 'skip';
    }
    return { id: g.id, label: g.label, status };
  });
}

// ── Handler ────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.method === 'POST' ? (req.body || {}) : (req.query as Record<string, string>);
  const playbookSlug = String(body.playbookSlug || 'conviction-gated-swing');
  const ticker = String(body.ticker || 'BTC').toUpperCase().slice(0, 12);

  if (!OPENAI_KEY) {
    return res.status(500).json({ error: 'OPENAI_API_KEY not configured' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const send = sseWriter(res);

  try {
    send('meta', {
      playbookSlug,
      ticker,
      simulation: true,
      disclaimer: 'Simulation only. No capital moves. No on-chain commit.',
      guardrails: GUARDRAILS,
      dimensions: JUDGE_DIMENSIONS,
    });

    const ctx = `Playbook: ${playbookSlug}. Ticker: ${ticker}. Context: X Layer (chain 196), mid-2026 market.`;

    const alphaText = await streamAgent(send, 'alpha_hunter', SYSTEM_ALPHA, ctx);

    const redText = await streamAgent(
      send,
      'red_team',
      SYSTEM_RED,
      `${ctx}\n\nBULL THESIS:\n${alphaText}`
    );

    const cioText = await streamAgent(
      send,
      'cio',
      SYSTEM_CIO,
      `${ctx}\n\nBULL THESIS:\n${alphaText}\n\nRED TEAM REBUTTAL:\n${redText}`
    );
    const { action, conviction } = parseCio(cioText);
    send('cio_verdict', { action, conviction });

    send('phase_start', { phase: 'judge' });
    const judgeText = await openaiOneShot(
      SYSTEM_JUDGE,
      `DEBATE TRANSCRIPT:\n\n[ALPHA]\n${alphaText}\n\n[RED TEAM]\n${redText}\n\n[CIO]\n${cioText}`,
      200
    );
    const judgeScores = parseJudge(judgeText);
    send('judge_scores', { scores: judgeScores });
    send('phase_end', { phase: 'judge' });

    send('phase_start', { phase: 'guardrails' });
    const results = evalGuardrails(action, conviction, judgeScores);
    for (const r of results) {
      send('guardrail', r);
      await new Promise((r) => setTimeout(r, 140));
    }
    send('phase_end', { phase: 'guardrails' });

    const passed = results.filter((r) => r.status === 'pass').length;
    const failed = results.filter((r) => r.status === 'fail').length;
    const finalAction = failed > 0 && action === 'EXECUTE' ? 'BLOCKED' : action;
    send('verdict', {
      action: finalAction,
      conviction,
      guardrailsPassed: passed,
      guardrailsFailed: failed,
      guardrailsTotal: results.length,
      reason:
        finalAction === 'BLOCKED'
          ? 'Adversarial review and guardrails rejected this trade.'
          : finalAction === 'YIELD_PARK'
          ? 'Conviction below threshold. Capital parked, not deployed.'
          : 'Thesis survived adversarial debate and all guardrail checks.',
    });

    send('done', { ok: true });
    res.end();
  } catch (err: any) {
    console.error('[sandbox-run] error:', err?.message || err);
    send('error', { message: err?.message?.slice(0, 200) || 'Unknown error' });
    res.end();
  }
}
