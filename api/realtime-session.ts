// ============================================================
// POST /api/realtime-session
// Mints a short-lived ephemeral client secret for the OpenAI Realtime API.
// The standard OPENAI_API_KEY never leaves the server — the browser only ever
// receives a token that expires in ~1 minute and is scoped to one session.
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { VOICE_TOOLS, voiceInstructions } from './_lib/voice-tools.js';
import { enforcePublicRateLimit, isInternalRequest } from './_lib/request-security.js';

export const config = { maxDuration: 15 };

// gpt-realtime-2.1-mini keeps live voice affordable; premium sessions can opt
// into the full model via ?tier=premium.
const MODEL_STANDARD = process.env.REALTIME_MODEL || 'gpt-realtime-2.1-mini';
const MODEL_PREMIUM = process.env.REALTIME_MODEL_PREMIUM || 'gpt-realtime-2.1';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!await enforcePublicRateLimit(req, res, 'realtime-session', 8, 600)) return;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'Realtime voice is not configured' });
  }

  const { tier, lang } = (req.body ?? {}) as { tier?: string; lang?: string };
  const sessionLang = lang === 'en' ? 'en' : 'es';
  const model = tier === 'premium' && isInternalRequest(req) ? MODEL_PREMIUM : MODEL_STANDARD;

  try {
    const response = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        session: {
          type: 'realtime',
          model,
          instructions: voiceInstructions(sessionLang),
          audio: {
            // Fast conversational mode: detect the pause, interrupt Bobby when
            // the human starts speaking, and answer without waiting for a
            // semantic end-of-thought pass.
            input: {
              // Configure transcription before WebRTC connects. Doing this in
              // a later session.update raced with the first user turn: Bobby
              // could hear it, but the client never received the transcript
              // that switches the chart and starts the visual brief.
              transcription: {
                model: 'whisper-1',
                language: sessionLang,
                prompt: sessionLang === 'es'
                  ? 'Español de México. Mercados: Nvidia, NVIDIA, NVDA, Bitcoin, Ethereum, BTC, ETH, SOL, Apple, Tesla, oro, long, short, stop, soporte, resistencia.'
                  : 'English. Markets: Nvidia, NVIDIA, NVDA, Bitcoin, Ethereum, BTC, ETH, SOL, Apple, Tesla, gold, long, short, stop, support, resistance.',
              },
              turn_detection: {
                type: 'server_vad',
                threshold: 0.48,
                prefix_padding_ms: 280,
                silence_duration_ms: 360,
                create_response: true,
                interrupt_response: true,
              },
            },
            output: { voice: process.env.REALTIME_VOICE || 'marin' },
          },
          tools: VOICE_TOOLS,
          tool_choice: 'auto',
        },
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error('[RealtimeSession] mint failed:', response.status, detail.slice(0, 400));
      return res.status(502).json({ error: 'Could not start the voice session' });
    }

    const data = (await response.json()) as { value?: string; expires_at?: number };

    return res.status(200).json({
      ok: true,
      client_secret: data.value,
      expires_at: data.expires_at,
      model,
    });
  } catch (error) {
    console.error('[RealtimeSession]', error instanceof Error ? error.message : error);
    return res.status(502).json({ error: 'Could not start the voice session' });
  }
}
