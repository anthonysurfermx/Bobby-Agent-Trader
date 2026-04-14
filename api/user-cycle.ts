// ============================================================
// GET/POST /api/user-cycle — Personal agent debate cycles
//
// POST:
//   - Run a single personalized cycle by agent_profile_id or wallet_address
//
// GET:
//   - Internal batch runner for scheduler/cron
//   - Processes up to ?limit=10 due active profiles
//
// Notes:
//   - Reuses the global market snapshot from /api/bobby-intel
//   - Uses one Claude Haiku call to generate Alpha + Red Team + CIO
//   - Writes private threads into forum_threads/forum_posts
//   - Never executes real trades
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const config = { maxDuration: 120 };

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const SB_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://egpixaunlnzauztbrnuz.supabase.co';
const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
const CYCLE_SECRET = process.env.BOBBY_CYCLE_SECRET || process.env.CRON_SECRET || '';
const HAIKU_MODEL = 'gpt-4o-mini';

const PERSONALITY_INSTRUCTIONS: Record<string, string> = {
  direct: 'Be concise, aggressive, no BS. Go straight to action.',
  analytical: 'Be data-driven, show probabilities, cite indicators.',
  wise: 'Be philosophical, contextual, consider macro implications.',
};

type SupportedVoice = 'male' | 'female';
type SupportedPersonality = 'direct' | 'analytical' | 'wise';
type SupportedStatus = 'active' | 'paused' | 'deploying';

interface AgentProfile {
  id: string;
  wallet_address: string;
  agent_name: string;
  voice: SupportedVoice;
  personality: SupportedPersonality;
  cadence_hours: number;
  markets: string[];
  delivery: string[];
  status: SupportedStatus;
  created_at: string;
  updated_at?: string;
  last_run_at?: string | null;
  next_run_at?: string | null;
  last_error?: string | null;
  language?: string | null;
}

interface IntelPrice {
  symbol: string;
  price: number;
  change24h?: number;
}

interface IntelSnapshot {
  briefing?: string;
  regime?: string;
  fearGreed?: { value?: number; classification?: string } | number | null;
  dxy?: number | null;
  prices?: IntelPrice[];
  performance?: Record<string, unknown>;
  meta?: Record<string, unknown>;
}

interface DebateSignal {
  execute: boolean;
  symbol: string;
  direction: 'long' | 'short' | 'none';
  conviction: number;
  entry: number | null;
  stop: number | null;
  target: number | null;
  time_horizon?: string | null;
  invalidation?: string | null;
}

interface DebatePayload {
  language: 'en' | 'es';
  topic: string;
  summary: string;
  posts: {
    alpha: string;
    redteam: string;
    cio: string;
  };
  signal: DebateSignal;
}

function isAuthorized(req: VercelRequest): boolean {
  if (!CYCLE_SECRET) return true;
  const authHeader = req.headers.authorization;
  const internalHeader = req.headers['x-internal-secret'];
  const bodySecret = (req.body as { secret?: string } | undefined)?.secret;
  const querySecret = typeof req.query.secret === 'string' ? req.query.secret : undefined;
  return authHeader === `Bearer ${CYCLE_SECRET}`
    || internalHeader === CYCLE_SECRET
    || bodySecret === CYCLE_SECRET
    || querySecret === CYCLE_SECRET;
}

function sanitizeWallet(wallet: unknown): string | null {
  if (typeof wallet !== 'string') return null;
  const normalized = wallet.trim().toLowerCase();
  return /^0x[a-f0-9]{40}$/.test(normalized) ? normalized : null;
}

function sanitizeMarkets(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);
}

function sanitizeDelivery(input: unknown): string[] {
  if (!Array.isArray(input)) return ['web'];
  const values = input
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return values.length ? Array.from(new Set(values)) : ['web'];
}

