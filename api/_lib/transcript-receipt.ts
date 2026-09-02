// ============================================================
// transcript-receipt — proof that a debate (text AND trade fields) was
// produced by Bobby, single-use.
//
// Codex phase-0 review #3, blocker 2: the first receipt signed only text +
// time, so it could be replayed for 24 h and paired with client-chosen
// trade metadata. The structured receipt binds:
//   id           — uuid, consumed exactly once by bobby_publish_debate()
//   iat          — issued at (ms)
//   wallet       — session wallet that requested the debate, or null (guest)
//   th           — sha256 of the exact transcript streamed
//   f            — trade fields parsed SERVER-SIDE from the CIO section
//   p            — publishable: fields complete enough for a forum thread
// The browser hands back transcript + receipt; forum-publish verifies the
// MAC, the hash and the wallet, then publishes through one RPC that
// records the receipt id (PK) and creates thread + posts atomically.
// ============================================================
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

export const TRANSCRIPT_RECEIPT_TTL_MS = 24 * 60 * 60 * 1000;
const PREFIX = 'btr2';

export interface DebateFields {
  symbol: string | null;
  direction: 'long' | 'short' | 'neutral' | null;
  conviction_score: number | null; // 0..1 — the protocol scale (judge-mode, checkpoint and cycles multiply by 10 for display)
  entry_price: number | null;
  stop_price: number | null;
  target_price: number | null;
}

export interface ReceiptPayload {
  id: string;
  iat: number;
  wallet: string | null;
  th: string;
  f: DebateFields;
  p: boolean;
}

export interface DebateSection { agent: 'alpha' | 'redteam' | 'cio'; content: string }

/**
 * Receipts are signed with their OWN key. In production BOBBY_TRANSCRIPT_SECRET
 * is required — falling back to BOBBY_SESSION_SECRET would let one secret
 * mint both wallet sessions and debate receipts (Codex review). Outside
 * production the session secret is still accepted so local dev needs one
 * variable less.
 */
function key(): Buffer | null {
  const own = (process.env.BOBBY_TRANSCRIPT_SECRET || '').trim();
  if (own.length >= 32) return Buffer.from(own, 'utf8');
  if (process.env.VERCEL_ENV === 'production') return null;
  const shared = (process.env.BOBBY_SESSION_SECRET || '').trim();
  return shared.length >= 32 ? Buffer.from(shared, 'utf8') : null;
}

/** True when receipts use a key of their own (never the session secret). */
export function transcriptSecretSeparate(): boolean {
  const own = (process.env.BOBBY_TRANSCRIPT_SECRET || '').trim();
  return own.length >= 32 && own !== (process.env.BOBBY_SESSION_SECRET || '').trim();
}

