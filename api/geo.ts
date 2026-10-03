// GET /api/geo — the visitor's two-letter country code, as Vercel's edge already resolved it. The site asks
// once, on a first visit with no language choice, to pick a default language (src/lib/geo-language.ts).
// Privacy: the IP address is never read, logged, stored or returned here; only the country header is used,
// nothing is persisted and nothing is logged.
import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = { maxDuration: 5 };

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const header = req.headers['x-vercel-ip-country'];
  const value = String((Array.isArray(header) ? header[0] : header) ?? '').trim().toUpperCase();
  return res.status(200).json({ country: /^[A-Z]{2}$/.test(value) ? value : null });
}
