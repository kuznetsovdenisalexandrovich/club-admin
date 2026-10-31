import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeTags,tagsOf,notesOf,withTags,matchesLibrary,parseCollection,isGPT} from '../shooting/library.mjs';
const card={title:'GPT · Кофе',idea:'Намёки',code:'L-1234',spoken_code:'Кадр 105',details:{notes:withTags('Монтаж: оставить паузу',['GPT','Секс'])},blocks:[{title:'Интрига',variants:[{text:'Пинкер объясняет отношения'}]}]};
test('tags survive notes editing, deduplicate and have no schema additions',()=>{assert.deepEqual(normalizeTags(' GPT, gpt, #Секс '),['gpt','секс']);assert.equal(notesOf(card),'Монтаж: оставить паузу');const copy=structuredClone(card);copy.details.notes=withTags('Новые заметки',tagsOf(card));assert.deepEqual(tagsOf(copy),['gpt','секс']);assert.equal(notesOf(copy),'Новые заметки');assert.equal(withTags(copy.details.notes,[]),'Новые заметки')});
test('search intersects words, body, hypothesis, tags and authors',()=>{assert.ok(matchesLibrary(card,{query:'пинкер секс',author:'gpt',tag:'секс'}));assert.ok(matchesLibrary(card,{query:'намеки'}));assert.ok(matchesLibrary(card,{query:'широкий'},'Широкий заход'));assert.equal(matchesLibrary(card,{author:'other'}),false);assert.equal(matchesLibrary(card,{tag:'вино'}),false);assert.equal(matchesLibrary(card,{query:'Пинкер вино'}),false);assert.ok(matchesLibrary({title:'Своё',blocks:[]},{author:'other'}));assert.ok(isGPT({title:'GPT · Старый сценарий'}))});
const hyps=[{id:'h',data:{title:'Секс'}}],entry={id:'batch-1',title:'GPT · Кофе',idea:'Идея',hypothesis:'Секс',tags:['GPT'],blocks:[{title:'Хуки',texts:['Хук']}]};
test('import validates entire batch before changes and resolves exact hypotheses',()=>{const [p]=parseCollection(JSON.stringify({cards:[entry]}),hyps);assert.equal(p.hypothesis_id,'h');assert.deepEqual(tagsOf({details:{notes:p.notes}}),['gpt']);for(const cards of [[entry,entry],[{...entry,hypothesis:'Нет'}],[{...entry,blocks:[{title:'Хуки',texts:['']}]}]])assert.throws(()=>parseCollection(JSON.stringify({cards}),hyps));assert.throws(()=>parseCollection('{}',hyps))});
test('malformed reserved metadata does not hide the card or break search',()=>{const broken={title:'Идея',details:{notes:'[[shooting-tags:bad]]'},blocks:[]};assert.deepEqual(tagsOf(broken),[]);assert.ok(matchesLibrary(broken,{query:'идея'}))});

import {buildImportPrompt} from '../shooting/import-prompt.mjs';
const blockNames=['Заметки себе','Хуки','Интрига','Тема','Призыв'];
const modern={schema_version:1,author:'deepseek',cards:[{...entry,title:'Название',hypothesis:'h',tags:['GPT','отношения'],blocks:blockNames.map(title=>({title,texts:['Текст']}))}]};
test('versioned imports preserve IDs, normalize authors and canonical block order',()=>{
 const input=structuredClone(modern);input.cards[0].blocks.reverse();
 const [result]=parseCollection('```json\n'+JSON.stringify(input)+'\n```',hyps);
 assert.equal(result.id,'batch-1');assert.equal(result.title,'DeepSeek · Название');assert.equal(result.hypothesis_id,'h');
 assert.deepEqual(result.blocks.map(b=>b.title),blockNames);assert.deepEqual(tagsOf({details:{notes:result.notes}}),['deepseek','отношения']);
 const renamed=[{id:'h',data:{title:'Новое название'}}];assert.equal(parseCollection(JSON.stringify(input),renamed)[0].hypothesis_id,'h');
 assert.equal(parseCollection(JSON.stringify({...input,cards:[{...input.cards[0],hypothesis:'  сЕкс  '}]}),hyps)[0].hypothesis_id,'h');
});
test('invalid batches fail before import with actionable errors',()=>{
 for(const text of ['null','[]','{"cards":[null]}','текст до JSON'])assert.throws(()=>parseCollection(text,hyps));
 assert.throws(()=>parseCollection(JSON.stringify({...modern,schema_version:2}),hyps),/версия/);
 assert.throws(()=>parseCollection(JSON.stringify({...modern,author:'unknown'}),hyps),/author/);
 for(const patch of [{blocks:modern.cards[0].blocks.filter(b=>b.title!=='Интрига')},{notes:[]},{tags:{}},{blocks:[null]}])assert.throws(()=>parseCollection(JSON.stringify({...modern,cards:[{...modern.cards[0],...patch}]}),hyps));
 assert.throws(()=>parseCollection(JSON.stringify(modern),[{id:'h',data:{title:'Секс',archived:true}}]),/актуальный промпт/);
 assert.throws(()=>parseCollection(JSON.stringify({cards:[entry]}),[...hyps,{id:'h2',data:{title:'Секс'}}]),/неоднозначна/);
});
test('prompt example is importable, has current hypotheses and unique batch IDs',()=>{
 const prompt=buildImportPrompt([{id:'h',data:{title:'Секс',description:'Живой контекст гипотезы'}}],'batch-example');
 assert.ok(prompt.includes('Живой контекст гипотезы'));assert.ok(prompt.includes('МЕЖДУ хуком и телом'));
 const example=prompt.split('ОБРАЗЕЦ ОДНОЙ КАРТОЧКИ (замени содержимое и создай 7):\n')[1].split('\n\nПеред ответом')[0];
 const [card]=parseCollection(example,hyps);assert.equal(card.id,'batch-example-01');assert.equal(card.blocks[2].variants,undefined);assert.equal(card.blocks[2].texts.length,3);
 assert.notEqual(buildImportPrompt(hyps,'batch-a'),buildImportPrompt(hyps,'batch-b'));
});
