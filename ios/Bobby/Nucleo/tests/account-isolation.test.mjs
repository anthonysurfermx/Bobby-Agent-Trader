// Runs the real account/consent handlers with deferred bridge replies; no DOM, native account or network.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source = readFileSync(new URL('../src/app/99-boot.js', import.meta.url), 'utf8');
function realFunction(name) {
  const start = source.indexOf('function ' + name + '(');
  assert.ok(start >= 0, 'missing real handler ' + name);
  const open = source.indexOf('{', start);
  let depth = 1, end = open + 1;
  for (; end < source.length && depth; end++) {
    if (source[end] === '{') depth++;
    if (source[end] === '}') depth--;
  }
  assert.equal(depth, 0, 'unbalanced real handler ' + name);
  return source.slice(start, end);
}
const handlers = ['refreshCollections', 'resetVisibleRead', 'accountChanged', 'consentWithdrawn']
  .map(realFunction).join('\n');
const clean = (value) => JSON.parse(JSON.stringify(value));
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

function harness(state = 'READING') {
  const replies = [], draws = [], calls = [];
  const ctx = vm.createContext({
    OWNER_GEN: 0, ST: { name: state }, SES: { signedIn: true, riskAccepted: true },
    LEDGER: [{ id: 'saved-A' }], ISLAND: { owner: 'A' }, ROSTER: { companions: ['A'] },
    SUGG: { quickAccess: ['NVDA'] }, SAVED: { points: 20 }, READ: { requestId: 'read-A' },
    READS_DONE: 7, HINTED: { privateHint: 1 }, GATE_BUSY: true,
    A: { rev: [1, 1, 1].map(() => ({ value: 1, set(value) { this.value = value; } })), satG: { on: true } },
    el: { ta: { value: 'private A question' } },
    noop() {},
    bcall(method) { return new Promise((resolve) => replies.push({ method, resolve })); },
    clearRead() { calls.push('clearRead'); },
    txReset() { calls.push('txReset'); },
    showTypeBox(value) { calls.push(['showTypeBox', value]); },
    go(name) { ctx.ST.name = name; calls.push(['go', name]); },
    buildFaces() { draws.push(clean({ ledger: ctx.LEDGER, island: ctx.ISLAND })); },
    setGreeting() { calls.push('setGreeting'); },
    buildBelt(value) { calls.push(['buildBelt', value]); },
  });
  vm.runInContext(handlers, ctx);
  return { ctx, replies, draws, calls };
}
function answer(batch, owner) {
  for (const reply of batch) {
    const value = {
      theses: { items: [{ id: 'saved-' + owner }] },
      island: { owner },
      roster: { companions: [owner] },
      suggestions: { quickAccess: [owner] },
    }[reply.method];
    assert.ok(value, 'unexpected native collection ' + reply.method);
    reply.resolve(value);
  }
}

test('A→B immediately removes visible account collections and current read', () => {
  const { ctx, calls } = harness();
  ctx.accountChanged({ wasSignedIn: true, signedIn: true });
  assert.equal(ctx.OWNER_GEN, 1);
  assert.equal(ctx.LEDGER.length, 0);
  for (const name of ['ISLAND', 'ROSTER', 'SUGG', 'SAVED', 'READ']) assert.equal(ctx[name], null, name);
  assert.equal(ctx.READS_DONE, 0);
  assert.equal(Object.keys(ctx.HINTED).length, 0);
  assert.equal(ctx.GATE_BUSY, false);
  assert.equal(ctx.el.ta.value, '');
  assert.equal(ctx.ST.name, 'RETURNING');
  assert.ok(calls.includes('clearRead'));
  assert.ok(ctx.A.rev.every((value) => value.value === 0));
  assert.equal(ctx.A.satG.on, false);
});

