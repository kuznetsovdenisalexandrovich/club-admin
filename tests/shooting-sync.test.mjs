import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../shooting/app.js',import.meta.url),'utf8');
const sync=source.slice(source.indexOf('async function sync('),source.indexOf('\nfunction status()'));
function setup({view='card',sheet=false,shoot=null,remote=[],dirty=[],focused=false}={}){
 const original={id:'card',kind:'card',revision:1,data:{text:'Visible script'},localVersion:1};
 const state={session:{token:'test'},items:[original],dirty,conflicts:{}};
 const ctx={state,view,sheet,shoot,selected:'card',requestedCard:null,syncing:false,navigator:{onLine:true},document:{querySelector:()=>focused?{}:null},message:'',status(){},persist:async()=>{},idbPut:async()=>{},accountKey:()=>'',copy:structuredClone,renders:0,render(){ctx.renders++},refreshThemes(){},$:()=>null,item:id=>state.items.find(x=>x.id===id),api:async(path)=>path==='/shooting/workspace'?{items:remote}:({...original,revision:2,data:{text:'Saved script'}})};
 vm.createContext(ctx);vm.runInContext(sync+';globalThis.runSync=sync',ctx);return ctx;
}
const edited={id:'card',kind:'card',revision:2,data:{text:'Remote edit'}};
test('background sync keeps card DOM and visible text, but fetches other records',async()=>{
 const c=setup({remote:[edited,{id:'other',kind:'card',revision:1,data:{}}]});await c.runSync();assert.equal(c.renders,0);assert.equal(c.item('card').data.text,'Visible script');assert.ok(c.item('other'));
});
test('open sheet and shooting cards survive remote edits and deletion until leaving',async()=>{
 for(const options of [{view:'hypothesis',sheet:true},{view:'day',shoot:{day:'day',ids:['card']}}]){
  const c=setup({...options,remote:[]});await c.runSync();assert.ok(c.item('card'));assert.equal(c.renders,0);
  c.view='ideas';c.sheet=false;c.shoot=null;await c.runSync();assert.equal(c.item('card'),undefined);assert.equal(c.renders,1);
 }
});
test('manual refresh applies remote card and redraws; focused editing remains protected',async()=>{
 const c=setup({remote:[edited]});await c.runSync(true);assert.equal(c.item('card').data.text,'Remote edit');assert.equal(c.renders,1);
 const f=setup({remote:[edited],focused:true});await f.runSync(true);assert.equal(f.item('card').data.text,'Visible script');assert.equal(f.renders,0);
});
test('local saves still upload during reading without replacing the DOM',async()=>{
 const c=setup({remote:[edited],dirty:['card']});await c.runSync();assert.equal(c.state.dirty.length,0);assert.equal(c.item('card').revision,2);assert.equal(c.renders,0);
});
test('requested card navigation renders even though the destination is protected',async()=>{
 const c=setup({view:'ideas',remote:[edited]});c.requestedCard='card';await c.runSync();assert.equal(c.view,'card');assert.equal(c.requestedCard,null);assert.equal(c.renders,1);
});
