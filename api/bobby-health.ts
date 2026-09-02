// GET /api/bobby-health — which database and which switches this deployment
// runs with. Public, read-only, no secrets: the project ref (not the URL or
// keys), the control flags and their source, and the effect policy. Used by
// the migration smoke tests and by anyone who needs to know if writes are
// frozen.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { bobbyDbRef, bobbyDbConfigured } from './_lib/bobby-db.js';
import { getBobbyControl } from './_lib/control.js';

export const config = { maxDuration: 10 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const control = await getBobbyControl();
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    ok: true,
    db: { ref: bobbyDbRef(), configured: bobbyDbConfigured() },
    control: {
      writeFreeze: control.writeFreeze,
      canary: control.canary,
      source: control.source,
      dynamic: control.source === 'table' || control.source === 'edge-config',
      note: control.note,
    },
    ops: { manualRunsEnabled: Boolean(process.env.BOBBY_OPS_SECRET) },
    deployment: { env: process.env.VERCEL_ENV || 'local', sha: (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7) || null },
    checkedAt: new Date().toISOString(),
  });
}