function normalizeProfile(row: Record<string, unknown>): AgentProfile | null {
  const wallet = sanitizeWallet(row.wallet_address);
  const id = typeof row.id === 'string' ? row.id : null;
  const agentName = typeof row.agent_name === 'string' ? row.agent_name.trim() : '';
  const personality = typeof row.personality === 'string' ? row.personality : 'analytical';
  const voice = typeof row.voice === 'string' ? row.voice : 'male';
  const cadenceHours = Number(row.cadence_hours || 6);
  const status = typeof row.status === 'string' ? row.status : 'active';
  const markets = sanitizeMarkets(row.markets);
  const delivery = sanitizeDelivery(row.delivery);

  if (!id || !wallet || !agentName || !markets.length) return null;

  return {
    id,
    wallet_address: wallet,
    agent_name: agentName.slice(0, 20),
    voice: (voice === 'female' ? 'female' : 'male') as SupportedVoice,
    personality: (['direct', 'analytical', 'wise'].includes(personality) ? personality : 'analytical') as SupportedPersonality,
    cadence_hours: [4, 6, 12, 24].includes(cadenceHours) ? cadenceHours : 6,
    markets,
    delivery,
    status: (['active', 'paused', 'deploying'].includes(status) ? status : 'active') as SupportedStatus,
    created_at: typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
    updated_at: typeof row.updated_at === 'string' ? row.updated_at : undefined,
    last_run_at: typeof row.last_run_at === 'string' ? row.last_run_at : null,
    next_run_at: typeof row.next_run_at === 'string' ? row.next_run_at : null,
    last_error: typeof row.last_error === 'string' ? row.last_error : null,
    language: typeof row.language === 'string' ? row.language : null,
  };
}

function addHours(date: Date, hours: number): string {
  return new Date(date.getTime() + hours * 60 * 60 * 1000).toISOString();
}

function addMinutes(date: Date, minutes: number): string {
  return new Date(date.getTime() + minutes * 60 * 1000).toISOString();
}

function normalizeLanguage(language: unknown): 'en' | 'es' {
  return language === 'es' ? 'es' : 'en';
}

function extractPriceMap(intel: IntelSnapshot): Record<string, number> {
  return Object.fromEntries(
    (intel.prices || [])
      .filter((price) => price && typeof price.symbol === 'string' && Number.isFinite(price.price))
      .map((price) => [price.symbol.toUpperCase(), price.price]),
  );
}

function buildMarketContext(profile: AgentProfile, intel: IntelSnapshot): string {
  const selected = profile.markets;
  const selectedSet = new Set(selected.map((symbol) => symbol.toUpperCase()));
  const availablePrices = (intel.prices || []).filter((price) => selectedSet.has(price.symbol.toUpperCase()));
  const missingMarkets = selected.filter((market) => !availablePrices.some((price) => price.symbol.toUpperCase() === market));

  const priceLines = availablePrices.length
    ? availablePrices.map((price) =>
        `- ${price.symbol}: $${price.price}${typeof price.change24h === 'number' ? ` (${price.change24h >= 0 ? '+' : ''}${price.change24h.toFixed(2)}% 24h)` : ''}`
      ).join('\n')
    : '- No direct live price coverage in this snapshot for the selected markets.';

  const missingLine = missingMarkets.length
    ? `Markets without direct live price coverage in this snapshot: ${missingMarkets.join(', ')}. If you reference them, explicitly note limited live data coverage.`
    : 'All selected markets have direct live price coverage in this snapshot.';

  const fearGreed = typeof intel.fearGreed === 'object' && intel.fearGreed
    ? `${intel.fearGreed.value ?? '?'} (${intel.fearGreed.classification ?? 'unknown'})`
    : String(intel.fearGreed ?? 'unknown');

  return [
    `AGENT PROFILE`,
    `- Agent name: ${profile.agent_name}`,
    `- Personality: ${profile.personality}`,
    `- Voice: ${profile.voice}`,
    `- Delivery: ${profile.delivery.join(', ')}`,
    `- Cadence: every ${profile.cadence_hours} hours`,
    `- Selected markets: ${selected.join(', ')}`,
    '',
    `MARKET SNAPSHOT METADATA`,
    `- Regime: ${intel.regime || 'unknown'}`,
    `- Fear & Greed: ${fearGreed}`,
    `- DXY: ${intel.dxy ?? 'unknown'}`,
    '',
    `LIVE PRICE SNAPSHOT`,
    priceLines,
    '',
    missingLine,
    '',
    `GLOBAL MARKET BRIEFING`,
    intel.briefing || 'No market briefing available.',
  ].join('\n');
}

