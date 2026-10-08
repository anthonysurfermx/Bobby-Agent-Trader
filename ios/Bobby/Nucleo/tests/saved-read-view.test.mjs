// Stored explanation and the actual native-event handler. No network, model request or new read receipt.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = path => fs.readFileSync(new URL(process.env.NUCLEO_SOURCE_ROOT === 'web' && path.startsWith('../src/')
  ? path.replace('../src/', '../../../../nucleo/src/') : path, import.meta.url), 'utf8');
const modelContext = vm.createContext({});
vm.runInContext(read('../src/shared/20-read-model.js'), modelContext);
const RM = modelContext.NucleoReadModel;
const clean = value => JSON.parse(JSON.stringify(value));
const thesis = {
  id: '8ebde935-4733-4ab2-a8b1-95c4af35de27', symbol: 'MU', name: 'Micron', isEquity: true,
  verdict: 'wait', direction: 'none', price: 150, support: 140, resistance: 160,
  entry: null, stop: null, target: null, asOf: '2026-10-07T16:00:00Z', provider: 'Yahoo Finance',
  savedAt: '2026-10-08T10:00:00Z', horizonHours: null, points: 20, synced: false,
};
const explanation = {
  synthesis: { headline: 'Original summary', why: 'Original reason', risk: 'Original risk', watch: 'Original watch point' },
  agents: { alpha: 'Original Alpha', red: 'Original Red', cio: 'Original CIO', rebuttal: 'Original second round',
    scenarios: { confirm: 'Original confirmation', invalidate: 'Original invalidation' } },
};

for (const language of ['en', 'es', 'fr', 'pt', 'it', 'de']) {
  test(language + ': saved debate preserves its original text, date and provider with localized roles', () => {
    const stored = { ...thesis, ...explanation }, before = JSON.stringify(stored);
    const view = RM.thesisView(stored, language, { signedIn: true });
    assert.equal(JSON.stringify(stored), before, 'view does not rewrite the persisted explanation');
    assert.equal(view.asOf, thesis.asOf); assert.equal(view.source.asOf, thesis.asOf); assert.equal(view.source.provider, thesis.provider);
    assert.ok(view.meta.includes(thesis.asOf)); assert.ok(view.meta.includes(thesis.provider));
    assert.ok(!view.meta.includes(thesis.savedAt), 'save time never replaces original market time');
    assert.equal(view.debate.header, RM.t(language, 'debate.header')); assert.equal(view.debate.title, 'MU');
    for (const key of ['debate.header', 'meta', 'role.syn', 'role.alpha', 'role.red', 'role.cio', 'syn.name', 'syn.why',
      'syn.risk', 'syn.watch', 'agent.rebuttal', 'agent.scenarios', 'sc.confirm', 'sc.invalidate']) {
      assert.notEqual(RM.t(language, key), key, language + ': stored explanation label must be translated: ' + key);
    }
    assert.deepEqual(clean(view.debate.entries.map(e => e.id)), ['syn', 'alpha', 'red', 'rebuttal', 'cio', 'scenarios']);
    for (const role of ['alpha', 'red', 'cio']) {
      const entry = view.debate.entries.find(e => e.id === role);
      assert.equal(entry.text, explanation.agents[role]); assert.equal(entry.role, RM.t(language, 'role.' + role));
    }
    assert.equal(view.debate.entries[0].text, explanation.synthesis.headline);
    assert.equal(view.debate.entries[0].name, RM.t(language, 'syn.name'));
    assert.equal(view.debate.entries[0].role, RM.t(language, 'role.syn'));
    assert.deepEqual(clean(view.debate.entries[0].lines.map(l => l.label)), ['why', 'risk', 'watch'].map(k => RM.t(language, 'syn.' + k)));
    assert.deepEqual(clean(view.debate.entries[0].lines.map(l => l.text)), ['Original reason', 'Original risk', 'Original watch point']);
    assert.equal(view.debate.entries.find(e => e.id === 'rebuttal').name, RM.t(language, 'agent.rebuttal'));
    const scenarios = view.debate.entries.find(e => e.id === 'scenarios');
    assert.equal(scenarios.name, RM.t(language, 'agent.scenarios'));
    assert.deepEqual(clean(scenarios.lines.map(l => l.label)), ['confirm', 'invalidate'].map(k => RM.t(language, 'sc.' + k)));
    assert.deepEqual(clean(scenarios.lines.map(l => l.text)), ['Original confirmation', 'Original invalidation']);
    assert.equal(view.points, 20); assert.equal(view.verdict.color, '#F6B94E');
  });
}

test('legacy rows without an explanation keep their recorded thesis and expose no invented debate', () => {
  const view = RM.thesisView(thesis, 'en');
  assert.equal(view.debate, null);
  assert.deepEqual(clean(view.rows.map(r => r.id)), ['price', 'support', 'resistance']);
  assert.equal(view.price, '$150.00'); assert.equal(view.asOf, thesis.asOf);
});

