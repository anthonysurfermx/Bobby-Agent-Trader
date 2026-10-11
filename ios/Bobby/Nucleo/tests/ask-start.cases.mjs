// Cases both phones run, each against its own copy of the page: a read native starts (`ask.start`), state by state
// (ARCHITECTURE.md §9.5, the table), and what the page draws under a native sheet.
// ios/Bobby/Nucleo/tests/bridge-boot.test.mjs and android/nucleo/tests/bridge-android.test.mjs hand in their own
// harness (the shipping engine of their tree, over their transport) and call askStartCases(kit).
//
// kit: { test, assert, flush, Element, idle(options), handBack(app, reply), personRead(app, reply), tap(app, node),
//        chipsOf(app), rowOf(app), asksOf(app), okRead(extra), synthesis(followUp), source(file), architecture }
// idle() options: the harness's own, plus `seed(session)` (run before the page boots), `from` (the state the page
// is expected in after its boot, 'IDLE' when not given), `theses` (what native
// answers to `theses`), `saved` (what it answers to `saveThesis`) and `speak` (the status it answers to `speak`:
// 'muted' plays a read silently on the page's own clock, 'queued' is a voice native took and has not started).

const QUESTION = 'How does NVDA look today?';
const NEXT = 'What would have to change in NVDA for this read to change?';
const SECOND = '22222222-2222-4222-8222-222222222222';
// The row of a read Bobby started, for a reader whose own assets are NVDA, BTC and ETH: never a mover.
const BOBBYS_ROW = ['Another question about NVDA', 'How is BTC looking?', 'How is ETH looking?'];
// A thesis as native hands it over (`theses`, and inside a `saveThesis` reply).
const THESIS = { id: '11111111-1111-4111-8111-111111111111', symbol: 'NVDA', name: 'Nvidia', isEquity: true, verdict: 'review', direction: 'long',
  price: 225.07, support: 221.4, resistance: 229.8, entry: null, stop: null, target: null, asOf: '2026-10-01T15:00:00.000Z', provider: 'fixture',
  savedAt: '2026-10-01T15:01:00.000Z', horizonHours: 24, points: 10, synced: false };
const SAVED = { status: 'saved', thesis: THESIS, awardedXP: 10, capped: false, kind: 'read_complete', xp: 10, level: { number: 1, progress: 0.4 }, streak: 1,
  evolution: null, unlocks: [], planting: 'signed_out' };
// Replies that end a read without a verdict (the shapes of fixtures/ask/*.json).
const REFUSED = {
  ERROR: { v: 1, status: 'error', code: 'timeout', message: null },
  UNKNOWN_ASSET: { v: 1, status: 'unknown_asset', query: 'hello how are you', suggestions: [] },
  CONFIRM_ASSET: { v: 1, status: 'confirm', token: 'fixture-confirm-fuzzy', asset: { symbol: 'NVDA', name: 'Nvidia', isEquity: true, assetClass: 'equity' }, matchKind: 'fuzzy', proxyNote: null },
  RISK_GATE: { v: 1, status: 'error', code: 'risk_not_accepted', message: null },
  SIGNIN_GATE: { v: 1, status: 'signin_required', token: 'fixture-gate-signin_required', message: 'Create a free account to keep reading.',
    access: { tier: 'anon', used: 3, limit: 3, remaining: 0, resetsAt: null, paywall: false, bonus: 0 } },
  PRO_GATE: { v: 1, status: 'subscription_required', token: 'fixture-gate-subscription_required', message: 'You used this week’s free reads.',
    access: { tier: 'free', used: 10, limit: 10, remaining: 0, resetsAt: '2026-10-03T12:00:00.000Z', paywall: true, bonus: 0 } },
};

