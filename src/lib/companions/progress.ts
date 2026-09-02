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
};

let state: Progress = load();
const listeners = new Set<() => void>();

function load(): Progress {
  try {
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

  /** Returns what was ACTUALLY awarded (0 when the daily cap said no). */
  awardDiscipline(points: number, now = new Date()): AwardResult {
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

    commit({ ...state, xp, streak, lastDay: today, dailyAwards, dailyAwardsDay: today });
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
