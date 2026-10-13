import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../src/app/60-fsm.js', import.meta.url), 'utf8');
const actual = source.slice(source.indexOf('function pillDown('), source.indexOf('/* ---------- PRE_PERMISSION'));
function run(seconds, fromRead = false, cancelled = false) {
  let time = 0;
  const calls = [];
  const context = vm.createContext({SES: {mic: {state: 'undetermined'}}, A: {press: {to(){}}},
    tick(){}, noop(){}, nowT: () => time, go: (...args) => calls.push(args), openTyping: args => calls.push(['typing', args])});
  vm.runInContext(actual, context);
  const g = context.pillDown(null, fromRead);
  assert.equal(calls.length, 0, 'No permission or recording on pointer down');
  time = seconds;
  if (cancelled) g.cancel(); else g.up();
  return JSON.parse(JSON.stringify(calls));
}
test('unconfigured microphone: short tap opens typing without permission', () => assert.deepEqual(run(.1), [['typing', {fromRead:false}]]));
test('short tap on a result preserves the follow-up context', () => assert.deepEqual(run(.1,true), [['typing', {fromRead:true}]]));
test('a deliberate hold opens the voice explanation', () => assert.deepEqual(run(.5), [['PRE_PERMISSION']]));
test('cancelled gesture neither requests permission nor types', () => assert.deepEqual(run(.5,false,true), []));

test('IME resize keeps the composer readable and inside the visible viewport', () => {
  const input = fs.readFileSync(new URL('../src/app/70-input.js', import.meta.url), 'utf8');
  const place = input.slice(input.indexOf('function placeTypeBox(){'), input.indexOf("el.ta.addEventListener('keydown'"));
  for (const width of [320, 360, 393]) {
    const styles = {};
    const context = vm.createContext({ W: { innerWidth: width, innerHeight: 300, visualViewport: { offsetTop: 0, height: 300 } },
      el: { typeBox: {}, ta: {} }, fitS: .3, fitX: 0, fitY: 0, TB: { h: 50 }, A: null,
      clamp: (x,a,b) => Math.max(a,Math.min(b,x)), lerp: (a,b,p) => a+(b-a)*p,
      st: (el,key,value) => { styles[key]=value; } });
    vm.runInContext(place+';placeTypeBox();', context);
    assert.ok(parseFloat(styles.width) >= 280);
    assert.ok(parseFloat(styles.left) >= 16);
    assert.ok(parseFloat(styles.top)+50 <= 300);
    assert.ok(parseFloat(styles.fontSize) >= 16);
  }
});
