import test from 'node:test';import assert from 'node:assert/strict';
import {itemDate,matchesDates,compareItemDates} from '../shooting/library.mjs';
test('creation and modification dates filter independently and include boundary days',()=>{
 const row={id:'a',created:'2026-10-20T12:00:00',updated:'2026-11-01T12:00:00'};
 assert.equal(matchesDates(row,{createdFrom:'2026-10-20',createdTo:'2026-10-20',updatedFrom:'2026-11-01'}),true);
 assert.equal(matchesDates(row,{createdFrom:'2026-11-01'}),false);
 assert.equal(matchesDates(row,{updatedTo:'2026-10-31'}),false);
 assert.equal(matchesDates({updated:row.updated},{createdFrom:'2026-01-01'}),false);
 assert.equal(itemDate({updated:row.updated},'created'),null);
});
test('date sorting has four directions and unknown dates stay last',()=>{
 const a={id:'a',created:'2026-01-01',updated:'2026-03-01'},b={id:'b',created:'2026-02-01',updated:'2026-02-01'},unknown={id:'c'};
 for(const [sort,first] of [['new','b'],['old','a'],['updated-new','a'],['updated-old','b']]){
  const sorted=[unknown,a,b].sort((a,b)=>compareItemDates(a,b,sort));assert.equal(sorted[0].id,first);assert.equal(sorted[2].id,'c');
 }
});
test('legacy frames stay in creation order even if an old frame was recently modified',()=>{
 const rows=[{id:'66',created:'2026-10-31',created_estimated:true,updated:'2026-11-01',data:{spoken_code:'Кадр 66'}},{id:'120',data:{spoken_code:'Кадр 120'}},{id:'121',created:'2026-11-01',created_estimated:true,data:{spoken_code:'Кадр 121'}},{id:'119',created:'2026-10-31',created_estimated:true,data:{spoken_code:'Кадр 119'}}];
 assert.deepEqual(rows.sort((a,b)=>compareItemDates(a,b,'new')).map(r=>r.id),['121','120','119','66']);
});