export function transcriptHash(transcript: string): string {
  return createHash('sha256').update(transcript, 'utf8').digest('hex');
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function mac(payloadB64: string, k: Buffer): Buffer {
  return createHmac('sha256', k).update(`${PREFIX}\n${payloadB64}`).digest();
}

/** Same section grammar the chat UI uses; the server decides who said what. */
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

const ASSETS = /\b(BTC|ETH|SOL|OKB|XRP|AVAX|LINK|DOGE|ADA|ATOM|ARB|OP|NVDA|AAPL|TSLA|META|GOOGL|MSFT|AMD|COIN|MSTR|SPY|QQQ|XOM|JPM|GS|XAUT|PAXG)\b/i;

function num(s: string | undefined): number | null {
  if (!s) return null;
  const n = parseFloat(s.replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Trade fields from the CIO section (ported from the chat's parser, now authoritative). */
export function parseDebateFields(transcript: string, userQuestion = ''): DebateFields {
  const cio = parseDebateSections(transcript).find((s) => s.agent === 'cio')?.content || '';
  const convM = cio.match(/(\d+)\s*\/\s*10/);
  const conviction = convM ? Math.min(1, Math.max(0, parseInt(convM[1], 10) / 10)) : null;
  const entryM = cio.match(/(?:entry|entr[ao]|buy(?:ing)?|short(?:ear)?|comprar?)\s+(?:\w+\s+)*?(?:en|at|a)\s*\$?([\d,]+(?:\.\d+)?)/i)
    || cio.match(/(?:en|at)\s*\$?([\d,]+(?:\.\d+)?)\s*[-–]\s*\$?([\d,]+)/i)
    || cio.match(/(?:Long|Short)\s+\w+\s+\$?([\d,]+(?:\.\d+)?)/i);
  const stopM = cio.match(/stop\s*(?:loss)?\s*(?:\w+\s+)*?(?:en|at|a|in)?\s*\$?([\d,]+(?:\.\d+)?)/i);
  const targetM = cio.match(/target\s*(?:\w+\s+)*?(?:en|at|a|in)?\s*\$?([\d,]+(?:\.\d+)?)/i)
    || cio.match(/(?:objetivo|soporte\s+real)\s*(?:\w+\s+)*?(?:en|at|a|in)?\s*\$?([\d,]+(?:\.\d+)?)/i);
  const dirM = cio.match(/\b(long|short(?:ear)?|comprar?|vender?)\b/i);
  const symM = userQuestion.match(ASSETS) || cio.match(ASSETS);
  const dirWord = dirM ? dirM[1].toLowerCase() : '';
  const direction: DebateFields['direction'] = !dirWord ? null : dirWord.startsWith('short') || dirWord.startsWith('vend') ? 'short' : 'long';
  return {
    symbol: symM ? symM[1].toUpperCase() : null,
    direction,
    conviction_score: conviction,
    entry_price: num(entryM ? (entryM[2] || entryM[1]) : undefined),
    stop_price: num(stopM?.[1]),
    target_price: num(targetM?.[1]),
  };
}

const WALLET_RE = /^0x[0-9a-f]{40}$/;

/** Low-level: sign an arbitrary payload. Exported for the adversarial gate only; product code uses issueTranscriptReceipt(). */
export function signReceiptPayload(payload: ReceiptPayload): string | null {
  const k = key();
  if (!k) return null;
  const b64 = Buffer.from(stable(payload)).toString('base64url');
  return `${PREFIX}.${b64}.${mac(b64, k).toString('base64url')}`;
}

/**
 * Build and sign the receipt for a finished debate. Requires the wallet
 * that asked (Codex review #4: a guest receipt could be claimed by any
 * signed-in wallet). Null when no secret is configured or no wallet.
 */
export function issueTranscriptReceipt(transcript: string, opts: { wallet: string | null; userQuestion?: string; now?: number }): { token: string; payload: ReceiptPayload } | null {
  const wallet = (opts.wallet || '').toLowerCase();
  if (!WALLET_RE.test(wallet)) return null;
  const f = parseDebateFields(transcript, opts.userQuestion || '');
  const payload: ReceiptPayload = {
    id: randomUUID(),
    iat: opts.now ?? Date.now(),
    wallet,
    th: transcriptHash(transcript),
    f,
    p: Boolean(f.symbol && f.direction && f.conviction_score !== null && f.conviction_score > 0 && f.conviction_score <= 1),
  };
  const token = signReceiptPayload(payload);
  return token ? { token, payload } : null;
}

/** Verify MAC + age + transcript hash. Wallet binding is the caller's decision (it knows the session). */
export function verifyTranscriptReceipt(transcript: string, receipt: string, now = Date.now()): { ok: true; payload: ReceiptPayload } | { ok: false; error: string } {
  const k = key();
  if (!k) return { ok: false, error: 'Transcript receipts are not configured' };
  const parts = String(receipt || '').split('.');
  if (parts.length !== 3 || parts[0] !== PREFIX) return { ok: false, error: 'Malformed receipt' };
  let provided: Buffer;
  try { provided = Buffer.from(parts[2], 'base64url'); } catch { return { ok: false, error: 'Malformed receipt' }; }
  const expected = mac(parts[1], k);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return { ok: false, error: 'Receipt signature invalid' };
  let payload: ReceiptPayload;
  try { payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as ReceiptPayload; } catch { return { ok: false, error: 'Malformed receipt' }; }
  if (typeof payload.id !== 'string' || typeof payload.iat !== 'number' || typeof payload.th !== 'string' || !payload.f) return { ok: false, error: 'Malformed receipt' };
  if (payload.f.conviction_score !== null && (typeof payload.f.conviction_score !== 'number' || payload.f.conviction_score < 0 || payload.f.conviction_score > 1)) return { ok: false, error: 'Conviction out of range (expected 0..1)' };
  if (payload.iat > now + 60_000 || now - payload.iat > TRANSCRIPT_RECEIPT_TTL_MS) return { ok: false, error: 'Receipt expired' };
  if (payload.th !== transcriptHash(transcript)) return { ok: false, error: 'Transcript does not match receipt' };
  return { ok: true, payload };
}
