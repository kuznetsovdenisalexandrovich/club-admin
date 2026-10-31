import test from 'node:test';
import assert from 'node:assert/strict';
import {sampleTimes} from '../shooting/references.mjs';
test('frame sampling focuses on opening and spans body without seeking outside media',()=>{
 for(const duration of [0.4,1,6,39.215,180]){
  const times=sampleTimes(duration);assert.ok(times.length<=18);assert.ok(times.length>0);assert.equal(new Set(times).size,times.length);assert.ok(times.every(t=>t>=0&&t<duration));assert.deepEqual([...times].sort((a,b)=>a-b),times);
 }
 const times=sampleTimes(39.215);assert.ok(times.includes(0.05)&&times.includes(0.7)&&times.includes(1.5)&&times.includes(2.5));assert.ok(times.at(-1)>35);
 for(const d of [0,-1,181,NaN,Infinity])assert.throws(()=>sampleTimes(d));
});
