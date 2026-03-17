// ============================================================
// POST /api/onchainos-signal
// Recibe señales de OpenClaw y las procesa via OnchainOS
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { processAgentSignal } from '../src/lib/onchainos/signal-processor.js';
import { executeTrade } from '../src/lib/onchainos/client.js';
import type { SignalResponse } from '../src/lib/onchainos/types.js';

const SignalRequestSchema = z.object({
  walletAddress: z.string().min(1),
  marketSlug: z.string().min(1),
  score: z.number().min(0).max(100),
  direction: z.enum(['YES', 'NO']),
  outcomePrice: z.number().min(0).max(1),
  positionDelta: z.number().positive(),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Validar body con Zod
  const parsed = SignalRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    console.log('[OnchainOS] INVALID REQUEST', parsed.error.issues);
    return res.status(400).json({
      error: 'Invalid request body',
      details: parsed.error.issues,
    });
  }

  const { walletAddress, marketSlug, score, direction, outcomePrice, positionDelta } = parsed.data;

  const timestamp = new Date().toISOString();
  console.log('[OnchainOS] SIGNAL RECEIVED', {
    wallet: walletAddress,
    market: marketSlug,
    score,
    direction,
    outcomePrice,
    positionDelta,
    timestamp,
  });

  try {
    // Procesar la señal
    const decision = await processAgentSignal(
      walletAddress,
      marketSlug,
      score,
      direction,
      outcomePrice,
      positionDelta
    );

    let txHash: string | null = null;

    // Ejecutar trade solo si la decisión es EXECUTE y live trading está habilitado
    if (decision.action === 'EXECUTE' && decision.trade) {
      if (process.env.ENABLE_LIVE_TRADING === 'true') {
        try {
          const result = await executeTrade(decision.trade);
          txHash = result.ordId;
          console.log('[OnchainOS] TRADE EXECUTED', { txHash, timestamp });
        } catch (tradeError) {
          const msg = tradeError instanceof Error ? tradeError.message : 'Unknown trade error';
          console.error('[OnchainOS] TRADE EXECUTION FAILED', msg);
          // No falla la respuesta — retorna la decisión sin el trade
          txHash = null;
        }
      } else {
        console.log('[OnchainOS] LIVE TRADING DISABLED — trade simulated', { timestamp });
        txHash = `SIM-${Date.now()}`;
      }
    }

    const response: SignalResponse = {
      decision: decision.action,
      reason: decision.reason || (decision.action === 'EXECUTE' ? 'signal_confirmed' : 'unknown'),
      trade: decision.trade || null,
      divergence: decision.divergence || 0,
      expectedEdge: decision.expectedEdge || 0,
      txHash,
      spotPrice: decision.spotPrice,
      impliedPrice: decision.impliedPrice,
      consensusStrength: decision.consensusStrength,
    };

    console.log('[OnchainOS] SIGNAL PROCESSED', {
      decision: response.decision,
      divergence: `${response.divergence.toFixed(2)}%`,
      txHash: response.txHash,
      timestamp,
    });

    return res.status(200).json(response);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Internal server error';
    console.error('[OnchainOS] SIGNAL PROCESSING FAILED', msg);
    return res.status(500).json({ error: msg });
  }
}
