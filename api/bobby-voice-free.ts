// ============================================================
// POST /api/bobby-voice-free
// In-process free TTS (Microsoft Edge Neural voices via the
// unified TTS layer). Replaces the old Digital Ocean droplet
// proxy — no external server, no single point of failure.
// Returns the synthesized audio (audio/mpeg for Edge MP3,
// audio/ogg if TTS_PROVIDER=openai).
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { generateSpeech } from './_lib/tts.js';
import { enforcePublicRateLimit } from './_lib/request-security.js';
import { checkPersistentLimit } from './_lib/rate-limit-persistent.js';

export const config = { maxDuration: 30 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!await enforcePublicRateLimit(req, res, 'bobby-voice-free', 15, 600)) return;

  const body = req.body as { text?: string; voice?: string; lang?: string; vibe?: string };
  const text = body.text;
  // Whitelist every steering param — this endpoint is public
  const VALID_VOICES = ['alpha', 'red', 'cio', 'male', 'female', 'coral', 'ballad', 'sage', 'ash'];
  const VALID_LANGS = ['es', 'en', 'pt'];
  const VALID_VIBES = ['direct', 'analytical', 'wise'];
  const voice = VALID_VOICES.includes(body.voice || '') ? body.voice : 'cio';
  const lang = VALID_LANGS.includes(body.lang || '') ? body.lang : 'es';
  const vibe = VALID_VIBES.includes(body.vibe || '') ? body.vibe : undefined;

  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'text is required' });
  }
  // Sentence-level TTS: the app streams short sentences and ~120-char
  // previews. A tight cap bounds worst-case paid synthesis per request.
  if (text.length > 800) {
    return res.status(413).json({ error: 'text exceeds 800 characters' });
  }

  try {
    // Global daily spend circuit breaker: past the budget the endpoint keeps
    // working but degrades to free Edge voices instead of paid synthesis
    const budget = await checkPersistentLimit('tts-global', 'global', 3000, 86400);

    // mp3: Safari iOS can't play opus in <audio> — web always gets MP3
    const speech = await generateSpeech(text, {
      lang, voice, vibe, format: 'mp3',
      provider: budget.limited ? 'edge' : undefined,
    });
    if (!speech) {
      return res.status(502).json({ error: 'TTS synthesis failed' });
    }

    res.setHeader('Content-Type', speech.mime);
    // Personalized audio — never publicly cacheable (client caches in IndexedDB)
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-TTS-Provider', speech.provider);
    return res.status(200).send(speech.audio);
  } catch (error) {
    console.error('[Voice Free] error:', error instanceof Error ? error.message : error);
    return res.status(502).json({ error: 'TTS failed' });
  }
}
