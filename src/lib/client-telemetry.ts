// Bounded, best-effort client reports. They describe this instrumented client, never human presence.
export type ClientEvent = 'foreground' | 'heartbeat' | 'background' | 'read_started' | 'read_received' | 'read_rendered';
export interface TelemetryReceipt { requestId: string; receipt: string; generation: number }
export interface ClientReport {
  schemaVersion: 1; eventId: string; sessionId: string; sequence: number; event: ClientEvent;
  occurredAt: string; version?: string; build?: string; receipt?: string; requestId?: string;
}
export interface TelemetryIO {
  allowed: () => boolean; visible: () => boolean; uuid: () => string;
  headers: () => Promise<Record<string, string>>;
  send: (report: ClientReport, headers: Record<string, string>, signal: AbortSignal) => Promise<unknown>;
  setTimeout: (fn: () => void, ms: number) => unknown; clearTimeout: (id: unknown) => void;
  version?: string; build?: string;
  now?: () => string;
}
export const CLIENT_HEARTBEAT_MS = 30_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHORT = /^[A-Za-z0-9._+-]{1,64}$/;
const MAX_QUEUE = 20, SEND_TIMEOUT_MS = 4000;

export class ClientTelemetry {
  private generation = 0;
  private sessionId: string;
  private sequence = 0;
  private lastCapturedMs = 0;
  private serverOffsetMs = 0;
  private active = false;
  private disposed = false;
  private queue: Array<{ report: ClientReport; generation: number; attempt: number }> = [];
  private sending: { controller: AbortController; generation: number } | null = null;
  private acknowledged = new Set<string>();
  constructor(private io: TelemetryIO) { this.sessionId = io.uuid(); }

  /** One state transition per visibility/route change; SPA navigation does not become another opening. */
  reconcile() {
    if (this.disposed) return;
    const next = this.io.allowed() && this.io.visible();
    if (next === this.active) return;
    this.active = next;
    // A final background for the preceding public surface clears its report before entering /admin.
    this.enqueue(next ? 'foreground' : 'background', undefined, !next);
  }
  heartbeat() { this.reconcile(); if (this.active) this.enqueue('heartbeat'); }
  background() { if (this.active) { this.active = false; this.enqueue('background', undefined, true); } }
  identityChanged() {
    this.generation++;
    this.queue = [];
    this.sending?.controller.abort();
    this.sending = null;
    this.sessionId = this.io.uuid();
    this.sequence = 0;
    this.acknowledged.clear();
    this.active = false;
    this.reconcile();
  }
  beginRead(): { requestId: string; generation: number } {
    const request = { requestId: this.io.uuid(), generation: this.generation };
    this.reconcile();
    this.enqueue('read_started', undefined, false, request.requestId);
    return request;
  }
  received(request: { requestId: string; generation: number }, raw: unknown): TelemetryReceipt | null {
    if (request.generation !== this.generation || !raw || typeof raw !== 'object') return null;
    const value = raw as Record<string, unknown>;
    if (!UUID.test(request.requestId) || value.requestId !== request.requestId || typeof value.receipt !== 'string' || !value.receipt || value.receipt.length > 1024) return null;
    const receipt = { ...request, receipt: value.receipt };
    this.enqueue('read_received', receipt);
    return receipt;
  }
  rendered(receipt: TelemetryReceipt) {
    if (receipt.generation === this.generation && this.io.visible()) this.enqueue('read_rendered', receipt);
  }
  dispose() { this.disposed = true; this.queue = []; this.sending?.controller.abort(); this.sending = null; }
  private enqueue(event: ClientEvent, receipt?: TelemetryReceipt, finalBackground = false, requestId?: string) {
    if (this.disposed || (!this.io.allowed() && !finalBackground)) return;
    if (receipt) {
      const key = `${event}|${receipt.requestId}`;
      if (this.acknowledged.has(key)) return;
      this.acknowledged.add(key);
      if (this.acknowledged.size > 200) this.acknowledged.delete(this.acknowledged.values().next().value!);
    }
    if (event === 'heartbeat' && this.queue.some((v) => v.report.event === event)) return;
    const wallMs = Date.parse(this.io.now?.() ?? new Date().toISOString());
    const capturedMs = (Number.isFinite(wallMs) ? wallMs : Date.now()) + this.serverOffsetMs;
    this.lastCapturedMs = Math.max(capturedMs, this.lastCapturedMs + 1);
    const report: ClientReport = { schemaVersion: 1, eventId: this.io.uuid(), sessionId: this.sessionId, sequence: ++this.sequence, event, occurredAt: new Date(this.lastCapturedMs).toISOString(),
      ...(this.io.version && SHORT.test(this.io.version) ? { version: this.io.version } : {}),
      ...(this.io.build && SHORT.test(this.io.build) ? { build: this.io.build } : {}), ...(receipt ? { receipt: receipt.receipt } : {}), ...(requestId ? { requestId } : {}) };
    if (this.queue.length >= MAX_QUEUE) {
      const expendable = this.queue.findIndex((v) => v.report.event === 'heartbeat');
      this.queue.splice(expendable >= 0 ? expendable : 0, 1);
    }
    this.queue.push({ report, generation: this.generation, attempt: 0 });
    void this.drain();
  }
  private async drain() {
    if (this.sending || this.disposed) return;
    const next = this.queue.shift();
    if (!next) return;
    const current = { controller: new AbortController(), generation: next.generation };
    this.sending = current;
    let timer: unknown, transientFailure = false;
    try {
      const timeout = new Promise<never>((_, reject) => { timer = this.io.setTimeout(() => { current.controller.abort(); reject(new Error('telemetry timeout')); }, SEND_TIMEOUT_MS); });
      await Promise.race([timeout, (async () => {
        // Credentials are acquired at send time and never retained in the queue.
        const headers = await this.io.headers();
        if (current.controller.signal.aborted || this.disposed || next.generation !== this.generation) return;
        const result = await this.io.send(next.report, headers, current.controller.signal);
        const status = result && typeof result === 'object' && 'status' in result ? Number(result.status) : 204;
        // Date is a server clock even on a rejected lifecycle report. Calibrate all JS emitters,
        // then reopen a fresh lifecycle epoch after a clock rejection; heartbeat cannot open presence.
        const reply = result as { headers?: { get?: (key: string) => string | null } } | null;
        const serverMs = Date.parse(reply?.headers?.get?.('Date') ?? '');
        const wallMs = Date.parse(this.io.now?.() ?? new Date().toISOString());
        if (Number.isFinite(serverMs) && Number.isFinite(wallMs)) {
          const offset = serverMs - wallMs, correction = offset - this.serverOffsetMs;
          this.serverOffsetMs = offset;
          if (status === 400 && Math.abs(correction) > 30_000 && next.generation === this.generation && !this.disposed) {
            this.lastCapturedMs = 0;
            this.queue = this.queue.filter((item) => !['foreground','heartbeat','background'].includes(item.report.event));
            this.sessionId = this.io.uuid(); this.sequence = 0; this.active = false; this.reconcile();
          }
        }
        transientFailure = status === 408 || status === 429 || status >= 500;
      })()]);
    } catch { transientFailure = true; }
    finally {
      if (timer !== undefined) this.io.clearTimeout(timer);
      if (this.sending === current) {
        // One retry only, with the original ID, timestamp and sequence. No credentials are replayed.
        if (transientFailure && next.attempt === 0 && next.generation === this.generation && !this.disposed) {
          if (this.queue.length >= MAX_QUEUE) this.queue.pop();
          this.queue.unshift({ ...next, attempt: 1 });
        }
        this.sending = null; void this.drain();
      }
    }
  }
}

