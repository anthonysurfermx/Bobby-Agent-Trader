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

  const { tier, lang, voice } = (req.body ?? {}) as { tier?: string; lang?: string; voice?: string };
  const model = tier === 'premium' && isInternalRequest(req) ? MODEL_PREMIUM : MODEL_STANDARD;

  // Honor the persona voice picked in onboarding — whitelisted, with the
  // env default as fallback. Legacy male/female map to their personas.
  const REALTIME_VOICES = ['alloy', 'ash', 'ballad', 'coral', 'echo', 'sage', 'shimmer', 'verse', 'marin', 'cedar'];
  const LEGACY_VOICE_MAP: Record<string, string> = { male: 'ash', female: 'coral' };
  const requestedVoice = LEGACY_VOICE_MAP[voice || ''] || voice || '';
  const sessionVoice = REALTIME_VOICES.includes(requestedVoice) ? requestedVoice : (process.env.REALTIME_VOICE || 'marin');

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
          instructions: voiceInstructions(lang === 'en' ? 'en' : 'es'),
          audio: {
            // Fast conversational mode: detect the pause, interrupt Bobby when
            // the human starts speaking, and answer without waiting for a
            // semantic end-of-thought pass.
            input: {
              turn_detection: {
                type: 'server_vad',
                threshold: 0.48,
                prefix_padding_ms: 280,
                silence_duration_ms: 360,
                create_response: true,
                interrupt_response: true,
              },
            },
            output: { voice: sessionVoice },
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
