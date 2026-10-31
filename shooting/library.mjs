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
  const input=JSON.parse(text);
  if(!Array.isArray(input.cards)||!input.cards.length||input.cards.length>50)throw Error('Нужна подборка cards: от 1 до 50 карточек');
  const ids=new Set();
  return input.cards.map((c,i)=>{
    const fail=msg=>{throw Error('Карточка '+(i+1)+': '+msg)};
    if(typeof c.id!=='string'||!/^[a-zA-Z0-9_-]{1,64}$/.test(c.id)||ids.has(c.id))fail('нужен уникальный id');ids.add(c.id);
    if(typeof c.title!=='string'||!c.title.trim()||c.title.length>150)fail('название должно быть от 1 до 150 символов');
    if(typeof c.idea!=='string'||c.idea.length>12000)fail('слишком длинная идея');
    const h=hypotheses.find(h=>h.data.title===c.hypothesis);
    if(!h)fail('гипотеза «'+c.hypothesis+'» не найдена');
    if(!Array.isArray(c.blocks)||!c.blocks.length||c.blocks.length>30)fail('нужны блоки сценария');
    const names=new Set();
    for(const b of c.blocks){
      if(typeof b.title!=='string'||!b.title.trim()||b.title.length>120||names.has(b.title))fail('проверь названия блоков');names.add(b.title);
      if(!Array.isArray(b.texts)||!b.texts.length||b.texts.length>200||b.texts.some(t=>typeof t!=='string'||!t.trim()||t.length>12000))fail('проверь варианты текста');
    }
    const notes=withTags(String(c.notes||''),c.tags||[]);if(notes.length>12000)fail('слишком длинные заметки');
    return {id:c.id,title:c.title.trim(),idea:c.idea,hypothesis_id:h.id,notes,blocks:c.blocks};
  });
}
