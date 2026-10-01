// node ios/Bobby/Nucleo/tests/agree-release.test.mjs — the onboarding pill: releasing "Hold to agree" never cancels.
// Reproduces the audit (U1): the finger stays down ~0.5 s past the ring fill, agreeComplete starts the first read
// (state RESOLVING), and the release then reached the RESOLVING branch and fired `cancel`.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../src/onboarding/90-input.js', import.meta.url), 'utf8');
const pill = source.slice(source.indexOf('function pillDown('), source.indexOf('function action('));

function harness() {
  const fired = [], agree = [];
  const W = { state: 'RISK', press: null };
  const context = vm.createContext({
    W, askCapable: () => false, askPress() {}, askRelease() {},
    agreePress: () => agree.push('press'), agreeRelease: () => agree.push('release'),
    fire: (name, p) => fired.push(name), buzz() {}, skipTalk() {}, pullCommit() {}, go() {},
  });
  vm.runInContext(pill, context);
  return { context, W, fired, agree };
}

test('hold past the ring: the read started (RESOLVING) and the release does not cancel it', () => {
  const h = harness();
  h.context.pillDown();
  assert.deepEqual(h.agree, ['press']);
  h.W.state = 'RESOLVING';                 // agreeComplete → acceptRisk → startAsk while the finger is still down
  h.context.pillUp(false);
  assert.deepEqual(h.fired, [], 'no cancel');
  assert.deepEqual(h.agree, ['press', 'release']);
  assert.equal(h.W.pressFrom, null);
});

test('the same through THINK_WAIT and a cancelled pointer', () => {
  for (const [state, cancelled] of [['THINK_WAIT', false], ['RESOLVING', true]]) {
    const h = harness();
    h.context.pillDown();
    h.W.state = state;
    h.context.pillUp(cancelled);
    assert.deepEqual(h.fired, [], `${state}: no cancel`);
  }
});

test('a tap that begins during the read still cancels it', () => {
  const h = harness();
  h.W.state = 'RESOLVING';
  h.context.pillDown();
  h.context.pillUp(false);
  assert.deepEqual(h.fired, ['cancel']);
});