test('only present string explanation fields are rendered; legacy nested synthesis remains usable', () => {
  const view = RM.thesisView({ ...thesis, synthesis: { headline: 5 }, agents: {
    alpha: {}, red: '  ', cio: 'Stored CIO only', rebuttal: null,
    scenarios: { confirm: 'Stored confirmation', invalidate: null },
    synthesis: { headline: 'Stored nested summary', why: 'Stored nested reason', risk: [], watch: null },
  } }, 'es');
  assert.deepEqual(clean(view.debate.entries.map(e => e.id)), ['syn', 'cio']);
  assert.equal(view.debate.entries[0].text, 'Stored nested summary');
  assert.equal(view.debate.entries[1].text, 'Stored CIO only');
  assert.deepEqual(clean(view.debate.entries[0].lines.map(l => l.text)), ['Stored nested reason']);
});

test('missing source and evidence are not invented from save time, prices or extra fields', () => {
  const view = RM.thesisView({ ...thesis, ...explanation, asOf: null, provider: [],
    sufficiency: { sufficient: false, missing: ['not stored'] }, evidenceUsed: { timeframes: ['invented'] } }, 'en');
  assert.deepEqual(clean(view.source), { asOf: null, provider: null }); assert.equal(view.asOf, null);
  assert.equal(view.meta, RM.t('en', 'meta'));
  assert.ok(!view.debate.entries.some(e => e.id === 'missing' || e.id === 'evidence'));
  const empty = RM.thesisView({ ...thesis, synthesis: { headline: ' ' }, agents: { alpha: null, red: 2, cio: {} } }, 'en');
  assert.equal(empty.debate, null);
});

const boot = read('../src/app/99-boot.js');
function handlerSource(name) {
  const start = boot.indexOf('function ' + name + '('), open = boot.indexOf('{', start);
  assert.ok(start >= 0); let depth = 1, end = open + 1;
  for (; depth && end < boot.length; end++) { if (boot[end] === '{') depth++; if (boot[end] === '}') depth--; }
  return boot.slice(start, end);
}
function eventHarness(state = 'IDLE') {
  const events = new Map(), transitions = [], cleared = [], calls = [];
  const context = vm.createContext({
    ST: { name: state }, SHEET: false, SES: { riskAccepted: true }, READ: { requestId: 'old-read' },
    VOICE: { id: 'old-read', started: true, ended: false, silent: false }, K: { on: true },
    BR: { on: (name, handler) => events.set(name, handler) },
    clearRead() { cleared.push(clean({ voice: context.VOICE, clock: context.K })); },
    go(name, data) { transitions.push({ name, data }); context.ST = { name }; },
    bcall(method) { calls.push(method); return Promise.resolve({}); },
    accountChanged() {}, consentWithdrawn() {}, onStage() {}, lvlApply() {}, noop() {},
  });
  vm.runInContext(handlerSource('savedReadOpen') + '\n' + handlerSource('wire'), context); context.wire();
  return { context, events, transitions, cleared, calls, emit: payload => events.get('savedRead.open')(payload) };
}

test('native savedRead.open safely opens the current-owner stored card with no ask, XP or presentation receipt', () => {
  for (const state of ['IDLE', 'FACES', 'THESIS_VIEW']) {
    const h = eventHarness(state); assert.equal(h.emit({ thesis }), true);
    assert.equal(h.context.READ, null); assert.equal(h.context.VOICE.id, null); assert.equal(h.context.K.on, false);
    assert.deepEqual(clean(h.transitions), [{ name: 'THESIS_VIEW', data: { thesis, back: 'IDLE' } }]);
    assert.equal(h.cleared.length, 1); assert.equal(h.cleared[0].voice.id, null, 'invalidate queued callbacks before clearing visuals');
    assert.deepEqual(h.calls, []);
  }
});

test('native saved-read event never interrupts an unsaved result, request, text entry, consent gate or sheet', () => {
  for (const state of ['BOOT', 'WAKE', 'RETURNING', 'THINK_WAIT', 'THINK_RESOLVE', 'TALK_EVIDENCE', 'TALK_CHART', 'VERDICT',
    'HANDBACK', 'CARDS', 'SAVING', 'FOLLOWUPS', 'TYPING', 'LISTENING', 'SIGNIN_GATE', 'RISK_GATE', 'PRO_GATE']) {
    const h = eventHarness(state), original = h.context.READ;
    assert.equal(h.emit({ thesis }), false, state); assert.equal(h.context.READ, original);
    assert.equal(h.context.VOICE.id, 'old-read'); assert.deepEqual(h.transitions, []); assert.deepEqual(h.calls, []);
  }
  for (const option of ['sheet', 'consent']) {
    const h = eventHarness(); if (option === 'sheet') h.context.SHEET = true; else h.context.SES.riskAccepted = false;
    assert.equal(h.emit({ thesis }), false); assert.deepEqual(h.cleared, []);
  }
});

test('malformed saved card events have no effect', () => {
  for (const payload of [null, {}, { thesis: [] }, { thesis: { ...thesis, id: '' } }, { thesis: { ...thesis, id: 'not-a-read' } },
    { thesis: { ...thesis, symbol: '<script>' } }, { thesis: { ...thesis, symbol: null } }, { thesis: { ...thesis, verdict: 'buy' } }]) {
    const h = eventHarness(); assert.equal(h.emit(payload), false); assert.deepEqual(h.transitions, []); assert.deepEqual(h.cleared, []);
  }
});
