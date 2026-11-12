import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../card-review.js',import.meta.url),'utf8');
function setup(){
 const elements=new Map();const storage=new Map();const calls=[];
 const ctx={Map,Set,Promise,Array,Object,JSON,Math,Number,String,encodeURIComponent,crypto:{randomUUID:()=> 'request-123456789'},
  document:{getElementById:id=>{if(!elements.has(id))elements.set(id,{textContent:'',innerHTML:''});return elements.get(id);},querySelectorAll:()=>[]},
  localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
  API:'',ADMIN_TOKEN:'test',cardTypes:[{key:'one',needs_review:true}],Image:class{},
  fetch:async(url,opts)=>{calls.push({url,body:opts&&JSON.parse(opts.body)});return {ok:true,json:async()=>({key:'one',revision:'v2',holo:{on:false},needs_review:false,frame_keys:['b']})};}};
 vm.createContext(ctx);vm.runInContext(source,ctx);
 Object.assign(ctx.cardReview,{active:true,ready:true,keys:['one','two'],index:0,dirty:true,state:{revision:'v1'},selected:new Set(['b']),own:true,holo:{on:false}});
 return {ctx,calls,elements,storage};
}
test('approval waits for atomic save and advances once on repeated clicks',async()=>{
 const {ctx,calls}=setup();let release;let next=0;
 ctx.fetch=async(url,opts)=>{calls.push(JSON.parse(opts.body));await new Promise(r=>release=r);return {ok:true,json:async()=>({revision:'v2',needs_review:false})};};
 ctx.reviewOpenCurrent=()=>next++;
 const first=ctx.reviewApprove();await ctx.reviewApprove();assert.equal(next,0);assert.equal(calls.length,1);
 assert.equal(calls[0].approve,true);assert.deepEqual(calls[0].frame_keys,['b']);release();await first;
 assert.equal(next,1);assert.equal(ctx.cardReview.index,1);
});
test('failed save keeps current card and draft, never advances',async()=>{
 const {ctx}=setup();ctx.fetch=async()=>({ok:false,status:409,json:async()=>({detail:'Conflict'})});
 let next=0;ctx.reviewOpenCurrent=()=>next++;await ctx.reviewApprove();
 assert.equal(next,0);assert.equal(ctx.cardReview.index,0);assert.equal(ctx.cardReview.dirty,true);assert.equal(ctx.cardReview.busy,false);
});
test('send to self saves first, has no recipient picker, deduplicates clicks',async()=>{
 const {ctx,calls}=setup();await ctx.reviewSendSelf();await ctx.reviewSendSelf();
 assert.equal(calls.length,2);assert.match(calls[0].url,/review-save/);assert.match(calls[1].url,/review-grant-self/);
 assert.equal(calls[1].body.key,'one');assert.equal(calls[1].body.request_id,'request-123456789');
 assert.equal('telegram_id' in calls[1].body,false);assert.equal(ctx.cardReview.index,0);
});
test('ambiguous grant failure retries the exact receipt',async()=>{
 const {ctx,calls}=setup();ctx.cardReview.dirty=false;let attempts=0;
 ctx.fetch=async(url,opts)=>{calls.push(JSON.parse(opts.body));if(++attempts===1)throw Error('network');return {ok:true,json:async()=>({status:'ok'})};};
 await ctx.reviewSendSelf();await ctx.reviewSendSelf();assert.equal(calls.length,2);assert.deepEqual(calls[0],calls[1]);
});
