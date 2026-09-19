// ============================================================
// The desk's seed card — what /api/progress granted for a read (contract §3
// `results[].world`) and the horizon choice offered right after it:
// 24 h (selected), 3 days, 7 days, upward only, with a confirm step.
// Pure state + one POST; the card component renders it.
// ============================================================
import { t } from '@/lib/companions/i18n';
import { TRADER_LAND_CLIENT_HEADER, HORIZONS, extendErrorMessage, extendedNotice, reviewOpened, type Extended, type Horizon, type HorizonHours, type PieceSummary, type Tier } from './growth';

/** A read's grant (RouteGrant + the Growth v1 additions). */
export interface WorldGrant {
  routeIndex: number | null;
  item: PieceSummary | null;
  inventoryId: string | null;
  state: 'seed' | 'bloomed' | null;
  /** seeds only */
  horizon: Horizon | null;
  /** what a 24 h / 3 days / 7 days horizon would bloom into */
  tiers: Partial<Record<Tier, PieceSummary>> | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
function piece(value: unknown): PieceSummary | null {
  if (!isRecord(value) || typeof value.id !== 'string') return null;
  const footprint = Array.isArray(value.footprint) && value.footprint.length === 2 ? value.footprint.map(Number) as [number, number] : [1, 1] as [number, number];
  return { id: value.id, world: String(value.world ?? ''), attribution: String(value.attribution ?? ''), kind: String(value.kind ?? ''), name: value.name, footprint };
}
function horizon(value: unknown): Horizon | null {
  if (!isRecord(value) || !HORIZONS.some((h) => h.hours === value.hours)) return null;
  const hours = value.hours as HorizonHours;
  return {
    hours,
    tier: HORIZONS.find((h) => h.hours === hours)!.tier,
    reviewAt: typeof value.reviewAt === 'string' ? value.reviewAt : '',
    extendable: value.extendable === true,
    extendTo: Array.isArray(value.extendTo) ? value.extendTo.filter((h): h is number => h === 72 || h === 168) : [],
  };
}

/** One `results[i].world` → a grant the card can render, or null (capped, duplicate, route error). */
export function parseGrant(raw: unknown): WorldGrant | null {
  if (!isRecord(raw)) return null;
  const state = raw.state === 'seed' || raw.state === 'bloomed' ? raw.state : null;
  const item = piece(raw.item);
  if (!state || !item || typeof raw.inventoryId !== 'string') return null;
  let tiers: WorldGrant['tiers'] = null;
  if (isRecord(raw.tiers)) {
    tiers = {};
    for (const tier of ['common', 'building', 'landmark'] as Tier[]) { const p = piece(raw.tiers[tier]); if (p) tiers[tier] = p; }
  }
  return { routeIndex: typeof raw.routeIndex === 'number' ? raw.routeIndex : null, item, inventoryId: raw.inventoryId, state, horizon: state === 'seed' ? horizon(raw.horizon) : null, tiers };
}

/** Grants keyed by the client event id that earned them. */
export function grantsFromResults(results: unknown): Array<[string, WorldGrant]> {
  if (!Array.isArray(results)) return [];
  return results.flatMap((r) => {
    if (!isRecord(r) || typeof r.id !== 'string') return [];
    const grant = parseGrant(r.world);
    return grant ? [[r.id, grant] as [string, WorldGrant]] : [];
  });
}

export interface SeedOption {
  hours: HorizonHours;
  tier: Tier;
  footprint: [number, number];
  /** the piece this horizon blooms into (the seed's own piece for its current horizon) */
  piece: PieceSummary | null;
  current: boolean;
  /** an upward extension the server still accepts */
  available: boolean;
}

/** The three horizons of a seed: its current one selected, longer ones offered while its review is closed. */
export function seedOptions(grant: WorldGrant, now = Date.now()): SeedOption[] {
  if (grant.state !== 'seed') return [];
  const current = grant.horizon?.hours ?? 24;
  const open = Boolean(grant.horizon?.extendable) && !reviewOpened(grant.horizon, now);
  return HORIZONS.map((h) => ({
    ...h,
    piece: h.hours === current ? grant.item : grant.tiers?.[h.tier] ?? null,
    current: h.hours === current,
    available: h.hours > current && open && Boolean(grant.horizon?.extendTo.includes(h.hours)),
  }));
}

/** The grant after the server extended it: new piece, new horizon, the tier's slot now holds that piece. */
export function applyExtended(grant: WorldGrant, extended: Extended): WorldGrant {
  const tier = extended.horizon.tier;
  const item = extended.item ?? grant.tiers?.[tier] ?? grant.item;
  return { ...grant, item, horizon: extended.horizon, tiers: { ...(grant.tiers ?? {}), ...(item ? { [tier]: item } : {}) } };
}

export type SeedCardState =
  | { phase: 'choose' }
  | { phase: 'confirm'; hours: HorizonHours }
  | { phase: 'saving'; hours: HorizonHours }
  | { phase: 'error'; hours: HorizonHours; message: string };
export type SeedCardAction =
  | { type: 'pick'; hours: HorizonHours; options: SeedOption[] }
  | { type: 'cancel' }
  | { type: 'submit' }
  | { type: 'success' }
  | { type: 'failure'; message: string };

/** choose → confirm ("You can't shorten it later") → saving → choose | error. */
export function seedCardReducer(state: SeedCardState, action: SeedCardAction): SeedCardState {
  switch (action.type) {
    case 'pick': {
      if (state.phase === 'saving') return state;
      const option = action.options.find((o) => o.hours === action.hours);
      return option?.available ? { phase: 'confirm', hours: action.hours } : { phase: 'choose' };
    }
    case 'cancel': return state.phase === 'saving' ? state : { phase: 'choose' };
    case 'submit': return state.phase === 'confirm' || state.phase === 'error' ? { phase: 'saving', hours: state.hours } : state;
    case 'success': return { phase: 'choose' };
    case 'failure': return state.phase === 'saving' ? { phase: 'error', hours: state.hours, message: action.message } : state;
  }
}

/** `extended` on success; otherwise the HTTP status (0 = network) and a message for the reader. */
export interface ExtendResult { ok: boolean; extended: Extended | null; status: number; message: string }

/**
 * POST /api/trader-land {action:'extend'} with the caller's credential. The
 * response carries the whole world too; the desk only needs `extended`.
 */
export async function extendSeed(auth: Record<string, string>, inventoryId: string, hours: HorizonHours, fetchImpl: typeof fetch = fetch): Promise<ExtendResult> {
  try {
    const response = await fetchImpl('/api/trader-land', {
      method: 'POST',
      headers: { ...auth, ...TRADER_LAND_CLIENT_HEADER, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'extend', inventoryId, hours }),
    });
    const value = (await response.json().catch(() => ({}))) as { extended?: unknown; error?: unknown };
    const extended = isRecord(value.extended) ? value.extended : null;
    const item = piece(extended?.item);
    const next = horizon(extended?.horizon);
    if (!response.ok || !extended || !next) return { ok: false, extended: null, status: response.status, message: extendErrorMessage(response.ok ? 0 : response.status, value.error) };
    return { ok: true, extended: { inventoryId: String(extended.inventoryId ?? inventoryId), item, horizon: next }, status: response.status, message: '' };
  } catch {
    return { ok: false, extended: null, status: 0, message: extendErrorMessage(0, null) };
  }
}

