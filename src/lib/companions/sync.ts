// ============================================================
// Progress sync — reconciles the local companion progress with
// /api/progress whenever the desk has a credential (wallet session today,
// Supabase session later). The device never blocks on the network: awards
// are queued locally with the same rules and the server re-applies them,
// answering with the authoritative state.
// ============================================================
import { progressStore, type Progress, type ServerProgress } from './progress';

type HeadersFn = () => Record<string, string> | null;
export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'unauthenticated' | 'error';

let headersFn: HeadersFn | null = null;
let status: SyncStatus = 'idle';
let inflight: Promise<SyncStatus> | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

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
    // Only meaningful the first time: XP earned before signing in.
    ...(p.syncedAt === null && p.xp > 0 ? { localXpClaim: p.xp } : {}),
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
      const data = (await res.json()) as { progress: ServerProgress; results?: Array<{ id: string }> };
      progressStore.applyServer(data.progress, (data.results ?? []).map((r) => r.id));
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
