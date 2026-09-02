// POST /api/app-chat
// Conversational, streaming surface for the Bobby mobile app. Market context is
// cached independently from chat state so a follow-up never pays to recalculate
// indicators. The client owns the transcript; the server deliberately stores no
// message content or identity-linked memory in phase 1.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHash } from 'node:crypto';
import { getCache, setCache } from './_lib/api-cache.js';
import { checkPersistentLimit } from './_lib/rate-limit-persistent.js';
import { getClientIpKey } from './_lib/rate-limit.js';
import { matchAssetInText, normalizeAssetSymbol } from '../src/lib/voice-assets.js';
import { bobbyDbUrl, bobbyServiceKey } from './_lib/bobby-db.js';

export const config = { maxDuration: 30 };

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const MARKET_TTL_SEC = 45;
const MAX_MESSAGES = 12;
const MAX_MESSAGE_CHARS = 2_000;
const DEVICE_DAILY_LIMIT = Number(process.env.APP_CHAT_DEVICE_DAILY_LIMIT || 20);
const IP_DAILY_LIMIT = Number(process.env.APP_CHAT_IP_DAILY_LIMIT || 40);
const GLOBAL_DAILY_LIMIT = Number(process.env.APP_CHAT_GLOBAL_DAILY_LIMIT || 2_000);
const MAX_COMPLETION_TOKENS = Number(process.env.APP_CHAT_MAX_TOKENS || 450);

type ChatMessage = { role: 'user' | 'assistant'; content: string };
type Vibe = 'chill' | 'direct' | 'pro';

interface AppChatRequest {
  messages?: unknown;
  symbol?: unknown;
  deviceId?: unknown;
  vibe?: unknown;
  lang?: unknown;
  timeframe?: unknown;
}

function sse(res: VercelResponse, event: string, data: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function normalizeMessages(raw: unknown): ChatMessage[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_MESSAGES) return null;
  const messages: ChatMessage[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') return null;
    const message = item as { role?: unknown; content?: unknown };
    if ((message.role !== 'user' && message.role !== 'assistant') || typeof message.content !== 'string') return null;
    const content = message.content.trim();
    if (!content || content.length > MAX_MESSAGE_CHARS) return null;
    messages.push({ role: message.role, content });
  }
  return messages;
}

function normalizeSymbol(value: unknown, messages: ChatMessage[]): string {
  if (typeof value === 'string' && value.trim()) {
    const normalized = normalizeAssetSymbol(value);
    if (/^[A-Z0-9]{1,12}$/.test(normalized)) return normalized;
  }
  // Read the newest turn first. The shared voice registry understands company
  // names and spoken aliases too ("Apple" -> AAPL, "envidia" -> NVDA), while
  // its homonym guard prevents phrases such as "mi meta es..." becoming META.
  for (const message of [...messages].reverse()) {
    if (message.role !== 'user') continue;
    const match = matchAssetInText(message.content);
    if (match) return match;
  }
  return 'BTC';
}

function tone(vibe: Vibe): string {
  if (vibe === 'chill') return 'Warm, calm and plain-spoken. Use light confidence, never hype.';
  if (vibe === 'direct') return 'Crisp and decisive. Lead with the conclusion, then the evidence and risk.';
  return 'Professional and compact. State assumptions, evidence, invalidation and uncertainty.';
}

function publicApiBase(): string {
  // The deployed protocol origin is a trusted, fixed configuration value. This
  // avoids reflecting Host/x-forwarded-host into a server-side fetch.
  return (process.env.BOBBY_PROTOCOL_BASE_URL || 'https://bobbyprotocol.xyz').replace(/\/$/, '');
}

async function getMarketContext(symbol: string, timeframe: string): Promise<Record<string, unknown>> {
  const key = `app-chat:technical:${symbol}:${timeframe}`;
  const hit = await getCache<Record<string, unknown>>(key);
  if (hit) return hit;

  const url = `${publicApiBase()}/api/technical-analysis?symbol=${encodeURIComponent(symbol)}&period=${encodeURIComponent(timeframe)}`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(7_000) });
    if (!response.ok) throw new Error(`technical-analysis ${response.status}`);
    const data = await response.json() as { summary?: Record<string, unknown>; symbol?: string };
    const context = { symbol: data.symbol || symbol, summary: data.summary || {}, source: 'technical-analysis' };
    await setCache(key, context, MARKET_TTL_SEC);
    return context;
  } catch {
    // A conversational explanation can still be useful during a market-data
    // outage, but it must disclose the lack of live technical context.
    return { symbol, summary: {}, source: 'unavailable' };
  }
}

function buildSystemPrompt(args: { vibe: Vibe; lang: string; symbol: string; market: Record<string, unknown> }) {
  const language = args.lang.toLowerCase().startsWith('es') ? 'Spanish' : 'English';
  return `You are Bobby, a market-intelligence agent. Speak ${language}. ${tone(args.vibe)}

Your product hook, for a first-turn "what are you?" question: "I turn live market structure and Bobby Protocol's verified record into a clear thesis, its risks, and what would prove it wrong."

Rules:
- Current focus asset is ${args.symbol}. Preserve it across follow-ups unless the user explicitly changes asset.
- Use only the supplied live market context for numerical market claims. If it is unavailable, say so plainly; do not invent prices or indicators.
- Never promise returns or present a trade as certain. Include a concise risk/invalidation when discussing an entry.
- Do not claim you executed trades or accessed a user's wallet.
- Keep answers under 220 words unless the user requests depth.

LIVE TECHNICAL CONTEXT (computed once for this turn; may be cached up to 45 seconds):
${JSON.stringify(args.market)}`;
}