async function fetchIntel(req: VercelRequest): Promise<IntelSnapshot | null> {
  const urls = [
    'https://defimexico.org/api/bobby-intel',
    req.headers.host ? `${req.headers.host.includes('localhost') ? 'http' : 'https'}://${req.headers.host}/api/bobby-intel` : null,
    'https://defi-mexico-hub.vercel.app/api/bobby-intel',
  ].filter(Boolean) as string[];

  for (const url of urls) {
    try {
      const response = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!response.ok) continue;
      const intel = await response.json() as IntelSnapshot;
      if (intel?.briefing) return intel;
    } catch {
      continue;
    }
  }
  return null;
}

async function callHaiku(system: string, userMsg: string, maxTokens = 1200): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: HAIKU_MODEL,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userMsg },
      ],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(`OpenAI ${response.status}: ${errorBody.slice(0, 240)}`);
  }

  const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content || '';
}

function extractJsonPayload(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  const candidates = [
    withoutFence,
    withoutFence.slice(withoutFence.indexOf('{'), withoutFence.lastIndexOf('}') + 1),
  ].filter((candidate) => candidate && candidate.startsWith('{') && candidate.endsWith('}'));

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as Record<string, unknown>;
    } catch {
      // try next candidate
    }
  }

  throw new Error('Claude did not return valid JSON');
}

function parseNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeDebate(raw: Record<string, unknown>, profile: AgentProfile): DebatePayload {
  const language = normalizeLanguage(raw.language);
  const posts = typeof raw.posts === 'object' && raw.posts !== null ? raw.posts as Record<string, unknown> : {};
  const rawSignal = typeof raw.signal === 'object' && raw.signal !== null ? raw.signal as Record<string, unknown> : {};
  const allowedMarkets = new Set(profile.markets.map((symbol) => symbol.toUpperCase()));

  const signalSymbol = typeof rawSignal.symbol === 'string' ? rawSignal.symbol.trim().toUpperCase() : 'NONE';
  const normalizedSymbol = allowedMarkets.has(signalSymbol) ? signalSymbol : 'NONE';
  const normalizedDirection = rawSignal.direction === 'short'
    ? 'short'
    : rawSignal.direction === 'long'
      ? 'long'
      : 'none';
  const conviction = Math.max(1, Math.min(10, Math.round(parseNumber(rawSignal.conviction) || 3)));
  const entry = parseNumber(rawSignal.entry);
  const stop = parseNumber(rawSignal.stop);
  const target = parseNumber(rawSignal.target);
  const execute = rawSignal.execute === true
    && normalizedSymbol !== 'NONE'
    && normalizedDirection !== 'none'
    && entry !== null
    && stop !== null;

  const alpha = typeof posts.alpha === 'string' ? posts.alpha.trim() : '';
  const redteam = typeof posts.redteam === 'string' ? posts.redteam.trim() : '';
  const cio = typeof posts.cio === 'string' ? posts.cio.trim() : '';

  if (!alpha || !redteam || !cio) {
    throw new Error('Claude response missing one or more debate posts');
  }

  const topic = typeof raw.topic === 'string' && raw.topic.trim()
    ? raw.topic.trim().slice(0, 120)
    : `${profile.agent_name} — ${profile.markets.join('/')} cycle`;

  const summary = typeof raw.summary === 'string' && raw.summary.trim()
    ? raw.summary.trim()
    : cio.slice(0, 220);

  return {
    language,
    topic,
    summary,
    posts: { alpha, redteam, cio },
    signal: {
      execute,
      symbol: execute ? normalizedSymbol : 'NONE',
      direction: execute ? normalizedDirection : 'none',
      conviction,
      entry: execute ? entry : null,
      stop: execute ? stop : null,
      target: execute ? target : null,
      time_horizon: typeof rawSignal.time_horizon === 'string' ? rawSignal.time_horizon.trim() : null,
      invalidation: typeof rawSignal.invalidation === 'string' ? rawSignal.invalidation.trim() : null,
    },
  };
}