test('late collection replies from A cannot restore cards, island or suggestions under B', async () => {
  const { ctx, replies, draws } = harness('IDLE');
  ctx.refreshCollections();
  const old = replies.slice();
  ctx.accountChanged({ wasSignedIn: true, signedIn: true });
  const current = replies.slice(old.length);
  answer(old, 'A');
  await flush();
  assert.equal(ctx.LEDGER.length, 0);
  assert.equal(ctx.ISLAND, null);
  assert.equal(ctx.ROSTER, null);
  assert.equal(ctx.SUGG, null);
  assert.ok(draws.every((draw) => draw.ledger.every((item) => item.id !== 'saved-A')));
  ctx.ST.name = 'IDLE';
  answer(current, 'B');
  await flush();
  assert.deepEqual(clean(ctx.LEDGER), [{ id: 'saved-B' }]);
  assert.deepEqual(clean(ctx.ISLAND), { owner: 'B' });
  assert.deepEqual(clean(ctx.ROSTER), { companions: ['B'] });
  assert.deepEqual(clean(ctx.SUGG), { quickAccess: ['B'] });
});

test('an old logged-in signin gate is cleared on A→B', () => {
  const { ctx } = harness('SIGNIN_GATE');
  ctx.ST.retryToken = 'account-A-token';
  ctx.accountChanged({ wasSignedIn: true, signedIn: true });
  assert.equal(ctx.ST.name, 'RETURNING');
  assert.equal(ctx.READ, null);
  assert.equal(ctx.GATE_BUSY, false);
});

test('explicit anonymous→login preserves the signin gate and its question for the native retry', () => {
  const { ctx, calls } = harness('SIGNIN_GATE');
  ctx.SES.signedIn = false;
  ctx.ST.retryToken = 'anonymous-signin-token';
  ctx.ST.question = 'Is NVDA ready?';
  ctx.READ = null;
  ctx.accountChanged({ wasSignedIn: false, signedIn: true });
  assert.equal(ctx.ST.name, 'SIGNIN_GATE');
  assert.equal(ctx.ST.retryToken, 'anonymous-signin-token');
  assert.equal(ctx.ST.question, 'Is NVDA ready?');
  assert.ok(!calls.includes('clearRead'));
  assert.equal(ctx.LEDGER.length, 0);
  assert.equal(ctx.SAVED, null);
});

test('logout drops a gate and prevents pre-logout collection replies appearing to the guest', async () => {
  const { ctx, replies } = harness('SIGNIN_GATE');
  ctx.refreshCollections();
  const old = replies.slice();
  ctx.accountChanged({ wasSignedIn: true, signedIn: false });
  answer(old, 'A');
  await flush();
  assert.equal(ctx.ST.name, 'RETURNING');
  assert.equal(ctx.LEDGER.length, 0);
  assert.equal(ctx.ISLAND, null);
  assert.equal(ctx.SUGG, null);
});

test('consent withdrawal cancels current read/gate while preserving accessible saved account data', async () => {
  const { ctx, replies } = harness('SIGNIN_GATE');
  ctx.refreshCollections();
  ctx.consentWithdrawn();
  answer(replies, 'late-A');
  await flush();
  assert.equal(ctx.SES.signedIn, true);
  assert.equal(ctx.SES.riskAccepted, false);
  assert.equal(ctx.OWNER_GEN, 1);
  assert.equal(ctx.ST.name, 'RETURNING');
  assert.equal(ctx.READ, null);
  assert.equal(ctx.GATE_BUSY, false);
  assert.equal(ctx.SUGG, null);
  assert.deepEqual(clean(ctx.LEDGER), [{ id: 'saved-A' }]);
  assert.deepEqual(clean(ctx.ISLAND), { owner: 'A' });
});

test('account change during boot preserves BOOT and still discards its old pending read', () => {
  const { ctx, calls } = harness('BOOT');
  ctx.accountChanged({ wasSignedIn: true, signedIn: false });
  assert.equal(ctx.ST.name, 'BOOT');
  assert.equal(ctx.READ, null);
  assert.equal(ctx.LEDGER.length, 0);
  assert.ok(!calls.includes('clearRead'));
});
