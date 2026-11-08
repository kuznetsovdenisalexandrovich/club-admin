/* Visual Telegram HTML editor. No network, no automatic sends. */
(function(){
'use strict';
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const aliases={strong:'b',em:'i',strike:'s',del:'s'};
const allowed=new Set(['b','i','u','s','a','code','pre','blockquote','tg-spoiler']);
function clean(source){
 const doc=new DOMParser().parseFromString(source,'text/html');
 function walk(n,code=false){
  if(n.nodeType===3)return esc(n.nodeValue);
  if(n.nodeType!==1)return '';
  let tag=aliases[n.localName]||n.localName;
  if(['script','style','iframe','object','svg','img','video','audio'].includes(tag))return '';
  if(tag==='br')return '\n';
  const body=[...n.childNodes].map(c=>walk(c,code||tag==='code'||tag==='pre')).join('');
  if(['div','p','li'].includes(tag))return (n.previousSibling && n.previousSibling.nodeName!=='BR'?'\n':'')+body;
  if(code)return body;
  if(tag==='span'){const s=n.style;if(s.fontWeight==='bold'||Number(s.fontWeight)>=600)tag='b';else if(s.fontStyle==='italic')tag='i';else if(s.textDecorationLine.includes('underline'))tag='u';else if(n.classList.contains('tg-spoiler'))tag='tg-spoiler';}
  if(!allowed.has(tag))return body;
  if(tag==='a'){const href=n.getAttribute('href')||'';return /^(https?:\/\/|tg:\/\/)/i.test(href)?'<a href="'+esc(href)+'">'+body+'</a>':body;}
  return '<'+tag+'>'+body+'</'+tag+'>';
 }
 return [...doc.body.childNodes].map(n=>walk(n)).join('');
}
function mount(field){
 if(field.dataset.telegramEditor)return;field.dataset.telegramEditor='1';
 const wrap=document.createElement('div');wrap.className='tg-editor';
 const bar=document.createElement('div');bar.className='tg-editor-toolbar';bar.setAttribute('role','toolbar');bar.setAttribute('aria-label','Оформление сообщения');
 const box=document.createElement('div');box.className='tg-editor-body';box.contentEditable='true';box.setAttribute('role','textbox');box.setAttribute('aria-multiline','true');box.setAttribute('aria-label','Текст сообщения');box.id=field.id+'-visual';
 const note=document.createElement('div');note.className='tg-editor-note';note.textContent='Выдели текст для оформления. Cmd/Ctrl+B, I, U · K — ссылка · Z — отмена.';
 field.after(wrap);wrap.append(bar,box,note);field.hidden=true;
 const descriptor=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value');let syncing=false;
 function load(){box.innerHTML=clean(descriptor.get.call(field)).replaceAll('\n','<br>');}
 function save(){syncing=true;descriptor.set.call(field,clean(box.innerHTML));field.dispatchEvent(new Event('input',{bubbles:true}));syncing=false;}
 Object.defineProperty(field,'value',{configurable:true,get(){return descriptor.get.call(this)},set(v){descriptor.set.call(this,v);if(!syncing)load();}});
 const required=field.required;field.required=false;if(required)box.setAttribute('aria-required','true');field.form?.addEventListener('submit',e=>{if(required&&!box.textContent.trim()){e.preventDefault();e.stopImmediatePropagation();note.textContent='Напиши текст сообщения';box.focus();}},true);
 load();box.addEventListener('input',save);box.addEventListener('blur',()=>field.dispatchEvent(new Event('change',{bubbles:true})));
 field.addEventListener('input',()=>{if(!syncing)load()});
 field.form?.addEventListener('reset',()=>queueMicrotask(load));
 let bookmark=null;
 document.addEventListener('selectionchange',()=>{const sel=getSelection();if(sel.rangeCount&&box.contains(sel.anchorNode)&&box.contains(sel.focusNode))bookmark=sel.getRangeAt(0).cloneRange();});
 function act(cmd){
  const current=getSelection();if(current.rangeCount&&box.contains(current.anchorNode)&&box.contains(current.focusNode))bookmark=current.getRangeAt(0).cloneRange();box.focus();if(bookmark&&box.contains(bookmark.commonAncestorContainer)){const sel=getSelection();sel.removeAllRanges();sel.addRange(bookmark);}
  if(cmd==='link'){const href=prompt('Адрес ссылки https://');if(href===null)return;if(!/^(https?:\/\/|tg:\/\/)/i.test(href)){note.textContent='Укажи ссылку https://, http:// или tg://';return;}document.execCommand('createLink',false,href);}
  else if(cmd==='quote')document.execCommand('formatBlock',false,'blockquote');
  else document.execCommand(cmd,false,null);
  save();
 }
 for(const [cmd,label,title] of [['bold','B','Жирный — Cmd/Ctrl+B'],['italic','I','Курсив — Cmd/Ctrl+I'],['underline','U','Подчёркнутый — Cmd/Ctrl+U'],['strikeThrough','S','Зачёркнутый'],['quote','Цитата','Цитата'],['link','Ссылка','Ссылка — Cmd/Ctrl+K'],['unlink','Без ссылки','Убрать ссылку'],['removeFormat','Очистить','Убрать оформление'],['undo','Отменить','Отмена — Cmd/Ctrl+Z'],['redo','Повторить','Повторить отменённое']]){
  const b=document.createElement('button');b.type='button';b.textContent=label;b.title=title;b.setAttribute('aria-label',title);b.dataset.command=cmd;
  b.addEventListener('mousedown',e=>e.preventDefault());b.addEventListener('click',()=>act(cmd));bar.append(b);
 }
 box.addEventListener('keydown',e=>{if(!(e.metaKey||e.ctrlKey)||e.altKey)return;const key=e.code;const cmd=({KeyB:'bold',KeyI:'italic',KeyU:'underline',KeyK:'link'})[key];if(cmd){e.preventDefault();act(cmd);}});
 box.addEventListener('paste',e=>{e.preventDefault();const data=e.clipboardData;const html=data.getData('text/html');document.execCommand('insertHTML',false,(html?clean(html):esc(data.getData('text/plain'))).replaceAll('\n','<br>'));save();});
 box.addEventListener('drop',e=>e.preventDefault());
}
document.addEventListener('mousedown',e=>{if(e.target.closest('.html-toolbar button'))e.preventDefault();});
document.addEventListener('keydown',e=>{const box=e.target.closest('.rich-input[contenteditable=true]');if(!box||!(e.metaKey||e.ctrlKey)||e.altKey)return;const cmd=({KeyB:'bold',KeyI:'italic',KeyU:'underline'})[e.code];if(cmd){e.preventDefault();document.execCommand(cmd,false,null);box.dispatchEvent(new Event('input',{bubbles:true}));}else if(e.code==='KeyK'&&typeof window.applyLinkFormat==='function'){e.preventDefault();window.applyLinkFormat(box.id);}});
window.TelegramEditor={mount,clean};
function scan(){for(const id of ['nurture-step-html','bc-text','bc-delivered-text','wv-start-text','wv-last-text']){const el=document.getElementById(id);if(el)mount(el);}}
scan();new MutationObserver(scan).observe(document.body,{childList:true,subtree:true});
})();
