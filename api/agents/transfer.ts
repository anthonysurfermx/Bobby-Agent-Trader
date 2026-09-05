// ============================================================
// POST /api/agents/transfer — BP-10 (2026-09-04 review): ownership transfer is
// an explicit operation, signed by the CURRENT owner, bound to the row version
// the owner saw, and single-use (requestId). Registration can no longer move
// an owner as a side effect.
// ============================================================
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyAgentRequest } from '../_lib/agent-auth.js';
import { AgentReadError, getAgentStrict, transferAgentOwner } from '../_lib/hardness-control-plane.js';
import { requireWritesOpen } from '../_lib/control.js';

export const config = { maxDuration: 10 };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!(await requireWritesOpen(res))) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const body = (req.body || {}) as { agentId?: string; newOwner?: string; expectedRowVersion?: number; requestId?: string };
  if (!/^[A-Za-z0-9._:-]{1,100}$/.test(String(body.agentId || ''))) return res.status(400).json({ error: 'Invalid agentId' });
  if (!/^0x[a-fA-F0-9]{40}$/.test(String(body.newOwner || ''))) return res.status(400).json({ error: 'Invalid newOwner' });
  if (!Number.isInteger(body.expectedRowVersion) || Number(body.expectedRowVersion) < 1) return res.status(400).json({ error: 'expectedRowVersion must be the hardness_agents.row_version you read' });
  if (!UUID.test(String(body.requestId || ''))) return res.status(400).json({ error: 'requestId must be a single-use UUID' });

  let existing: Record<string, any> | null;
  try {
    existing = await getAgentStrict(String(body.agentId));
  } catch (error) {
    return res.status(502).json({ error: error instanceof AgentReadError ? error.message : 'Agent registry read failed' });
  }
  if (!existing) return res.status(404).json({ error: 'Unknown agent' });

  // Signed by the CURRENT owner over this exact payload (agentId, newOwner, expectedRowVersion, requestId).
  const auth = await verifyAgentRequest(req, 'transfer-agent', body as Record<string, unknown>, String(existing.owner_address));
  if (!auth.ok) return res.status(401).json({ error: auth.error });
  if (auth.mode !== 'signed' && auth.mode !== 'internal') return res.status(401).json({ error: 'Transfer requires a signed request' });

  const result = await transferAgentOwner(String(body.agentId), String(existing.owner_address), String(body.newOwner), Number(body.expectedRowVersion), String(body.requestId));
  if (!result.ok) {
    const status = result.error === 'REQUEST_REPLAYED' || result.error === 'STALE_VERSION' || result.error === 'OWNER_MISMATCH' ? 409 : result.error === 'NOT_FOUND' ? 404 : 502;
    return res.status(status).json({ error: `Transfer refused: ${result.error}` });
  }
  return res.status(200).json({ ok: true, agentId: result.row.agent_id, owner: result.row.owner_address, rowVersion: result.row.row_version });
}
