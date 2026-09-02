// ============================================================
// transcript-receipt — proof that a debate text was produced by Bobby.
//
// Codex phase-0 review #2, blocker 4: a signed-in wallet could publish any
// text under the names cio / red_team / bobby. Now the streaming debate
// endpoint signs the exact transcript it emitted (HMAC over the text), the
// browser hands transcript + receipt back, and forum-publish only publishes
// text whose receipt verifies — the posts and their agent identities are
// parsed SERVER-SIDE from that canonical transcript.
// ============================================================
import { createHmac, timingSafeEqual } from 'node:crypto';

export const TRANSCRIPT_RECEIPT_TTL_MS = 24 * 60 * 60 * 1000;
const PREFIX = 'btr1';

function key(): Buffer | null {
  const raw = (process.env.BOBBY_TRANSCRIPT_SECRET || process.env.BOBBY_SESSION_SECRET || '').trim();
  return raw.length >= 32 ? Buffer.from(raw, 'utf8') : null;
}

function mac(issuedAt: number, transcript: string, k: Buffer): Buffer {
  return createHmac('sha256', k).update(`transcript\n${issuedAt}\n`).update(transcript, 'utf8').digest();
}

/** Receipt for a transcript, or null when no secret is configured (then nothing can be published). */
export function issueTranscriptReceipt(transcript: string, now = Date.now()): string | null {
  const k = key();
  if (!k) return null;
  return `${PREFIX}.${now}.${mac(now, transcript, k).toString('base64url')}`;
}

export function verifyTranscriptReceipt(transcript: string, receipt: string, now = Date.now()): { ok: true; issuedAt: number } | { ok: false; error: string } {
  const k = key();
  if (!k) return { ok: false, error: 'Transcript receipts are not configured' };
  const parts = String(receipt || '').split('.');
  if (parts.length !== 3 || parts[0] !== PREFIX) return { ok: false, error: 'Malformed receipt' };
  const issuedAt = Number(parts[1]);
  if (!Number.isFinite(issuedAt) || issuedAt > now + 60_000 || now - issuedAt > TRANSCRIPT_RECEIPT_TTL_MS) return { ok: false, error: 'Receipt expired' };
  let provided: Buffer;
  try { provided = Buffer.from(parts[2], 'base64url'); } catch { return { ok: false, error: 'Malformed receipt' }; }
  const expected = mac(issuedAt, transcript, k);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return { ok: false, error: 'Receipt does not match transcript' };
  return { ok: true, issuedAt };
}

export interface DebateSection { agent: 'alpha' | 'redteam' | 'cio'; content: string }

/** Same section grammar the chat UI uses; the server is the one that decides who said what. */
export function parseDebateSections(transcript: string): DebateSection[] {
  const rx = /\*\*\s*(ALPHA\s*HUNTER|RED\s*TEAM|MY\s*VERDICT|MI\s*VEREDICTO)\s*:?\s*\*\*:?\s*/gi;
  const marks: Array<{ idx: number; end: number; agent: DebateSection['agent'] }> = [];
  let m: RegExpExecArray | null;
  while ((m = rx.exec(transcript)) !== null) {
    const label = m[1].toLowerCase().replace(/\s+/g, '');
    marks.push({ idx: m.index, end: m.index + m[0].length, agent: label.includes('alpha') ? 'alpha' : label.includes('red') ? 'redteam' : 'cio' });
  }
  const out: DebateSection[] = [];
  for (let i = 0; i < marks.length; i++) {
    const end = i + 1 < marks.length ? marks[i + 1].idx : transcript.length;
    const content = transcript.slice(marks[i].end, end).trim();
    if (content) out.push({ agent: marks[i].agent, content: content.slice(0, 4000) });
  }
  return out;
}
