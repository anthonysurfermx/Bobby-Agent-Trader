// ============================================================
// Companion progress — the same rules as the iOS CompanionStore, kept in
// localStorage so the web desk behaves exactly like the phone: discipline XP
// (20 for respecting NO TRADE, 10 for a full read), a cap of three awards a
// day so grinding is pointless, a streak with one grace day, evolution when
// a level is crossed, and gear that drops at 1 / 100 / 200 XP.
// Never XP for volume, frequency or P&L.
// ============================================================
import { useSyncExternalStore } from 'react';
import { type CompanionLevel, type CompanionTool, levelFor, newlyUnlockedTools, nextLevelFor } from './data';

export const RISK_NOTICE_VERSION = 1;
const KEY = 'bobby.companion.progress.v1';
const MAX_DAILY_AWARDS = 3;

/** Mirror of api/_lib/progress-rules.ts — the server is the authority. */
export const AWARD_POINTS = { read_complete: 10, no_trade_respected: 20 } as const;
export type AwardKind = keyof typeof AWARD_POINTS;

/** Desk verdict carried by the queued read and saved by /api/progress. */
export interface ThesisSnapshot { symbol: string; isEquity: boolean; direction: 'long' | 'short' | 'none'; price: number | null; entry: number | null; stop: number | null; target: number | null }

/** An award the server has not acknowledged yet (offline / not signed in). */
export interface PendingEvent { id: string; kind: AwardKind; at: string; tzOffsetMin: number; thesis?: ThesisSnapshot; thesisReadId?: string }

/** What /api/progress returns; applied on top of local state. */
export interface ServerProgress {
  companionId: string | null;
  vibeId: string;
  onboarded: boolean;
  riskNoticeVersion: number;
  xp: number;
  streak: number;
  lastDay: string | null;
  dailyAwards: number;
  dailyAwardsDay: string | null;
  quickAccess: string[];
  aura?: number;
  routeIndex?: number;
}

export interface Progress {
  companionId: string | null;
  vibeId: string;
  onboarded: boolean;
  riskNoticeVersion: number;
  xp: number;
  streak: number;
  /** YYYY-MM-DD of the last day discipline was awarded. */
  lastDay: string | null;
  dailyAwards: number;
  dailyAwardsDay: string | null;
  quickAccess: string[];
  /** Trader Land soft currency and Discovery Route position — server-owned, mirrored here. */
  aura: number;
  routeIndex: number;
  pendingEvents: PendingEvent[];
  /** ISO time of the last successful server reconcile; null = local only. */
  syncedAt: string | null;
}

const DEFAULT: Progress = {
  companionId: null,
  vibeId: 'directo',
  onboarded: false,
  riskNoticeVersion: 0,
  xp: 0,
  streak: 0,
  lastDay: null,
  dailyAwards: 0,
  dailyAwardsDay: null,
  quickAccess: ['BTC', 'NVDA', 'ETH'],
  aura: 0,
  routeIndex: 0,
  pendingEvents: [],
  syncedAt: null,
};

let state: Progress = load();
const listeners = new Set<() => void>();

function load(): Progress {
  try {
    // Visual QA harness: /desk?skinQa=byte opens the complete loadout without
    // touching saved progress. Vite removes this branch from production.
    if (import.meta.env.DEV) {
      const companionId = new URLSearchParams(window.location.search).get('skinQa');
      if (companionId) return { ...DEFAULT, companionId, onboarded: true, riskNoticeVersion: RISK_NOTICE_VERSION, xp: 500 };
    }
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT };
    return { ...DEFAULT, ...(JSON.parse(raw) as Partial<Progress>) };
  } catch {
    return { ...DEFAULT };
  }
}

function commit(next: Progress) {
  state = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private mode */ }
  listeners.forEach((l) => l());
}

function dayKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

export interface AwardResult {
  awarded: number;
  evolvedTo: CompanionLevel | null;
  drops: CompanionTool[];
}

export const progressStore = {
  get: () => state,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  acceptRiskNotice() { commit({ ...state, riskNoticeVersion: RISK_NOTICE_VERSION }); },
  setCompanion(companionId: string) { commit({ ...state, companionId }); },
  setVibe(vibeId: string) { commit({ ...state, vibeId }); },
  finishOnboarding() { commit({ ...state, onboarded: true }); },
  setQuickAccess(quickAccess: string[]) { commit({ ...state, quickAccess }); },
  /** Dev/reset: back to a fresh install. */
  reset() { commit({ ...DEFAULT }); },

  /**
   * Server state wins on the counters (xp, streak, cap); the device keeps its
   * choices when the server has none yet. Pending events are cleared by the
   * caller once the server acknowledged them.
   */
  applyServer(server: ServerProgress, acknowledged: string[] = []) {
    const ack = new Set(acknowledged);
    commit({
      ...state,
      companionId: server.companionId ?? state.companionId,
      vibeId: server.vibeId || state.vibeId,
      onboarded: state.onboarded || server.onboarded,
      riskNoticeVersion: Math.max(state.riskNoticeVersion, server.riskNoticeVersion),
      xp: server.xp,
      streak: server.streak,
      lastDay: server.lastDay,
      dailyAwards: server.dailyAwards,
      dailyAwardsDay: server.dailyAwardsDay,
      quickAccess: state.quickAccess.length ? state.quickAccess : server.quickAccess,
      aura: server.aura ?? state.aura,
      routeIndex: server.routeIndex ?? state.routeIndex,
      pendingEvents: state.pendingEvents.filter((e) => !ack.has(e.id)),
      syncedAt: new Date().toISOString(),
    });
  },

  /** Returns what was ACTUALLY awarded; preserves the thesis for offline sync. */
  awardDiscipline(kind: AwardKind, now = new Date(), thesis?: ThesisSnapshot, thesisReadId?: string): AwardResult {
    const points = AWARD_POINTS[kind];
    const today = dayKey(now);
    let dailyAwards = state.dailyAwardsDay === today ? state.dailyAwards : 0;
    if (dailyAwards >= MAX_DAILY_AWARDS) return { awarded: 0, evolvedTo: null, drops: [] };
    dailyAwards += 1;

    const xpBefore = state.xp;
    const xp = xpBefore + points;
    const levelBefore = levelFor(xpBefore).number;
    const level = levelFor(xp);
    const evolvedTo = level.number > levelBefore ? level : null;
    const drops = state.companionId ? newlyUnlockedTools(state.companionId, xpBefore, xp) : [];

    let streak = state.streak;
    if (state.lastDay) {
      const gap = daysBetween(state.lastDay, today);
      if (gap === 1) streak += 1;          // consecutive day
      else if (gap === 2) { /* grace day — hold */ }
      else if (gap > 2) streak = 1;        // broken
    } else {
      streak = 1;
    }

    // Queue for the server: it re-applies the same rules and is the authority.
    const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const pendingEvents = [...state.pendingEvents, { id, kind, at: now.toISOString(), tzOffsetMin: now.getTimezoneOffset(), ...(thesis ? { thesis: { ...thesis } } : {}), ...(thesisReadId ? { thesisReadId } : {}) }].slice(-50);
    commit({ ...state, xp, streak, lastDay: today, dailyAwards, dailyAwardsDay: today, pendingEvents });
    return { awarded: points, evolvedTo, drops };
  },
};

export function useProgress(): Progress {
  return useSyncExternalStore(progressStore.subscribe, progressStore.get, progressStore.get);
}

export function levelProgress(xp: number): number {
  const next = nextLevelFor(xp);
  if (!next) return 1;
  const base = levelFor(xp).minXP;
  return (xp - base) / (next.minXP - base);
}