export function askStartCases(kit) {
  const { test, assert, flush, Element, idle, handBack, personRead, tap, chipsOf, rowOf, asksOf, okRead, synthesis } = kit;
  const state = (app) => app.context.nucleo.state();
  const emit = (app, name, payload) => app.context.nucleoBridge.emit(name, payload);
  const offer = (app, token) => emit(app, 'ask.start', { token, question: QUESTION });
  const type = app => { const b=app.nodes.get('ui').children.find(n=>n.id==='conversation-keyboard'); if(b)b._guideAction();else tap(app,app.nodes.get('pill')); };
  const stage = (app) => app.nodes.get('stage').listeners;
  const finger = (target, x, y) => ({ isPrimary: true, button: 0, pointerId: 7, clientX: x, clientY: y, target, cancelable: false });
  // The glass itself: a place of the stage that is nothing to tap.
  const glass = () => new Element();
  // A finger turns the sphere one face on and comes to rest before it lets go.
  async function turnSphere(app) {
    const surface = glass();
    stage(app).pointerdown(finger(surface, 250, 380)); stage(app).pointermove(finger(surface, 180, 380));
    app.advance(0.3); await flush();
    stage(app).pointermove(finger(surface, 180, 380)); stage(app).pointerup(finger(surface, 180, 380));
  }
  // A finger pulls the cards down over a finished read, past the commit.
  async function pullCards(app) {
    const chip = chipsOf(app)[0];
    stage(app).pointerdown(finger(chip, 200, 600)); stage(app).pointermove(finger(chip, 200, 640)); stage(app).pointermove(finger(chip, 200, 740));
    stage(app).pointerup(finger(chip, 200, 740));
    assert.equal(state(app), 'CARDS');
    app.advance(1.2); await flush();
  }
  // What a browser would paint: a node is drawn unless the page hid it, and placed once the loop gave it a transform.
  const drawn = (node) => !(node.style.visibility === 'hidden' || Number(node.style.opacity) === 0);
  const placeOf = (node) => { const at = /^translate3d\((-?[\d.]+)px,(-?[\d.]+)px/.exec(node.style.transform || ''); return at ? [Number(at[1]), Number(at[2])] : null; };
  // The person's own read (a chip of the idle home), played on the page's clock until it is in `name`.
  async function ownReadUntil(app, name, reply = okRead({ synthesis: synthesis(NEXT) })) {
    tap(app, chipsOf(app)[0]);
    await flush(); app.advance(1.2); await flush();
    app.answer(reply); await flush();
    for (let step = 0; step < 3000 && state(app) !== name; step++) { app.advance(0.05); await flush(); }
    assert.equal(state(app), name);
  }
  // The offer is taken: the page asks with the token and nothing else, and the read it starts is Bobby's to the end.
  async function taken(app, token, from) {
    const before = asksOf(app).length;
    offer(app, token);
    assert.equal(state(app), 'SENDING', from + ': the read starts in the same turn');
    assert.deepEqual(asksOf(app).slice(before), [{ token }], from + ': only the token travels');
    offer(app, token);
    assert.equal(asksOf(app).length, before + 1, from + ': the same token offered again while its read is on its way asks nothing');
    await handBack(app, okRead({ requestId: SECOND }));
    assert.deepEqual(rowOf(app), BOBBYS_ROW, from + ': what was on the glass is gone, and the row is the one of a read Bobby started');
    assert.deepEqual(app.errors, [], from);
  }
  // The offer is not taken: nothing is asked, nothing changes, nothing is kept for later.
  function refused(app, token, where) {
    const before = asksOf(app).length, was = state(app);
    offer(app, token);
    assert.equal(state(app), was, where + ': the page stays where it is');
    assert.equal(asksOf(app).length, before, where + ': nothing is asked');
  }

  test('the table of ARCHITECTURE.md §9.5 names every state of the page once, and the page does what it says', () => {
    const states = [...kit.source('app/60-fsm.js').matchAll(/^STATES\.([A-Z_]+) = /gm)].map((match) => match[1]);
    assert.ok(states.length >= 28 && new Set(states).size === states.length);
    const from = JSON.parse(kit.source('app/55-read.js').match(/var ASK_FROM = (\{[^}]+\});/)[1].replace(/([A-Z_]+):/g, '"$1":'));
    const lines = kit.architecture.slice(kit.architecture.indexOf('**`ask.start`, state by state.**')).split('\n').map((line) => line.trim());
    const first = lines.findIndex((line) => line.startsWith('|'));
    assert.ok(first > 0, 'the table is in the document');
    let end = first; while ((lines[end] || '').startsWith('|')) end++;
    const table = new Map();
    for (const row of lines.slice(first + 2, end)) {
      const cells = row.split('|').slice(1, -1).map((cell) => cell.trim());
      assert.match(cells[1], /^(yes|no)\b/, row);
      for (const name of cells[0].matchAll(/`([A-Z_]+)`/g)) {
        assert.ok(!table.has(name[1]), name[1] + ' is in the table twice');
        table.set(name[1], cells[1].startsWith('yes'));
        if (!cells[1].startsWith('yes')) assert.ok(cells[2].length > 40, name[1] + ': a no says why');
      }
    }
    assert.deepEqual([...table.keys()].sort(), states.slice().sort(), 'every state, and no state the page does not have');
    for (const name of states) assert.equal(!!from[name], table.get(name), name);
    assert.deepEqual(Object.keys(from).filter((name) => !states.includes(name)), [], 'ASK_FROM names only real states');
  });

  test('a row of a board asks Bobby over a finished read: at the hand-back, over the cards, in the row after a save', async () => {
    // HANDBACK: the read just delivered, its row showing (it stays 90 s of the page's own clock, which stands still
    // while the app is behind: "left a read on screen yesterday, came back through the notification, tapped a row").
    const read = await idle();
    await personRead(read, okRead({ synthesis: synthesis(NEXT) }));
    assert.equal(state(read), 'HANDBACK');
    assert.equal(rowOf(read)[0], NEXT);
    await taken(read, 'tok-1', 'HANDBACK');
    // CARDS: the cards pulled down over the read.
    const cards = await idle();
    await personRead(cards, okRead());
    await pullCards(cards);
    await taken(cards, 'tok-2', 'CARDS');
    // FOLLOWUPS: after a save (as before this table existed).
    const saved = await idle({ saved: SAVED });
    await personRead(saved, okRead());
    await pullCards(saved);
    tap(saved, saved.nodes.get('save'));
    assert.equal(state(saved), 'SAVING');
    // SAVING: the save just pressed is being written; its 1.8 s end in FOLLOWUPS, where the next offer is taken.
    refused(saved, 'tok-3', 'SAVING');
    saved.advance(1.9); await flush();
    assert.equal(state(saved), 'FOLLOWUPS');
    assert.deepEqual(saved.calls.filter((call) => call.method === 'saveThesis').length, 1);
    await taken(saved, 'tok-3', 'FOLLOWUPS');
  });

  test('a read restored at launch, a level notice and a page with reduced motion give way the same', async () => {
    // RESTORE: the app was closed over a read; at launch the page stands at its hand-back at once.
    const restored = await idle({ seed: (session) => { session.pendingRead = okRead({ synthesis: synthesis(NEXT) }); }, from: 'HANDBACK' });
    restored.advance(1); await flush();
    assert.equal(rowOf(restored)[0], NEXT);
    await taken(restored, 'tok-1', 'HANDBACK of a restored read');
    // A level notice is a caption and a chip, like the chips that ask which asset was meant.
    const notice = await idle();
    tap(notice, chipsOf(notice)[0]);
    await flush(); notice.advance(1.2); await flush();
    notice.answer({ v: 1, status: 'level_notice', level: 'profundo', message: 'Your Deep comes back on Monday.', token: 'fixture-level' }); await flush(); notice.advance(1); await flush();
    assert.equal(state(notice), 'CONFIRM_ASSET');
    await taken(notice, 'tok-2', 'CONFIRM_ASSET, a level notice');
    // Reduced motion: positions are set, not sprung; the states are the same.
    for (const from of ['HANDBACK', 'TYPING']) {
      const calm = await idle({ seed: (session) => { session.reducedMotion = true; } });
      if (from === 'HANDBACK') await personRead(calm, okRead()); else type(calm);
      assert.equal(state(calm), from);
      await taken(calm, 'tok-3', from + ' with reduced motion');
    }
  });

  test('a row tapped while Bobby is still giving a read closes that read and asks: its debate, its evidence, its chart, its verdict', async () => {
    const seen = [];
    for (const name of ['THINK_RESOLVE', 'TALK_EVIDENCE', 'TALK_CHART', 'VERDICT']) {
      const app = await idle();
      await ownReadUntil(app, name);
      seen.push(state(app));
      await taken(app, 'tok-' + name, name);
    }
    assert.deepEqual(seen, ['THINK_RESOLVE', 'TALK_EVIDENCE', 'TALK_CHART', 'VERDICT']);
  });

  test('a voice that was asked for and has not begun is told to stop when its read is replaced, or closed', async () => {
    const stops = (app) => app.calls.filter((call) => call.method === 'stopSpeaking').length;
    const waiting = async () => {
      const app = await idle({ speak: 'queued' });
      await ownReadUntil(app, 'THINK_RESOLVE');
      for (let step = 0; step < 600 && !app.calls.some((call) => call.method === 'speak'); step++) { app.advance(0.05); await flush(); }
      app.advance(3); await flush();
      assert.equal(state(app), 'THINK_RESOLVE', 'the read waits for its voice to begin');
      assert.equal(stops(app), 0);
      return app;
    };
    // Native is still fetching the audio of the read on the glass: a new read must not be thought over under it.
    const replaced = await waiting();
    offer(replaced, 'tok-1');
    assert.equal(state(replaced), 'SENDING');
    assert.equal(stops(replaced), 1, 'the read that leaves takes its voice with it');
    // The same when the person closes it: no voice starts over the idle home.
    const closed = await waiting();
    tap(closed, closed.nodes.get('close'));
    assert.equal(state(closed), 'RETURNING');
    assert.equal(stops(closed), 1);
    // A read that plays silently has no voice to stop.
    const silent = await idle();
    await ownReadUntil(silent, 'TALK_EVIDENCE');
    offer(silent, 'tok-2');
    assert.equal(stops(silent), 0);
    assert.deepEqual(replaced.errors.concat(closed.errors, silent.errors), []);
  });

  test('the keyboard gives way: with nothing typed it closes, and words they had typed are there the next time it opens', async () => {
    // Nothing typed, from the idle home.
    const empty = await idle();
    type(empty);
    assert.equal(state(empty), 'TYPING');
    await taken(empty, 'tok-1', 'TYPING, nothing typed');
    // Their own words, half written.
    const words = await idle();
    type(words);
    words.nodes.get('ta').value = 'What about the earnings';
    await taken(words, 'tok-2', 'TYPING, words typed');
    assert.equal(asksOf(words).some((ask) => ask.question === 'What about the earnings'), false, 'their words were not sent for them');
    tap(words, words.nodes.get('close')); words.advance(2.5); await flush();
    assert.equal(state(words), 'IDLE');
    type(words);
    assert.equal(state(words), 'TYPING');
    assert.equal(words.nodes.get('ta').value, 'What about the earnings', 'the draft is back in the box');
    // "Another question" over a finished read: the read leaves with the keyboard, and the question is not asked as
    // a follow-up of it.
    const another = await idle();
    await personRead(another, okRead());
    tap(another, chipsOf(another)[0]);
    assert.equal(state(another), 'TYPING');
    another.nodes.get('ta').value = 'and the volume';
    await taken(another, 'tok-3', 'TYPING over a read');
    assert.deepEqual(asksOf(another).map((ask) => Object.keys(ask).sort().join()), [kit.confirm ? 'chip,confirm,question' : 'chip,question', 'token']);
    assert.deepEqual(empty.errors.concat(words.errors, another.errors), []);
  });

  test('another face of the sphere, a saved thesis and the microphone card give way too', async () => {
    // FACES: the sphere turned to the Squad face. Nothing brings it home by itself.
    const faces = await idle();
    await turnSphere(faces);
    assert.equal(state(faces), 'FACES');
    faces.advance(2.5); await flush();
    assert.equal(state(faces), 'FACES', 'it stays on the face it was turned to');
    assert.ok(Number(faces.nodes.get('belt').style.opacity) > 0.5, 'the Squad belt is showing');
    await taken(faces, 'tok-1', 'FACES');
    assert.equal(Number(faces.nodes.get('belt').style.opacity), 0, 'the face left with the turn');
    // THESIS_VIEW opened from the Theses face.
    const fromFace = await idle({ theses: { v: 1, items: [THESIS] } });
    assert.deepEqual(JSON.parse(JSON.stringify(fromFace.context.nucleo.faces())), ['desk', 'squad', 'theses']);
    await turnSphere(fromFace);
    fromFace.advance(2.5); await flush();
    tap(fromFace, new Element({ 'data-hit': 'satT0' }));
    assert.equal(state(fromFace), 'THESIS_VIEW');
    fromFace.advance(1); await flush();
    await taken(fromFace, 'tok-2', 'THESIS_VIEW from a face');
    // THESIS_VIEW opened from the idle home (the thesis saved in this session).
    const home = await idle({ saved: SAVED });
    await personRead(home, okRead());
    await pullCards(home);
    tap(home, home.nodes.get('save')); await flush(); home.advance(2); await flush();
    tap(home, home.nodes.get('close')); home.advance(3); await flush();
    assert.equal(state(home), 'IDLE');
    tap(home, home.nodes.get('satG'));
    assert.equal(state(home), 'THESIS_VIEW');
    home.advance(1); await flush();
    await taken(home, 'tok-3', 'THESIS_VIEW from the home');
    // PRE_PERMISSION: the card a first hold of the pill brings up.
    const card = await idle();
    stage(card).pointerdown(finger(card.nodes.get('pill'), 220, 880));
    card.advance(0.4);
    stage(card).pointerup(finger(card.nodes.get('pill'), 220, 880)); await flush();
    assert.equal(state(card), 'PRE_PERMISSION');
    await taken(card, 'tok-4', 'PRE_PERMISSION');
    assert.deepEqual(card.calls.filter((call) => ['speech.start','speech.requestPermission'].includes(call.method)), [], 'the card closed without asking for the microphone');
  });

  test('a read that ended without a verdict gives way: its caption, and the chips that ask which asset was meant', async () => {
    for (const name of ['ERROR', 'UNKNOWN_ASSET', 'CONFIRM_ASSET']) {
      const app = await idle();
      tap(app, chipsOf(app)[0]);
      await flush(); app.advance(1.2); await flush();
      app.answer(REFUSED[name]); await flush(); app.advance(1); await flush();
      assert.equal(state(app), name);
      await taken(app, 'tok-' + name, name);
      assert.equal(asksOf(app).some((ask) => ask.token === REFUSED.CONFIRM_ASSET.token), false, 'the question that was waiting is not asked with it');
    }
  });

  test('where a read is not started, and that the same token is taken once the page is somewhere it can be', async () => {
    // LISTENING: the mic is open (native refuses first; if an offer arrives anyway it does nothing).
    const mic = await idle({ seed: (session) => { session.mic = { state: 'granted', onDevice: true }; } });
    stage(mic).pointerdown(finger(mic.nodes.get('pill'), 220, 880)); if(kit.confirm) await flush();
    assert.equal(state(mic), 'LISTENING');
    refused(mic, 'tok-1', 'LISTENING');
    // A read on its way: SENDING, RESOLVING, THINK_WAIT.
    const flight = await idle();
    tap(flight, chipsOf(flight)[0]);
    assert.equal(state(flight), 'SENDING');
    refused(flight, 'tok-2', 'SENDING');
    await flush(); flight.advance(1.2); await flush();
    assert.equal(state(flight), 'RESOLVING');
    refused(flight, 'tok-2', 'RESOLVING');
    flight.answer(okRead()); await flush(); flight.advance(0.5); await flush();
    assert.equal(state(flight), 'THINK_WAIT');
    refused(flight, 'tok-2', 'THINK_WAIT');
    // PULLING: a finger is on the glass, moving the cards. Let go before the commit, the hand-back takes the offer.
    const pull = await idle();
    await personRead(pull, okRead());
    const chip = chipsOf(pull)[0];
    stage(pull).pointerdown(finger(chip, 200, 600)); stage(pull).pointermove(finger(chip, 200, 630));
    assert.equal(state(pull), 'PULLING');
    refused(pull, 'tok-3', 'PULLING');
    pull.advance(0.6); await flush();
    stage(pull).pointermove(finger(chip, 200, 630)); stage(pull).pointerup(finger(chip, 200, 630));   // a finger at rest: no flick, no commit
    assert.equal(state(pull), 'HANDBACK');
    pull.advance(0.8); await flush();
    await taken(pull, 'tok-3', 'HANDBACK after a pull that was let go');
    // RETURNING: the glass is on its way home (1.7 s at the most); the next offer is taken from the idle home.
    const home = await idle();
    await personRead(home, okRead());
    tap(home, home.nodes.get('close'));
    assert.equal(state(home), 'RETURNING');
    refused(home, 'tok-4', 'RETURNING');
    home.advance(1.8); await flush();
    assert.equal(state(home), 'IDLE');
    await taken(home, 'tok-4', 'IDLE');
    // The gates: consent is missing, or the person's own question waits behind a sign-in or Bobby Pro.
    for (const name of ['RISK_GATE', 'SIGNIN_GATE', 'PRO_GATE']) {
      const gate = await idle();
      tap(gate, chipsOf(gate)[0]);
      await flush(); gate.advance(1.2); await flush();
      gate.answer(REFUSED[name]); await flush(); gate.advance(0.6); await flush();
      assert.equal(state(gate), name);
      refused(gate, 'tok-' + name, name);
      assert.deepEqual(gate.errors, [], name);
    }
    // Under a native sheet nothing starts, whatever is on the glass; native sends the question after the sheet has gone.
    const sheet = await idle();
    await personRead(sheet, okRead());
    emit(sheet, 'native.sheet', { route: 'followUp', state: 'open' });
    refused(sheet, 'tok-5', 'HANDBACK under a sheet');
    emit(sheet, 'native.sheet', { route: 'followUp', state: 'closed' });
    await taken(sheet, 'tok-5', 'HANDBACK, the sheet gone');
    assert.deepEqual(mic.errors.concat(flight.errors, pull.errors, home.errors, sheet.errors), []);
  });

  // ---- What is drawn under a native sheet (2026-10-08). The loop that places every chip and every avatar of the belt
  // stands still under a sheet, and the tap that opens a sheet also changes what the page is told (the nudge is
  // retired, a companion is chosen). What is rebuilt there was drawn unplaced, at the stage's top-left corner. ----
  test('a row rebuilt under a native sheet draws nothing out of place, and is right again when the sheet has gone', async () => {
    const app = await idle({ seed: (session) => { session.nudge = { id: 'harness.move.nvda', text: 'NVDA +2.3% since you asked', cta: 'See your week' }; } });
    app.advance(1); await flush();
    assert.deepEqual(rowOf(app), ['See your week', 'NVIDIA', ...(kit.confirm ? ['Bitcoin','Ethereum'] : ['BTC','ETH'])]);
    const settled = (nodes) => { const places = nodes.map(placeOf); return nodes.every(drawn) && places.every(Boolean) && new Set(places.map(String)).size === nodes.length; };
    assert.ok(settled(chipsOf(app)), 'on the home every chip is drawn in a place of its own');
    // The tap on the nudge's button: native opens its sheet, retires the nudge and sends the session again.
    tap(app, chipsOf(app)[0]);
    emit(app, 'native.sheet', { route: 'followUp', state: 'open' });
    emit(app, 'session.changed', { ...app.session, nudge: null });
    await flush();
    const frozen = app.context.nucleo.time();
    app.advance(3); await flush();
    assert.equal(app.context.nucleo.time(), frozen, 'the loop stands still under the sheet');
    assert.ok(chipsOf(app).length >= 3, 'the row was rebuilt under the sheet');
    for (const node of chipsOf(app)) assert.ok(!drawn(node), node.textContent + ': not drawn while nothing can place it');
    assert.ok(!drawn(app.nodes.get('eyebrow')), 'and the line above the row waits with it');
    // The sheet goes: the row is the new one, each chip in its place.
    emit(app, 'native.sheet', { route: 'followUp', state: 'closed' });
    await flush(); app.advance(2.5); await flush();
    assert.deepEqual(rowOf(app), ['NVIDIA', ...(kit.confirm ? ['Bitcoin','Ethereum'] : ['BTC','ETH'])]);
    assert.ok(settled(chipsOf(app)), 'drawn, each in its place');
    const places = chipsOf(app).map(placeOf);
    assert.ok(places.every((at, index) => at[1] === places[0][1] && (index === 0 || at[0] > places[index - 1][0])), 'one row, left to right');
    assert.ok(drawn(app.nodes.get('eyebrow')));
    assert.deepEqual(app.errors, []);
  });

  test('the Squad belt rebuilt under the Squad sheet is not drawn until the loop has placed it', async () => {
    const app = await idle();
    await turnSphere(app);
    app.advance(2.5); await flush();
    assert.equal(state(app), 'FACES');
    const belt = () => app.nodes.get('belt').children;
    assert.ok(belt().length > 3 && belt().every((node) => drawn(node) && placeOf(node)), 'the belt is around the sphere');
    // The Squad sheet is where a companion is changed: the session comes again while the sheet is up.
    emit(app, 'native.sheet', { route: 'squad', state: 'open' });
    const before = belt();
    emit(app, 'session.changed', { ...app.session, companion: { ...app.session.companion, id: 'another', label: 'OTHER' } });
    await flush(); app.advance(2); await flush();
    assert.notEqual(belt()[0], before[0], 'the belt was rebuilt under the sheet');
    for (const node of belt()) assert.ok(!drawn(node), 'no avatar is drawn while nothing can place it');
    emit(app, 'native.sheet', { route: 'squad', state: 'closed' });
    await flush(); app.advance(1.5); await flush();
    assert.ok(belt().every((node) => drawn(node) && placeOf(node)), 'the sheet gone, the belt is back around the sphere');
    assert.deepEqual(app.errors, []);
  });
}
