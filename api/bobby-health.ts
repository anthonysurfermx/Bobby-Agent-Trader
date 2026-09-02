// GET /api/bobby-health — which database and which switches this deployment
// runs with. Public, read-only, no secrets: the project ref (not the URL or
// keys), the control flags and their source, and the effect policy. Used by
// the migration smoke tests and by anyone who needs to know if writes are
// frozen.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { bobbyDbRef, bobbyDbConfigured } from './_lib/bobby-db.js';
import { getBobbyControl } from './_lib/control.js';
import { rateLimitSaltConfigured } from './_lib/rate-limit.js';

export const config = { maxDuration: 10 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const control = await getBobbyControl();
  // Git-integrated deploys expose VERCEL_GIT_COMMIT_SHA. CLI deploys from a
  // worktree (`.git` is a file there) ship no git metadata, so
  // scripts/deploy-prod.sh injects BOBBY_BUILD_SHA / BOBBY_BUILD_REF instead.
  const gitSha = process.env.VERCEL_GIT_COMMIT_SHA || '';
  const cliSha = process.env.BOBBY_BUILD_SHA || '';
  const deploySha = gitSha || cliSha;
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
    ops: { manualRunsEnabled: Boolean(process.env.BOBBY_OPS_SECRET), rateLimitSaltConfigured: rateLimitSaltConfigured() },
    deployment: {
      env: process.env.VERCEL_ENV || 'local',
      sha: deploySha ? deploySha.slice(0, 7) : null,
      fullSha: deploySha || null,
      ref: process.env.VERCEL_GIT_COMMIT_REF || process.env.BOBBY_BUILD_REF || null,
      shaSource: gitSha ? 'vercel-git' : cliSha ? 'deploy-script' : null,
      deploymentId: process.env.VERCEL_DEPLOYMENT_ID || null,
    },
    checkedAt: new Date().toISOString(),
  });
}
