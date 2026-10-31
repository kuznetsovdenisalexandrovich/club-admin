// Tags use a reserved line in synced notes, compatible with the server's strict Card schema.
// Keep ordinary editor notes separate in the UI; no device-only metadata.
const TAG_LINE=/^\[\[shooting-tags:(.*?)\]\]$/gm;
export function normalizeTags(value){
  const list=Array.isArray(value)?value:String(value||'').split(',');
  return [...new Set(list.map(t=>String(t).trim().replace(/^#+/,'').toLocaleLowerCase('ru')).filter(Boolean))].slice(0,24).map(t=>t.slice(0,60));
}
export function tagsOf(card){
  const matches=[...String(card.details?.notes||'').matchAll(TAG_LINE)];
  try{return normalizeTags(JSON.parse(matches.at(-1)?.[1]||'[]'))}catch{return []}
}
export function notesOf(card){return String(card.details?.notes||'').replace(TAG_LINE,'').trimEnd()}
export function withTags(notes,tags){const clean=String(notes||'').replace(TAG_LINE,'').trimEnd(),list=normalizeTags(tags);return clean+(list.length?(clean?'\n\n':'')+'[[shooting-tags:'+JSON.stringify(list)+']]':'')}
export function isGPT(card){return tagsOf(card).includes('gpt')||/\bGPT\b/i.test(card.title||'')}
export function matchesLibrary(card,{query='',tag='',author=''}={},hypothesis=''){
  if(author==='gpt'&&!isGPT(card)||author==='other'&&isGPT(card))return false;
  if(tag&&!tagsOf(card).includes(tag))return false;
  const text=[card.title,card.idea,card.code,card.spoken_code,hypothesis,card.source_title,notesOf(card),...tagsOf(card),...(card.blocks||[]).flatMap(b=>[b.title,...b.variants.map(v=>v.text)])].join(' ').toLocaleLowerCase('ru').replace(/ё/g,'е');
  return query.trim().toLocaleLowerCase('ru').replace(/ё/g,'е').split(/\s+/).filter(Boolean).every(word=>text.includes(word));
}
export function parseCollection(text,hypotheses){
  let input;
  try{input=JSON.parse(String(text).trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i,'$1'))}catch{throw Error('Не удалось прочитать JSON. Вставь ответ целиком или попроси нейросеть исправить синтаксис JSON.')}
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Нужен JSON-объект с массивом cards');
  if(input.schema_version!==undefined&&input.schema_version!==1)throw Error('Неизвестная версия формата. Поддерживается schema_version: 1');
  const versioned=input.schema_version===1;
  const author=versioned?input.author:'';
  if(versioned&&!['deepseek','gpt','claude','gemini'].includes(author))throw Error('author должен быть deepseek, gpt, claude или gemini');
  const label={deepseek:'DeepSeek',gpt:'GPT',claude:'Claude',gemini:'Gemini'}[author];
  const key=v=>String(v||'').trim().toLocaleLowerCase('ru').replace(/ё/g,'е').replace(/\s+/g,' ');
  const canonical=['Заметки себе','Хуки','Интрига','Тема','Призыв'];
  if(!Array.isArray(input.cards)||!input.cards.length||input.cards.length>50)throw Error('Нужна подборка cards: от 1 до 50 карточек');
  const ids=new Set();
  return input.cards.map((c,i)=>{
    const fail=msg=>{throw Error('Карточка '+(i+1)+': '+msg)};
    if(!c||typeof c!=='object'||Array.isArray(c))fail('нужен объект карточки');
    if(typeof c.id!=='string'||!/^[a-zA-Z0-9_-]{1,64}$/.test(c.id)||ids.has(c.id))fail('нужен уникальный id');ids.add(c.id);
    if(typeof c.title!=='string'||!c.title.trim()||c.title.length>150)fail('название должно быть от 1 до 150 символов');
    if(typeof c.idea!=='string'||c.idea.length>12000)fail('слишком длинная идея');
    const candidates=hypotheses.filter(h=>!h.data.archived&&(h.id===c.hypothesis||key(h.data.title)===key(c.hypothesis)));
    if(candidates.length!==1)fail('гипотеза «'+c.hypothesis+'» не найдена или неоднозначна. Скопируй актуальный промпт из приложения');
    const h=candidates[0];
    if(!Array.isArray(c.blocks)||!c.blocks.length||c.blocks.length>30)fail('нужны блоки сценария');
    const names=new Set();
    for(const b of c.blocks){
      if(!b||typeof b!=='object')fail('проверь блоки');
      if(typeof b.title!=='string'||!b.title.trim()||b.title.length>120||names.has(b.title))fail('проверь названия блоков');names.add(b.title);
      if(!Array.isArray(b.texts)||!b.texts.length||b.texts.length>200||b.texts.some(t=>typeof t!=='string'||!t.trim()||t.length>12000))fail('проверь варианты текста');
    }
    if(c.notes!==undefined&&typeof c.notes!=='string')fail('notes должен быть строкой');
    if(c.tags!==undefined&&(!Array.isArray(c.tags)||c.tags.length>20||c.tags.some(t=>typeof t!=='string'||!t.trim()||t.length>60)))fail('tags — массив до 20 строк, каждая до 60 символов');
    if(versioned&&(c.blocks.length!==canonical.length||canonical.some(name=>!names.has(name))))fail('нужны ровно пять блоков: '+canonical.join(', '));
    const title=label?label+' · '+c.title.trim().replace(/^(?:DeepSeek|GPT|Claude|Gemini)\s*[·:—-]\s*/i,''):c.title.trim();
    if(title.length>150)fail('сократи название до 130 символов');
    const notes=withTags(c.notes||'',versioned?[author,...(c.tags||[]).filter(t=>!['gpt','deepseek','claude','gemini'].includes(t.toLowerCase().trim()))]:c.tags||[]);if(notes.length>12000)fail('слишком длинные заметки');
    return {id:c.id,title,idea:c.idea,hypothesis_id:h.id,notes,blocks:versioned?canonical.map(name=>c.blocks.find(b=>b.title===name)):c.blocks};
  });
}

// Legacy cards may only have an approximate creation time supplied by the server.
export function itemDate(row,field='created'){
 const raw=field==='updated'?row.updated:row.created||row.data?.created_at;
 const value=Date.parse(raw||'');return Number.isFinite(value)?value:null;
}
export function matchesDates(row,filters={}){
 for(const field of ['created','updated']){
  const from=filters[field+'From'],to=filters[field+'To'];if(!from&&!to)continue;
  const value=itemDate(row,field);if(value===null)return false;
  const d=new Date(value),day=[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
  if(from&&day<from||to&&day>to)return false;
 }
 return true;
}
export function compareItemDates(a,b,sort='new'){
 const field=sort.startsWith('updated')?'updated':'created',ascending=sort==='old'||sort==='updated-old';
 const av=itemDate(a,field),bv=itemDate(b,field);
 // Before creation dates existed, frame numbers preserve the order of legacy cards.
 if(field==='created'&&(a.created_estimated||av===null)&&(b.created_estimated||bv===null)){const an=Number(String(a.data?.spoken_code||'').match(/^Кадр (\d+)/)?.[1]),bn=Number(String(b.data?.spoken_code||'').match(/^Кадр (\d+)/)?.[1]);if(an&&bn&&an!==bn)return ascending?an-bn:bn-an;}
 if(av===null||bv===null)return av===bv?String(a.id).localeCompare(String(b.id)):av===null?1:-1;
 return (ascending?av-bv:bv-av)||String(a.id).localeCompare(String(b.id));
}
