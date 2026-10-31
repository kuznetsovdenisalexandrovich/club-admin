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
test('replay entry works without a shooting day and returns to its original screen',async()=>{
 const entry=source.slice(source.indexOf('async function startReplay('),source.indexOf('async function startShoot('));
 for(const screen of [{view:'card',selected:'card',sheet:false,hypo:'',tab:'script'},{view:'day',selected:'day',sheet:false,hypo:'',tab:'script'},{view:'hypothesis',selected:'card',sheet:true,hypo:'hyp',tab:'details'}]){
  const card={id:'card',data:{slate:true,day_id:screen.view==='day'?'day':'',blocks:[]}},before=JSON.stringify(card);
  const c={...screen,shoot:null,wakeLock:null,item:id=>id==='card'?card:id==='day'?{kind:'day'}:null,complete:()=>true,document:{body:{classList:{remove(){}}}},render(){},navigator:{wakeLock:{request:async()=>({release(){}})}}};
  vm.createContext(c);vm.runInContext(entry+';globalThis.start=startReplay;globalThis.exit=exitShoot',c);await c.start('card');assert.equal(c.shoot.replay,true);assert.equal(c.shoot.ids[0],'card');assert.equal(c.shoot.step,0);assert.equal(c.sheet,false);
  c.exit();assert.equal(c.shoot,null);for(const [key,value] of Object.entries(screen))assert.equal(c[key],value);assert.equal(JSON.stringify(card),before);
 }
});
