// RETIRED: deployment from a public serverless route put the recorder hot key
// behind an HTTP endpoint and could deploy arbitrary constructor parameters.
// All protocol deployments now go through the audited Foundry scripts and a
// hardware-backed interactive signer. Keep the route as an explicit tombstone
// so stale callers fail safely instead of receiving a generic 404.

import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(410).json({
    error: 'Remote contract deployment is permanently disabled',
  });
}
