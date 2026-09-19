// ============================================================
// Progress sync — reconciles the local companion progress with
// /api/progress whenever the desk has a credential (wallet session today,
// Supabase session later). The device never blocks on the network: awards
// are queued locally with the same rules and the server re-applies them,
// answering with the authoritative state.
// ============================================================
import { progressStore, type Progress, type ServerProgress } from './progress';
import { grantsFromResults, type WorldGrant } from '@/lib/trader-land/seed';

type HeadersFn = () => Record<string, string> | null;
export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'unauthenticated' | 'error';

let headersFn: HeadersFn | null = null;
let status: SyncStatus = 'idle';
let inflight: Promise<SyncStatus> | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

// Trader Land grants (`results[].world`) keyed by the event that earned them,
// so the desk can show the seed a read just planted and extend its horizon.
const grants = new Map<string, WorldGrant>();
const grantListeners = new Set<() => void>();
export function getGrant(eventId: string | null | undefined): WorldGrant | null { return eventId ? grants.get(eventId) ?? null : null; }
export function onGrants(cb: () => void): () => void { grantListeners.add(cb); return () => grantListeners.delete(cb); }
/** The desk replaces a grant after extending it, so every reader sees the new piece. */
export function setGrant(eventId: string, grant: WorldGrant): void { grants.set(eventId, grant); grantListeners.forEach((l) => l()); }
function recordGrants(results: unknown) {
  const fresh = grantsFromResults(results);
  if (!fresh.length) return;
  for (const [id, grant] of fresh) grants.set(id, grant);
  grantListeners.forEach((l) => l());
}
/** The credential progress syncs with (wallet session first, else the Apple/Google session): the identity that owns the grants. */
export function progressHeaders(): Record<string, string> | null { return headersFn?.() ?? null; }

export function getSyncStatus(): SyncStatus { return status; }
export function onSyncStatus(cb: () => void): () => void { listeners.add(cb); return () => listeners.delete(cb); }
function setStatus(next: SyncStatus) { if (status !== next) { status = next; emit(); } }

/** Register (or clear) the credential provider. Registering triggers a sync. */
export function configureProgressSync(fn: HeadersFn | null): void {
  headersFn = fn;
  if (!fn) { setStatus('idle'); return; }
  void syncProgress();
}

function profilePayload(p: Progress) {
  return {
    companionId: p.companionId,
    vibeId: p.vibeId,
    onboarded: p.onboarded,
    riskNoticeVersion: p.riskNoticeVersion,
    quickAccess: p.quickAccess,
    // XP earned on this device before THIS account existed. Sent on every
    // sync: the server only honours it for an empty account (xp 0, no ledger)
    // and caps it, so repeating it is harmless. Gating it on "never synced"
    // lost the points of anyone who had synced with a wallet and then signed
    // in with Apple or Google — the new account came back at 0 and the desk
    // overwrote the local XP with it.
    ...(p.xp > 0 ? { localXpClaim: p.xp } : {}),
  };
}

/**
 * One round trip. With pending events (or a first sync) it POSTs so the
 * server applies them and answers with the merged state; otherwise a GET.
 */
export async function syncProgress(): Promise<SyncStatus> {
  if (inflight) return inflight;
  const headers = headersFn?.();
  if (!headers) { setStatus('unauthenticated'); return status; }
  inflight = (async () => {
    setStatus('syncing');
    try {
      const local = progressStore.get();
      const pending = local.pendingEvents;
      const mustPost = pending.length > 0 || local.syncedAt === null;
      const res = await fetch('/api/progress', mustPost
        ? { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ platform: 'web', events: pending, profile: profilePayload(local) }) }
        : { headers });
      if (res.status === 401) { setStatus('unauthenticated'); return status; }
      if (!res.ok) { setStatus('error'); return status; }
      const data = (await res.json()) as { progress: ServerProgress; results?: Array<{ id: string; world?: unknown }> };
      progressStore.applyServer(data.progress, (data.results ?? []).map((r) => r.id));
      recordGrants(data.results);
      setStatus('synced');
      return status;
    } catch {
      setStatus('error');
      return status;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

// Any new pending event flushes shortly after (debounced), if signed in.
progressStore.subscribe(() => {
  if (!headersFn || progressStore.get().pendingEvents.length === 0) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { timer = null; void syncProgress(); }, 800);
});
