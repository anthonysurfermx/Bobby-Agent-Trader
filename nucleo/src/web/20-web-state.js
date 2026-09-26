/* Núcleo WEB transport, part 2: per-browser state (nucleo/README.md).
 *
 * What native keeps in UserDefaults lives here in localStorage, under nucleo.* keys:
 *   nucleo.profile       companion, onboarded, accepted risk-notice version, muted, voice
 *   nucleo.progress      discipline XP, streak, the daily award cap, the pending award queue
 *   nucleo.theses.local  the thesis ledger (R12), 20 newest — the same key name native uses signed out
 *   nucleo.hints         hint counters (markHint)
 *   nucleo.deskMemory    the implicit watchlist behind the quick-access chips (DeskMemory.swift)
 * and in sessionStorage (this tab only):
 *   nucleo.reads         the last 5 ok reads, so a reload can restore an unsaved read (session.pendingRead)
 *
 * The award rules are CompanionStore.awardDisciplineEvent (Companion.swift), the same rules
 * src/lib/companions/progress.ts ports for the web desk: 20 XP for a Wait, 10 for a Review,
 * at most 3 awards a day, a streak with one grace day. XP exists only on Save (R4).
 */
(function () {
  'use strict';
  var NW = window.__nucleoWeb;
  if (!NW) return;
  var CFG = NW.cfg;
  var K = { profile: 'nucleo.profile', progress: 'nucleo.progress', theses: 'nucleo.theses.local', hints: 'nucleo.hints', desk: 'nucleo.deskMemory', reads: 'nucleo.reads' };
  var RISK_VERSION = CFG.riskNotice.version;
  var MAX_DAILY_AWARDS = 3, LEDGER_LIMIT = 20, READS_KEPT = 5, PENDING_READ_MS = 30 * 60 * 1000, WATCH_LIMIT = 12, PENDING_LIMIT = 50;
  var S = NW.state = { RISK_VERSION: RISK_VERSION, LEDGER_LIMIT: LEDGER_LIMIT };

  function int(v, min) { return typeof v === 'number' && isFinite(v) ? Math.max(min == null ? -Infinity : min, Math.floor(v)) : 0; }
  function dayKey(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function daysBetween(a, b) {
    var x = a.split('-').map(Number), y = b.split('-').map(Number);
    return Math.round((Date.UTC(y[0], y[1] - 1, y[2]) - Date.UTC(x[0], x[1] - 1, x[2])) / 86400000);
  }
  var DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

  /* ---- profile ---- */
  S.profile = function () {
    var p = NW.lsGet(K.profile, null);
    p = NW.isObj(p) ? p : {};
    return {
      companionId: typeof p.companionId === 'string' && S.companion(p.companionId) ? p.companionId : null,
      onboarded: p.onboarded === true,
      riskVersion: int(p.riskVersion, 0),
      muted: p.muted === true,
      voiceId: typeof p.voiceId === 'string' ? p.voiceId : null
    };
  };
  S.saveProfile = function (p) { NW.lsSet(K.profile, p); };
  S.riskAccepted = function () { return S.profile().riskVersion >= RISK_VERSION; };
  /** Onboarded means the flag AND a chosen companion (§2.3 Session). */
  S.onboarded = function () { var p = S.profile(); return p.onboarded && !!p.companionId; };

  /* ---- companions, levels, gear (catalog from build.py --web) ---- */
  S.companion = function (id) {
    for (var i = 0; i < CFG.companions.length; i++) if (CFG.companions[i].id === id) return CFG.companions[i];
    return null;
  };
  S.levelFor = function (xp) {
    var L = CFG.levels, cur = L[0];
    for (var i = 0; i < L.length; i++) if (xp >= L[i].minXP) cur = L[i];
    return cur;
  };
  S.nextLevel = function (xp) {
    for (var i = 0; i < CFG.levels.length; i++) if (CFG.levels[i].minXP > xp) return CFG.levels[i];
    return null;
  };
  S.levelJSON = function (xp) {
    var cur = S.levelFor(xp), next = S.nextLevel(xp);
    var progress = next ? (xp - cur.minXP) / (next.minXP - cur.minXP) : 1;
    return { number: cur.number, name: cur[NW.lang] || cur.en, progress: NW.clamp(progress, 0, 1), nextMinXP: next ? next.minXP : null };
  };
  S.isUnlocked = function (c, xp) { return S.levelFor(xp).number >= c.requiredLevel; };

  /* ---- progress + awards ---- */
  S.progress = function () {
    var p = NW.lsGet(K.progress, null);
    p = NW.isObj(p) ? p : {};
    return {
      xp: int(p.xp, 0), streak: int(p.streak, 0),
      lastDay: typeof p.lastDay === 'string' && DAY_RE.test(p.lastDay) ? p.lastDay : null,
      dailyAwards: int(p.dailyAwards, 0),
      dailyAwardsDay: typeof p.dailyAwardsDay === 'string' && DAY_RE.test(p.dailyAwardsDay) ? p.dailyAwardsDay : null,
      pendingAwards: Array.isArray(p.pendingAwards) ? p.pendingAwards.slice(-PENDING_LIMIT) : []
    };
  };
  /**
   * CompanionStore.awardDisciplineEvent: returns what was ACTUALLY awarded (0 at the daily
   * cap), the queued event id (null when capped), the level crossed and the gear dropped.
   */
  S.award = function (points, kind, thesis, now) {
    now = now || new Date();
    var st = S.progress(), prof = S.profile(), today = dayKey(now);
    var daily;
    if (st.dailyAwardsDay === today) {
      if (st.dailyAwards >= MAX_DAILY_AWARDS) return { points: 0, eventID: null, evolution: null, drops: [] };
      daily = st.dailyAwards + 1;
    } else daily = 1;
    var xpBefore = st.xp, xp = xpBefore + points;
    var levelBefore = S.levelFor(xpBefore).number, levelAfter = S.levelFor(xp);
    var drops = [];
    if (prof.companionId) {
      (CFG.tools[prof.companionId] || []).forEach(function (tool) {
        if (xpBefore < tool.unlockXP && xp >= tool.unlockXP) {
          drops.push({ id: prof.companionId + '-' + tool.tier, name: tool.name[NW.lang] || tool.name.en, tier: tool.tier });
        }
      });
    }
    var streak = st.streak;
    if (st.lastDay) {
      if (st.lastDay !== today) {
        var gap = daysBetween(st.lastDay, today);
        if (gap === 1) streak += 1;          // consecutive day
        else if (gap === 2) { /* grace day: hold, don't grow */ }
        else streak = 1;                     // broken
      }
    } else streak = 1;
    var eventID = NW.uuid();
    var pending = st.pendingAwards.concat([{ id: eventID, kind: kind, at: now.toISOString().replace(/\.\d{3}Z$/, 'Z'), tzOffsetMin: now.getTimezoneOffset(), thesis: thesis || null }]).slice(-PENDING_LIMIT);
    NW.lsSet(K.progress, { xp: xp, streak: streak, lastDay: today, dailyAwards: daily, dailyAwardsDay: today, pendingAwards: pending });
    return {
      points: points, eventID: eventID, drops: drops,
      evolution: levelAfter.number > levelBefore ? { number: levelAfter.number, name: levelAfter[NW.lang] || levelAfter.en } : null
    };
  };

  /* ---- ledger (R12): newest first, a re-save of the same read replaces it ---- */
  S.theses = function () {
    var list = NW.lsGet(K.theses, []);
    return Array.isArray(list) ? list.filter(NW.isObj).slice(0, LEDGER_LIMIT) : [];
  };
  S.appendThesis = function (entry) {
    var list = S.theses().filter(function (x) { return x.id !== entry.id; });
    list.unshift(entry);
    NW.lsSet(K.theses, list.slice(0, LEDGER_LIMIT));
  };

  /* ---- hints ---- */
  S.hints = function () {
    var h = NW.lsGet(K.hints, {});
    var out = {};
    if (NW.isObj(h)) Object.keys(h).forEach(function (k) { if (typeof h[k] === 'number' && isFinite(h[k])) out[k] = Math.floor(h[k]); });
    return out;
  };
  S.markHint = function (key) {
    var h = S.hints();
    h[key] = (h[key] || 0) + 1;
    NW.lsSet(K.hints, h);
    return h[key];
  };

  /* ---- desk memory (DeskMemory.swift): most recent asks first, padded with the defaults ---- */
  S.recordQuery = function (symbol, isEquity) {
    var ticker = String(symbol).toUpperCase(), list = NW.lsGet(K.desk, []);
    list = Array.isArray(list) ? list.filter(function (x) { return NW.isObj(x) && typeof x.symbol === 'string'; }) : [];
    var now = Date.now(), hit = null;
    for (var i = 0; i < list.length; i++) if (list[i].symbol === ticker) hit = list[i];
    if (hit) { hit.lastAskedAt = now; hit.count = (hit.count | 0) + 1; }
    else list.push({ symbol: ticker, isEquity: !!isEquity, lastAskedAt: now, count: 1 });
    list.sort(function (a, b) { return (b.lastAskedAt || 0) - (a.lastAskedAt || 0); });
    NW.lsSet(K.desk, list.slice(0, WATCH_LIMIT));
  };
  S.quickAccess = function (limit) {
    limit = limit || 5;
    var list = NW.lsGet(K.desk, []);
    var row = (Array.isArray(list) ? list : []).filter(function (x) { return NW.isObj(x) && typeof x.symbol === 'string'; })
      .slice(0, limit).map(function (x) { return x.symbol; });
    (CFG.quickAccess || []).forEach(function (t) { if (row.indexOf(t) < 0 && row.length < limit) row.push(t); });
    return row;
  };

  /* ---- reads: the last 5 ok reads of this tab (native keeps them in memory; a reload here must not lose one) ---- */
  var reads = (function () { var r = NW.ssGet(K.reads, []); return Array.isArray(r) ? r.filter(function (x) { return NW.isObj(x) && typeof x.requestId === 'string'; }) : []; })();
  function persistReads() {
    if (NW.ssSet(K.reads, reads)) return;
    // Over quota: keep the newest read only.
    NW.ssSet(K.reads, reads.slice(-1));
  }
  S.addRead = function (read) {
    reads.push(read);
    if (reads.length > READS_KEPT) reads.splice(0, reads.length - READS_KEPT);
    persistReads();
  };
  S.findRead = function (requestId) {
    for (var i = 0; i < reads.length; i++) if (reads[i].requestId === requestId) return reads[i];
    return null;
  };
  S.markSaved = function (read, saved) { read.saved = saved; persistReads(); };
  /** The latest ok read not saved yet and under 30 min old (§2.3 Session.pendingRead). */
  S.pendingRead = function () {
    for (var i = reads.length - 1; i >= 0; i--) {
      var r = reads[i];
      if (!r.saved && Date.now() - r.storedAt < PENDING_READ_MS) return r.result;
    }
    return null;
  };
  S.pendingSeeds = function () { return S.progress().pendingAwards.length; };
})();
