// Exercises shipping rendering against native save replies. Browser/WebKit layout is separate evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read = p => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const render = read('../src/app/80-render.js');
const slice = render.slice(render.indexOf('function readNextAction()'), render.indexOf('/* ---------- chips born from the pill ---------- */'));
const table = /\/\*STRINGS-BEGIN\*\/([\s\S]*?)\/\*STRINGS-END\*\//.exec(read('../src/app/40-strings.js'))[1];
function setup(state = 'CARDS', lang = 'es') {
  const keys = ['readActions','readHandback','readNext','readVoice','readResult','readDetails','readSave','readHome','readSummary','readNextNote','readNextPrimary','chipRow','eyebrow','hint'];
  const el = Object.fromEntries(keys.map(k => [k,{style:{},attributes:{},textContent:''}]));
  const r = { model:{}, save:null };
  const c = vm.createContext({el,READ:r,ST:{name:state},A:{cardIdx:0},SUGG:{},LANG:lang,
    st:(n,k,v) => n.style[k]=v,att:(n,k,v) => n.attributes[k]=v,
    readResultReady:()=>['THINK_RESOLVE','TALK_EVIDENCE','TALK_CHART','VERDICT','HANDBACK'].includes(state),
    RMOD:{followUps:()=>[]} });
  vm.runInContext('var STR='+table+'; function tt(k,p){var s=STR[LANG][k]; Object.keys(p||{}).forEach(function(x){s=s.replace("{"+x+"}",p[x]);}); return s;}\n'+slice,c);
  return {c,r,el,draw:()=>c.renderReadActions()};
}
for (const lang of ['es','en','fr','pt','it','de']) test(`${lang}: first summary visibly offers save and home`, () => {
  const {el,draw}=setup('CARDS',lang); draw();
  assert.equal(el.readNext.hidden,false); assert.equal(el.readNextPrimary.attributes['data-hit'],'read-save');
  assert.ok(el.readNextPrimary.textContent); assert.ok(el.readHome.textContent);
  assert.equal(el.readSummary.hidden,true); assert.equal(el.chipRow.style.visibility,'hidden');
});
test('voice skip and result controls are present before narration completes', () => {
  const {el,draw}=setup('THINK_RESOLVE');draw();
  assert.equal(el.readActions.hidden,false);assert.equal(el.readNext.hidden,true);
  assert.equal(el.readVoice.textContent,'Saltar voz');assert.equal(el.readResult.textContent,'Ver análisis');
});
test('handback presents analysis and save directly', () => {
  const {el,draw}=setup('HANDBACK');draw();
  assert.equal(el.readHandback.hidden,false);assert.equal(el.readActions.hidden,true);
});
test('an unfinished analysis offers neither skip nor save', () => {
  const {el,draw}=setup('THINK_WAIT');draw();
  for(const k of ['readNext','readActions','readHandback']) assert.equal(el[k].hidden,true);
});
test('pending save cannot look saved or promise a tomorrow return', () => {
  const {el,r,draw}=setup('SAVING');r.savePending=true;draw();
  assert.equal(el.readNextPrimary.disabled,true);assert.equal(el.readNextPrimary.textContent,'Guardando…');
  assert.ok(!el.readNextNote.textContent.includes('Mañana'));
});
test('failed save stays retryable and gives a clear failure', () => {
  const {el,r,draw}=setup();r.save={status:'failed'};draw();
  assert.equal(el.readNextPrimary.attributes['data-hit'],'read-save');assert.equal(el.readNextPrimary.disabled,false);
  assert.equal(el.readNextNote.textContent,'No se pudo guardar esta lectura');
});
test('older native or web replies never promise an in-app return', () => {
  const {el,r,draw}=setup('FOLLOWUPS');r.save={status:'saved'};draw();
  assert.equal(el.readNextNote.textContent,'Guardada en este teléfono.');
  assert.equal(el.readNextPrimary.attributes['data-hit'],'read-home');
});
test('confirmed in-app save describes the local next calendar day', () => {
  const {el,r,draw}=setup('FOLLOWUPS');const d=new Date();d.setDate(d.getDate()+1);d.setHours(8,0,0,0);
  r.save={status:'saved',followUp:{kind:'in_app',name:'Micron',availableFrom:d.toISOString()}};draw();
  assert.equal(el.readNextNote.textContent,'Mañana, abre Bobby para retomar Micron.');
});
test('a real server next question keeps its action and finite tap origin', () => {
  const {c,el,r,draw}=setup('FOLLOWUPS');r.save={status:'saved'};
  c.RMOD.followUps=()=>[{label:'¿Qué puede cambiar esta lectura?',action:{followUpOf:'id',question:'¿Qué puede cambiar esta lectura?'}}];draw();
  assert.equal(el.readNextPrimary.attributes['data-hit'],'read-next');assert.equal(el.readHome.hidden,false);
  const next=c.readNextAction();assert.equal(next.action.followUpOf,'id');assert.ok(Number.isFinite(next.x+next.w/2));
});
test('a stored reading can only return home, never save again', () => {
  const {c,el,draw}=setup('THESIS_VIEW');c.READ=null;draw();
  assert.equal(el.readNextPrimary.attributes['data-hit'],'read-home');assert.equal(el.readHome.hidden,true);
});