function buildDebatePrompts(profile: AgentProfile, intel: IntelSnapshot): { system: string; user: string } {
  const language = normalizeLanguage(profile.language);
  const personality = PERSONALITY_INSTRUCTIONS[profile.personality] || PERSONALITY_INSTRUCTIONS.analytical;
  const langRule = language === 'es'
    ? 'Write the entire output in Spanish (Mexican Spanish is fine). Trading terms in English are allowed.'
    : 'Write the entire output in English.';

  const allowedMarkets = profile.markets.map((market) => market.toUpperCase()).join(', ');

  const system = [
    `You are generating a PRIVATE multi-agent trading-room debate for a single user.`,
    `The room belongs to ${profile.agent_name}.`,
    `Overall room personality directive: ${personality}`,
    '',
    `You must simulate THREE voices in one response:`,
    `1. Alpha Hunter — bullish/opportunistic, identifies the best setup.`,
    `2. Red Team — skeptical, attacks the setup and highlights failure cases.`,
    `3. CIO — final decision-maker, balanced and accountable.`,
    '',
    `Rules:`,
    `- ${langRule}`,
    `- Only discuss these allowed markets: ${allowedMarkets}.`,
    `- If the snapshot is weak or unclear, CIO should explicitly sit out.`,
    `- Do NOT mention execution on a real exchange. This is simulated intelligence only.`,
    `- Return STRICT JSON only. No markdown fences. No prose outside JSON.`,
    '',
    `Required JSON shape:`,
    `{"language":"${language}","topic":"...","summary":"...","posts":{"alpha":"...","redteam":"...","cio":"..."},"signal":{"execute":true,"symbol":"BTC","direction":"long","conviction":7,"entry":70500,"stop":69200,"target":73900,"time_horizon":"swing","invalidation":"DXY breaks higher"}}`,
    '',
    `If there is NO strong setup, use:`,
    `{"signal":{"execute":false,"symbol":"NONE","direction":"none","conviction":3,"entry":null,"stop":null,"target":null,"time_horizon":"watchlist","invalidation":"Waiting for better confirmation"}}`,
    '',
    `Constraints:`,
    `- conviction must be an integer 1-10`,
    `- symbol must be one of: ${allowedMarkets}, or "NONE"`,
    `- direction must be "long", "short", or "none"`,
    `- Keep each post short and readable (roughly 80-160 words each)`,
    `- CIO must clearly decide execute vs sit out`,
  ].join('\n');

  const user = [
    buildMarketContext(profile, intel),
    '',
    `TASK`,
    `Generate the full 3-agent debate and final simulated signal for ${profile.agent_name}'s personal trading room.`,
    `Prefer the strongest single idea among the selected markets.`,
    `If the selected markets lack enough live data in the snapshot, CIO should explicitly sit out rather than hallucinate precision.`,
  ].join('\n');

  return { system, user };
}

async function loadProfile(
  supabase: SupabaseClient<any>,
  params: { agentProfileId?: string; walletAddress?: string },
): Promise<AgentProfile | null> {
  if (params.agentProfileId) {
    const { data, error } = await supabase
      .from('agent_profiles')
      .select('*')
      .eq('id', params.agentProfileId)
      .maybeSingle();

    if (error) throw new Error(`agent_profiles lookup failed: ${error.message}`);
    return data ? normalizeProfile(data as Record<string, unknown>) : null;
  }

  if (params.walletAddress) {
    const { data, error } = await supabase
      .from('agent_profiles')
      .select('*')
      .eq('wallet_address', params.walletAddress)
      .maybeSingle();

    if (error) throw new Error(`agent_profiles lookup failed: ${error.message}`);
    return data ? normalizeProfile(data as Record<string, unknown>) : null;
  }

  return null;
}

