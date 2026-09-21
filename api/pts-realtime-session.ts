// ============================================================
// POST /api/pts-realtime-session
// Narrow OpenAI Realtime relay for the PTS demo.
//
// The OpenAI key stays on the server. This route mints a short-lived client
// secret and deliberately exposes no Bobby account, wallet, or tool surface.
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { enforcePublicRateLimit } from './_lib/request-security.js';

export const config = { maxDuration: 15 };

const MODEL = process.env.REALTIME_MODEL || 'gpt-realtime-2.1-mini';
const VOICE = process.env.REALTIME_VOICE || 'marin';

const PTS_INSTRUCTIONS = [
  'Eres el Copiloto PTS dentro de una demo educativa.',
  'Habla únicamente de COIN, la acción de Coinbase, la señal mostrada y la publicación de Daniel Marín.',
  'Responde en español de México y mantén cada respuesta por debajo de dos minutos.',
  'Si preguntan por otro activo, clima, actividades personales, ansiedad, crisis u otro tema fuera de COIN y Daniel, explica brevemente que esta sesión está limitada a la señal de COIN.',
  'Distingue siempre entre lo que Daniel reportó, el precio de COIN y los datos que faltan del contrato de opciones.',
  'Nunca inventes tipo de opción, strike, vencimiento, prima, tamaño, multiplicador, comisiones, entrada, stop ni P&L.',
  'No des órdenes de compra o venta ni presentes el contenido como asesoría financiera.',
].join(' ');

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!await enforcePublicRateLimit(req, res, 'pts-realtime-session', 6, 600)) return;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'Realtime voice is not configured' });

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
          model: MODEL,
          instructions: PTS_INSTRUCTIONS,
          audio: {
            input: {
              transcription: {
                model: 'gpt-4o-mini-transcribe',
                language: 'es',
                prompt: 'Español de México. COIN, Coinbase, opciones, strike, vencimiento, prima y Daniel Marín.',
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
            output: { voice: VOICE },
          },
        },
      }),
    });

    if (!response.ok) {
      console.error('[PTSRealtimeSession] mint failed:', response.status, (await response.text()).slice(0, 400));
      return res.status(502).json({ error: 'Could not start the PTS voice session' });
    }

    const data = await response.json() as { value?: string; expires_at?: number };
    if (!data.value) return res.status(502).json({ error: 'Could not start the PTS voice session' });

    return res.status(200).json({
      ok: true,
      client_secret: data.value,
      expires_at: data.expires_at,
      model: MODEL,
    });
  } catch (error) {
    console.error('[PTSRealtimeSession]', error instanceof Error ? error.message : error);
    return res.status(502).json({ error: 'Could not start the PTS voice session' });
  }
}
