// ============================================================
// POST /api/bobby-voice
// ElevenLabs TTS streaming — Bobby's voice
// Returns audio/mpeg stream for direct playback
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { enforcePublicRateLimit } from './_lib/request-security.js';

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || '';
// "Antoni" — deep, authoritative, bilingual
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!await enforcePublicRateLimit(req, res, 'bobby-voice', 10, 600)) return;

  if (!ELEVENLABS_API_KEY) {
    return res.status(503).json({ error: 'ElevenLabs API key not configured' });
  }

  const { text } = req.body as { text?: string };

  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'text is required' });
  }

  // Keep one public request from consuming an excessive paid TTS quota.
  const safeText = text.slice(0, 2_000);

  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/stream`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': ELEVENLABS_API_KEY,
        },
        body: JSON.stringify({
          text: safeText,
          model_id: 'eleven_multilingual_v2',
          voice_settings: {
            stability: 0.45,
            similarity_boost: 0.8,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('ElevenLabs error:', response.status, errorText);
      return res.status(502).json({ error: 'ElevenLabs API error', status: response.status });
    }

    // Stream audio back
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Transfer-Encoding', 'chunked');

    const reader = response.body?.getReader();
    if (!reader) {
      return res.status(502).json({ error: 'No audio stream' });
    }

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
    } catch (streamError) {
      console.error('Audio stream error:', streamError);
    } finally {
      reader.releaseLock();
      res.end();
    }
  } catch (error) {
    console.error('Bobby voice error:', error);
    return res.status(502).json({ error: 'Failed to generate voice' });
  }
}
