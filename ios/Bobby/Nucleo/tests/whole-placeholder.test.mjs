import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../src/app/75-conversation-input.js',import.meta.url),'utf8');
function composer(value='',failure=false){
 const ta={value,placeholder:'complete empty hint',style:{},addEventListener:()=>{}},send={disabled:false};
 const c={el:{ta,taSend:send},taAutosize:()=>{ta.style.height=ta.value==='complete empty hint'?'44px':'22px';send.disabled=!ta.value;if(failure)throw new Error('measure failed');}};
 vm.createContext(c);vm.runInContext(source.slice(source.indexOf('var wholeTaAutosize=')),c);return{c,ta,send};
}
test('empty composer reserves the whole hint but remains empty and cannot send it',()=>{
 const{c,ta,send}=composer();c.taAutosize();assert.equal(ta.style.height,'44px');assert.equal(ta.value,'');assert.equal(send.disabled,true);
});
test('empty composer remains empty even if measuring its hint throws',()=>{
 const{c,ta,send}=composer('',true);assert.throws(()=>c.taAutosize(),/measure failed/);assert.equal(ta.value,'');assert.equal(send.disabled,true);
});
test('whole-placeholder measurement preserves a populated draft and its existing sizing',()=>{
 const{c,ta,send}=composer('heard words');c.taAutosize();assert.equal(ta.value,'heard words');assert.equal(ta.style.height,'22px');assert.equal(send.disabled,false);
});