function canUsePersistentLimits(): boolean {
  return Boolean(bobbyDbUrl() && bobbyServiceKey());
}

function opaqueQuotaId(value: string): string {
  // api_cache is operational storage, not an identity store. Hashing keeps a
  // stolen DB row from directly revealing either the device identifier or IP.
  return createHash('sha256').update(`${process.env.APP_CHAT_QUOTA_SALT || 'bobby-app-chat'}:${value}`).digest('hex');
}

async function applyCostGuards(deviceId: string, ip: string) {
  // Production fails closed when durable accounting is missing. Local development
  // remains usable without secrets; deployments can override explicitly for drills.
  const failClosed = process.env.APP_CHAT_FAIL_CLOSED === 'true' || process.env.VERCEL === '1';
  if (failClosed && !canUsePersistentLimits()) return { allowed: false, reason: 'quota_unavailable', retryAfter: 60 };

  const day = new Date().toISOString().slice(0, 10);
  // Do not increment the shared spending bucket until caller-specific checks
  // have passed. Otherwise one throttled device could drain global capacity.
  const device = await checkPersistentLimit('app-chat:device:' + day, opaqueQuotaId(deviceId), DEVICE_DAILY_LIMIT, 86_400);
  if (device.limited) return { allowed: false, reason: 'quota_exceeded', retryAfter: Math.max(1, Math.ceil((device.resetAt - Date.now()) / 1000)) };
  const address = await checkPersistentLimit('app-chat:ip:' + day, opaqueQuotaId(ip), IP_DAILY_LIMIT, 86_400);
  if (address.limited) return { allowed: false, reason: 'quota_exceeded', retryAfter: Math.max(1, Math.ceil((address.resetAt - Date.now()) / 1000)) };
  const global = await checkPersistentLimit('app-chat:global:' + day, 'all', GLOBAL_DAILY_LIMIT, 86_400);
  const blocked = global.limited ? global : null;
  return blocked
    ? { allowed: false, reason: 'quota_exceeded', retryAfter: Math.max(1, Math.ceil((blocked.resetAt - Date.now()) / 1000)) }
    : { allowed: true, remaining: Math.min(device.remaining, address.remaining, global.remaining) };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const body = (req.body || {}) as AppChatRequest;
  const messages = normalizeMessages(body.messages);
  const deviceId = typeof body.deviceId === 'string' && /^[A-Za-z0-9_-]{8,128}$/.test(body.deviceId) ? body.deviceId : null;
  if (!messages || !deviceId) return res.status(400).json({ error: 'messages and a valid deviceId are required' });
  if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: 'chat_unavailable' });
  if (process.env.APP_CHAT_KILL_SWITCH === 'true') return res.status(503).json({ error: 'chat_paused' });

  const guard = await applyCostGuards(deviceId, getClientIpKey(req));
  if (!guard.allowed) {
    res.setHeader('Retry-After', String(guard.retryAfter));
    return res.status(429).json({ error: guard.reason, retryAfter: guard.retryAfter });
  }

  const symbol = normalizeSymbol(body.symbol, messages);
  const timeframe = typeof body.timeframe === 'string' && /^[A-Za-z0-9]{1,8}$/.test(body.timeframe) ? body.timeframe : '7d';
  const vibe: Vibe = body.vibe === 'chill' || body.vibe === 'direct' || body.vibe === 'pro' ? body.vibe : 'pro';
  const lang = typeof body.lang === 'string' ? body.lang.slice(0, 12) : 'en';
  const startedAt = Date.now();
  const market = await getMarketContext(symbol, timeframe);

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
  sse(res, 'meta', { symbol, quotaRemaining: guard.remaining, marketSource: market.source });

  try {
    const openai = await fetch(OPENAI_URL, {
      method: 'POST',
      signal: AbortSignal.timeout(20_000),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: process.env.APP_CHAT_MODEL || 'gpt-4o-mini', stream: true,
        max_tokens: MAX_COMPLETION_TOKENS, temperature: 0.35,
        messages: [{ role: 'system', content: buildSystemPrompt({ vibe, lang, symbol, market }) }, ...messages],
      }),
    });
    if (!openai.ok || !openai.body) throw new Error(`OpenAI ${openai.status}`);

    const reader = openai.body.getReader();
    const decoder = new TextDecoder();
    let pending = '';
    let firstTokenMs: number | null = null;
    let tokens = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true });
      const lines = pending.split('\n');
      pending = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6).trim();
        if (payload === '[DONE]') continue;
        try {
          const json = JSON.parse(payload) as { choices?: Array<{ delta?: { content?: string } }> };
          const token = json.choices?.[0]?.delta?.content;
          if (!token) continue;
          if (firstTokenMs === null) firstTokenMs = Date.now() - startedAt;
          tokens += 1;
          sse(res, 'token', { text: token });
        } catch { /* Ignore partial/provider keepalive frames. */ }
      }
    }
    sse(res, 'done', { firstTokenMs, durationMs: Date.now() - startedAt, streamedChunks: tokens });
  } catch (error) {
    console.error('[app-chat]', error instanceof Error ? error.message : error);
    sse(res, 'error', { error: 'generation_failed' });
  } finally {
    res.end();
  }
}
