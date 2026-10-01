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