async function claimProfileForRun(
  supabase: SupabaseClient<any>,
  profile: AgentProfile,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('agent_profiles')
    .update({
      status: 'deploying',
      updated_at: new Date().toISOString(),
    })
    .eq('id', profile.id)
    .eq('status', 'active')
    .select('id')
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to claim profile ${profile.id}: ${error.message}`);
  }

  return !!data;
}

async function persistDebate(
  supabase: SupabaseClient<any>,
  profile: AgentProfile,
  intel: IntelSnapshot,
  debate: DebatePayload,
): Promise<Record<string, unknown>> {
  const now = new Date();
  const snapshot = {
    regime: intel.regime,
    fearGreed: intel.fearGreed,
    dxy: intel.dxy,
    prices: intel.prices || [],
    performance: intel.performance || {},
  };

  const { data: thread, error: threadError } = await supabase
    .from('forum_threads')
    .insert({
      topic: debate.topic,
      trigger_reason: 'Personal agent scheduled cycle',
      trigger_data: {
        summary: debate.summary,
        personality: profile.personality,
        delivery: profile.delivery,
        cadence_hours: profile.cadence_hours,
        selected_markets: profile.markets,
        simulated: true,
      },
      language: debate.language,
      conviction_score: debate.signal.conviction / 10,
      price_at_creation: extractPriceMap(intel),
      symbol: debate.signal.execute ? debate.signal.symbol : null,
      direction: debate.signal.execute ? debate.signal.direction : null,
      entry_price: debate.signal.entry,
      stop_price: debate.signal.stop,
      target_price: debate.signal.target,
      expires_at: addHours(now, Math.max(profile.cadence_hours * 2, 24)),
      kind: 'personal',
      scope: 'private',
      agent_profile_id: profile.id,
      owner_wallet: profile.wallet_address,
    })
    .select()
    .single();

  if (threadError || !thread) {
    throw new Error(`forum_threads insert failed: ${threadError?.message || 'unknown error'}`);
  }

  const posts = [
    { agent: 'alpha', content: debate.posts.alpha },
    { agent: 'redteam', content: debate.posts.redteam },
    { agent: 'cio', content: debate.posts.cio },
  ];

  const { error: postsError } = await supabase
    .from('forum_posts')
    .insert(posts.map((post) => ({
      thread_id: thread.id,
      agent: post.agent,
      content: post.content,
      data_snapshot: snapshot,
    })));

  if (postsError) {
    throw new Error(`forum_posts insert failed: ${postsError.message}`);
  }

  return thread as Record<string, unknown>;
}

async function markRunSuccess(
  supabase: SupabaseClient<any>,
  profile: AgentProfile,
  now: Date,
): Promise<void> {
  const { error } = await supabase
    .from('agent_profiles')
    .update({
      status: 'active',
      last_run_at: now.toISOString(),
      next_run_at: addHours(now, profile.cadence_hours),
      last_error: null,
    })
    .eq('id', profile.id);

  if (error) {
    throw new Error(`Failed to update profile after success: ${error.message}`);
  }
}

async function markRunFailure(
  supabase: SupabaseClient<any>,
  profileId: string,
  message: string,
): Promise<void> {
  const now = new Date();
  await supabase
    .from('agent_profiles')
    .update({
      status: 'active',
      last_error: message.slice(0, 500),
      next_run_at: addMinutes(now, 15),
    })
    .eq('id', profileId);
}

async function runSingleProfile(
  supabase: SupabaseClient<any>,
  profile: AgentProfile,
  intel: IntelSnapshot,
): Promise<{ profileId: string; threadId: string | null; symbol: string | null; ok: boolean }> {
  const now = new Date();

  const prompts = buildDebatePrompts(profile, intel);
  const raw = await callHaiku(prompts.system, prompts.user, 1200);
  const parsed = extractJsonPayload(raw);
  const debate = normalizeDebate(parsed, profile);
  const thread = await persistDebate(supabase, profile, intel, debate);

  await markRunSuccess(supabase, profile, now);

  // Fire-and-forget: deliver to Telegram (DMs + Groups)
  const threadId = typeof thread.id === 'string' ? thread.id : null;
  if (threadId) {
    const cycleSecret = process.env.BOBBY_CYCLE_SECRET;
    fetch('https://defimexico.org/api/telegram-deliver', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cycleSecret ? { Authorization: `Bearer ${cycleSecret}` } : {}),
      },
      body: JSON.stringify({
        thread_id: threadId,
        agent_profile_id: profile.id,
        conviction: debate.signal.conviction / 10,
        symbol: debate.signal.execute ? debate.signal.symbol : null,
      }),
    }).catch(err => console.error('[user-cycle] Telegram delivery failed:', err));
  }

  return {
    profileId: profile.id,
    threadId,
    symbol: debate.signal.execute ? debate.signal.symbol : null,
    ok: true,
  };
}

async function processBatch(
  req: VercelRequest,
  res: VercelResponse,
  supabase: SupabaseClient<any>,
): Promise<void> {
  const rawLimit = typeof req.query.limit === 'string' ? Number(req.query.limit) : 10;
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(10, Math.floor(rawLimit))) : 10;
  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from('agent_profiles')
    .select('*')
    .in('status', ['active', 'deploying'])
    .lte('next_run_at', nowIso)
    .order('next_run_at', { ascending: true })
    .limit(limit);

  if (error) {
    return void res.status(500).json({ error: `Failed to load due profiles: ${error.message}` });
  }

  const dueProfiles = (data || [])
    .map((row) => normalizeProfile(row as Record<string, unknown>))
    .filter((row): row is AgentProfile => !!row);

  if (!dueProfiles.length) {
    return void res.status(200).json({ ok: true, processed: 0, results: [] });
  }

  const intel = await fetchIntel(req);
  if (!intel?.briefing) {
    return void res.status(503).json({ error: 'Could not fetch shared market snapshot' });
  }

  const results: Array<Record<string, unknown>> = [];

  for (const profile of dueProfiles) {
    try {
      if (profile.status === 'active') {
        const claimed = await claimProfileForRun(supabase, profile);
        if (!claimed) {
          results.push({ profileId: profile.id, ok: false, skipped: true, reason: 'already claimed' });
          continue;
        }
      }
      const result = await runSingleProfile(supabase, { ...profile, status: 'deploying' }, intel);
      results.push(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      await markRunFailure(supabase, profile.id, message);
      results.push({ profileId: profile.id, ok: false, error: message });
    }
  }

  return void res.status(200).json({
    ok: true,
    processed: results.filter((result) => result.ok).length,
    attempted: dueProfiles.length,
    results,
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!SB_SERVICE_KEY) {
    return res.status(500).json({ error: 'Missing SUPABASE_SERVICE_ROLE_KEY' });
  }

  if (!OPENAI_API_KEY) {
    return res.status(500).json({ error: 'Missing OPENAI_API_KEY' });
  }

  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabase = createClient(SB_URL, SB_SERVICE_KEY);

  if (req.method === 'GET') {
    return processBatch(req, res, supabase);
  }

  const body = (req.body || {}) as { agent_profile_id?: string; wallet_address?: string };
  const agentProfileId = typeof body.agent_profile_id === 'string' ? body.agent_profile_id : undefined;
  const walletAddress = sanitizeWallet(body.wallet_address);

  if (!agentProfileId && !walletAddress) {
    return res.status(400).json({ error: 'agent_profile_id or wallet_address is required' });
  }

  try {
    const profile = await loadProfile(supabase, { agentProfileId, walletAddress: walletAddress || undefined });
    if (!profile) {
      return res.status(404).json({ error: 'Agent profile not found' });
    }

    if (profile.status === 'paused') {
      return res.status(409).json({ error: 'Agent profile is paused' });
    }

    const intel = await fetchIntel(req);
    if (!intel?.briefing) {
      return res.status(503).json({ error: 'Could not fetch shared market snapshot' });
    }

    const result = await runSingleProfile(supabase, profile, intel);

    return res.status(200).json({
      ok: true,
      profile_id: profile.id,
      wallet_address: profile.wallet_address,
      thread_id: result.threadId,
      symbol: result.symbol,
      next_run_at: addHours(new Date(), profile.cadence_hours),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    if (agentProfileId) {
      await markRunFailure(supabase, agentProfileId, message);
    }

    return res.status(500).json({ error: message });
  }
}