/**
 * The seed as the server has it now, from GET /api/trader-land: after a
 * refusal or a lost answer the card must not keep offering what already
 * happened (an extend that committed before its response was cut off).
 * World inventory rows carry the catalog item (footprint_w/h), not a PieceSummary.
 */
export async function rereadSeed(auth: Record<string, string>, inventoryId: string, fetchImpl: typeof fetch = fetch): Promise<Pick<WorldGrant, 'item' | 'horizon' | 'state'> | null> {
  try {
    const response = await fetchImpl('/api/trader-land', { headers: { ...auth, ...TRADER_LAND_CLIENT_HEADER } });
    if (!response.ok) return null;
    const value = (await response.json().catch(() => ({}))) as { inventory?: unknown };
    const row = Array.isArray(value.inventory) ? value.inventory.find((r) => isRecord(r) && r.id === inventoryId) : null;
    if (!isRecord(row)) return null;
    const state = row.state === 'seed' || row.state === 'bloomed' ? row.state : null;
    const raw = isRecord(row.item) ? row.item : null;
    const item = raw && typeof raw.id === 'string'
      ? piece({ ...raw, footprint: Array.isArray(raw.footprint) ? raw.footprint : [Number(raw.footprint_w ?? 1), Number(raw.footprint_h ?? 1)] })
      : null;
    return state && item ? { state, item, horizon: state === 'seed' ? horizon(row.horizon) : null } : null;
  } catch {
    return null;
  }
}

/** How an extend ended, in the reader's language. */
export type ExtendOutcome = { ok: true; message: string } | { ok: false; message: string };

/**
 * One extend from the desk card, start to finish: POST with the credential
 * that synced the grant, keep the new grant, and tell the builder how it
 * ended — on the card while it is still on screen, else through `notice`:
 * a new read replaces the card, and a request in flight at that moment
 * must not end in silence (a failed extend would look like it worked).
 */
export async function submitExtend(io: {
  auth: Record<string, string> | null;
  eventId: string;
  grant: WorldGrant;
  hours: HorizonHours;
  /** is the card that started it still mounted? */
  onScreen: () => boolean;
  card: (outcome: ExtendOutcome) => void;
  notice: (outcome: ExtendOutcome) => void;
  saveGrant: (eventId: string, grant: WorldGrant) => void;
  pieceLabel: (piece: PieceSummary) => string;
  fetchImpl?: typeof fetch;
}): Promise<ExtendOutcome> {
  const report = (outcome: ExtendOutcome) => { (io.onScreen() ? io.card : io.notice)(outcome); return outcome; };
  if (!io.auth || !io.grant.inventoryId) return report({ ok: false, message: t('Sign in again to extend it.', 'Vuelve a iniciar sesión para extenderla.') });
  const result = await extendSeed(io.auth, io.grant.inventoryId, io.hours, io.fetchImpl);
  if (!result.ok || !result.extended) {
    // A refusal or a lost answer: adopt the seed as the server has it, so the card
    // stops offering an extend that already happened (or a review that opened).
    const fresh = result.status === 400 || result.status === 409 || result.status === 0 ? await rereadSeed(io.auth, io.grant.inventoryId, io.fetchImpl) : null;
    if (fresh) io.saveGrant(io.eventId, { ...io.grant, ...fresh, tiers: fresh.horizon && fresh.item ? { ...(io.grant.tiers ?? {}), [fresh.horizon.tier]: fresh.item } : io.grant.tiers });
    return report({ ok: false, message: result.message });
  }
  const grant = applyExtended(io.grant, result.extended);
  io.saveGrant(io.eventId, grant);
  return report({ ok: true, message: grant.item ? extendedNotice(result.extended.horizon.hours, io.pieceLabel(grant.item)) : t('Horizon extended.', 'Horizonte extendido.') });
}
