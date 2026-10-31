import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../shooting/app.js',import.meta.url),'utf8');
const body=source.slice(source.indexOf('async function nextPhrase()'),source.indexOf('\n',source.indexOf('async function nextPhrase()')));
function setup(replay){
 const card={id:'card',data:{slate:true,details:{filmed_at:'2026-11-01'},blocks:[{title:'Тема',variants:[{id:'text',filmed:true,text:'Сценарий'}]}]}};
 const steps=[{id:'slate',filmed:true},{id:'note',block:'Заметки себе',filmed:false},{id:'text',filmed:true}];
 const c={shoot:{ids:['card'],card:0,step:0,replay},item:()=>card,shootSteps:()=>steps,complete:()=>true,change:async()=>{c.writes++},writes:0,render(){},modal:html=>{c.dialog=html},esc:x=>x,btn:(label,action)=>action,icon:()=>'',can:()=>false,Date};vm.createContext(c);vm.runInContext(body+';globalThis.next=nextPhrase',c);return {c,card};
}
test('replay visits every step without changing saved filming status or date',async()=>{
 const {c,card}=setup(true),before=JSON.stringify(card);
 await c.next();assert.equal(c.shoot.step,1);
 await c.next();assert.equal(c.shoot.step,2);
 await c.next();assert.match(c.dialog,/Прогон завершён/);assert.match(c.dialog,/shoot-replay/);
 assert.equal(c.writes,0);assert.equal(JSON.stringify(card),before);
});
test('normal shooting still records completion',async()=>{
 const {c}=setup(false);c.shoot.step=2;await c.next();assert.equal(c.writes,1);assert.match(c.dialog,/shoot-replay/);
});
