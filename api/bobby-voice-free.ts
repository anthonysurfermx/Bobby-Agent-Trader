// ============================================================
// POST /api/bobby-voice-free
// In-process free TTS (Microsoft Edge Neural voices via the
// unified TTS layer). Replaces the old Digital Ocean droplet
// proxy — no external server, no single point of failure.
// Returns the synthesized audio (audio/mpeg for Edge MP3,
// audio/ogg if TTS_PROVIDER=openai).
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { generateSpeech } from './_lib/tts';

export const config = { maxDuration: 30 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { text, lang = 'es' } = req.body as { text?: string; voice?: string; lang?: string };

  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'text is required' });
  }

  try {
    const speech = await generateSpeech(text, { lang });
    if (!speech) {
      return res.status(502).json({ error: 'TTS synthesis failed' });
    }

    res.setHeader('Content-Type', speech.mime);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('X-TTS-Provider', speech.provider);
    return res.status(200).send(speech.audio);
  } catch (error) {
    console.error('[Voice Free] error:', error instanceof Error ? error.message : error);
    return res.status(502).json({ error: 'TTS failed' });
  }
}
