// ============================================================
// POST /api/bobby-voice-free
// Proxy to Edge TTS server on Digital Ocean droplet
// Free Microsoft Neural voices — zero cost forever
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';

const TTS_SERVER = process.env.TTS_SERVER_URL || 'http://143.110.194.171:8787/api/tts';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { text, voice = 'cio', lang = 'en' } = req.body as { text?: string; voice?: string; lang?: string };

  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'text is required' });
  }

  try {
    const response = await fetch(TTS_SERVER, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text.slice(0, 5000), voice, lang }),
    });

    if (!response.ok) {
      return res.status(502).json({ error: 'TTS server error' });
    }

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');

    const reader = response.body?.getReader();
    if (!reader) return res.status(502).json({ error: 'No audio stream' });

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
    } finally {
      reader.releaseLock();
      res.end();
    }
  } catch (error) {
    console.error('[Voice Free] Proxy error:', error instanceof Error ? error.message : error);
    return res.status(502).json({ error: 'TTS proxy failed' });
  }
}
