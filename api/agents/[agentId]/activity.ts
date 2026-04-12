import type { VercelRequest, VercelResponse } from '@vercel/node';
import { listAgentSessions, listProofsBySessions } from '../../_lib/hardness-control-plane.js';

export const config = { maxDuration: 10 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const agentId = String(req.query.agentId || '').trim();
  const limit = Math.max(1, Math.min(100, Number(req.query.limit || 20)));
  if (!agentId) {
    return res.status(400).json({ error: 'Missing agentId' });
  }

  const sessions = await listAgentSessions(agentId, limit);
  const proofs = await listProofsBySessions(sessions.map((item: any) => item.session_id));
  const proofMap = new Map(proofs.map((proof: any) => [proof.session_id, proof]));

  return res.status(200).json({
    ok: true,
    items: sessions.map((session: any) => ({
      sessionId: session.session_id,
      createdAt: session.created_at,
      intent: session.intent,
      symbol: session.symbol,
      direction: session.direction,
      decision: session.decision_json?.decision || null,
      outcome: session.decision_json?.outcome || 'pending',
      hardnessScore: session.hardness_score,
      policyResult: session.policy_result,
      status: session.status,
      proofs: proofMap.get(session.session_id) || null,
    })),
  });
}
