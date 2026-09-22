// Public island names are checked before publication. Failures never approve content.
import { createHash } from 'node:crypto';
import { bobbyRest, bobbyServiceHeaders } from './bobby-db.js';

export type TitleReview = 'approved' | 'rejected' | 'unavailable';
export async function reviewIslandTitle(title: string | null): Promise<TitleReview> {
  if (!title) return 'approved'; // The client displays a localized, built-in title.
  const normalized = title.normalize('NFKC').replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F]/g, '');
  if (/(?:https?:|www\.|t\.me\/|@[a-z0-9_]|\b(?:fuck|shit|puta|puto|mierda)\b)/iu.test(normalized)) return 'rejected';
  const key = process.env.OPENAI_API_KEY;
  if (!key) return 'unavailable';
  try {
    const response = await fetch('https://api.openai.com/v1/moderations', {
      method: 'POST', signal: AbortSignal.timeout(6000),
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'omni-moderation-latest', input: normalized }),
    });
    if (!response.ok) return 'unavailable';
    const body = await response.json() as { results?: Array<{ flagged?: boolean }> };
    if (body.results?.length !== 1 || typeof body.results[0].flagged !== 'boolean') return 'unavailable';
    return body.results[0].flagged ? 'rejected' : 'approved';
  } catch { return 'unavailable'; }
}

export function reporterHash(installation: string): string {
  return createHash('sha256').update(`bobby-island-report-v1:${installation.toLowerCase()}`).digest('hex');
}

export async function publishReviewedIsland(identity: string, code: string, title: string | null) {
  const response = await fetch(bobbyRest('rpc/tl_publish_reviewed'), {
    method: 'POST', headers: bobbyServiceHeaders(),
    body: JSON.stringify({ p_identity: identity, p_code: code, p_title: title }),
  });
  if (response.status === 409) return { ok: false as const, error: 'code_conflict' };
  if (!response.ok) throw new Error('Publication could not be saved');
  return await response.json() as { ok: boolean; error?: string; code?: string };
}