/** A post-commit, unobscured frame. DOM/transition observers resume checks after a long-lived modal. */
export function afterVisibleFrame(element: () => Element | null, emit: () => void, current: () => boolean = () => true, available: () => boolean = () => true) {
  let cancelled = false, frame = 0, attempts = 0;
  const observer = typeof MutationObserver === 'undefined' ? null : new MutationObserver(() => resume());
  const cleanup = () => { cancelled = true; window.cancelAnimationFrame(frame); observer?.disconnect(); document.removeEventListener('visibilitychange', resume); document.removeEventListener('transitionend', resume, true); document.removeEventListener('animationend', resume, true); window.removeEventListener('scroll', resume, true); window.removeEventListener('resize', resume); };
  const resume = () => { if (cancelled) return; if (!current()) { cleanup(); return; } attempts = 0; window.cancelAnimationFrame(frame); frame = window.requestAnimationFrame(check); };
  const check = () => {
    if (cancelled) return;
    if (!current()) { cleanup(); return; }
    const node = element();
    if (document.visibilityState !== 'visible') return;
    if (!available()) { if (++attempts < 120) frame = window.requestAnimationFrame(check); return; }
    if (!node?.isConnected) { if (++attempts < 120) frame = window.requestAnimationFrame(check); return; }
    const rect = node.getBoundingClientRect(), style = window.getComputedStyle(node);
    let parent: Element | null = node, ancestorsVisible = true;
    while (parent) { const css = window.getComputedStyle(parent); if (css.visibility === 'hidden' || css.display === 'none' || Number(css.opacity) === 0) { ancestorsVisible = false; break; } parent = parent.parentElement; }
    const inViewport = rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth;
    const x = (Math.max(0, rect.left) + Math.min(window.innerWidth, rect.right)) / 2;
    const y = (Math.max(0, rect.top) + Math.min(window.innerHeight, rect.bottom)) / 2;
    let front: Element | null = null;
    if (inViewport) {
      // Static Núcleo paints non-interactive text above its canvas. Probe its paint position without
      // changing any frame's appearance or leaving the text interactive; covering sheets still win.
      const inline = (node as HTMLElement).style;
      const probe = style.pointerEvents === 'none' && inline;
      const value = probe ? inline.getPropertyValue('pointer-events') : '', priority = probe ? inline.getPropertyPriority('pointer-events') : '';
      try { if (probe) inline.setProperty('pointer-events', 'auto', 'important'); front = document.elementFromPoint(x, y); }
      finally { if (probe) { if (value) inline.setProperty('pointer-events', value, priority); else inline.removeProperty('pointer-events'); observer?.takeRecords(); } }
    }
    const unobscured = !!front && (front === node || node.contains(front));
    if (inViewport && unobscured && ancestorsVisible && style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0) { cleanup(); emit(); return; }
    if (++attempts < 120) frame = window.requestAnimationFrame(check);
  };
  document.addEventListener('visibilitychange', resume); document.addEventListener('transitionend', resume, true); document.addEventListener('animationend', resume, true); window.addEventListener('scroll', resume, true); window.addEventListener('resize', resume);
  if (document.documentElement) observer?.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'aria-hidden'] });
  frame = window.requestAnimationFrame(check);
  return cleanup;
}
