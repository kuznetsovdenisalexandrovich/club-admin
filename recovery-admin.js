/* Private recovery console. Requests stay on the explicitly selected node. */
(function(){
'use strict';
let generation=0,busy=false,detail=null,items=[],previousFocus=null;
const $=id=>document.getElementById('recovery-'+id);
const titles={rf_failure:'Ошибка обмена',rf_transport:'Связь между серверами',rf_identity:'Сопоставление записей',rf_missing_row:'Восстановление записи',bot_outbox:'Доставка боту',operator_retry:'Ручной повтор сообщения',operator_rf:'Ручной повтор обмена',disk_pressure:'Свободное место'};
const statuses={waiting:'Требует внимания',resolved:'Восстановлено',accepted:'Принято ботом',requested:'Повтор запрошен',rejected:'Не принято',review:'Нужна проверка',unknown:'Результат неизвестен',failed:'Ошибка',blocked:'Доставка недоступна',conflict:'Конфликт',sent:'Отправлено',callback:'Колбек оплаты',queued:'В очереди',pending:'Ожидает обработки',sending:'Отправляется',delivered:'Доставлено',done:'Обработано'};
function node(){return $('node').value;}
function label(){return node()==='primary'?'Основной сервер':'Резервный сервер';}
function text(tag,value,cls){const e=document.createElement(tag);e.textContent=value==null?'':String(value);if(cls)e.className=cls;return e;}
function button(name,fn){const e=text('button',name,'action-btn');e.type='button';e.addEventListener('click',fn);return e;}
function stamp(v){if(!v)return '';const d=new Date(typeof v==='number'?v*1000:(/[Z+]|\d-\d\d:\d\d$/.test(v)?v:v.replace(' ','T')+'Z'));return Number.isNaN(d.getTime())?String(v):d.toLocaleString('ru-RU',{timeZone:'Europe/Moscow'});}
async function request(path,method='GET'){
 const base=node()==='primary'?API_PRIMARY:API_RAILWAY;
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000);
 try{
  const r=await adminFetchRaw(base+'/admin/recovery'+path,{method,headers:{'X-Admin-Token':ADMIN_TOKEN,'Content-Type':'application/json'},body:method==='POST'?'{}':undefined,cache:'no-store',redirect:'error',signal:controller.signal});
  let d;try{d=await r.json();}catch(e){throw Error('Сервер вернул нечитаемый ответ (HTTP '+r.status+').');}
  if(r.status===401||r.status===403){adminTokenExpired();throw Error('Войдите по PIN и обновите журнал. Действие автоматически не повторяется.');}
  if(!r.ok)throw Error(typeof d.detail==='string'?d.detail:'HTTP '+r.status);
  return d;
 }catch(e){if(e.name==='AbortError')throw Error('Сервер не ответил вовремя. Результат действия неизвестен: обновите журнал перед повтором.');throw e;}
 finally{clearTimeout(timer);}
}
function message(s){$('message').textContent=s;}
function lock(value){busy=value;for(const e of $('overlay').querySelectorAll('button,select,input'))e.disabled=value;}
function render(){
 const q=$('search').value.toLocaleLowerCase(),mode=$('filter').value;
 const rows=items.filter(x=>(mode==='all'||(mode==='attention'?['waiting','rejected','review','unknown','failed','conflict'].includes(x.status):x.type===mode))&&JSON.stringify(x).toLocaleLowerCase().includes(q));
 const list=$('list');list.replaceChildren();$('count').textContent=rows.length+' из '+items.length+' записей. Показаны последние события выбранного сервера.';
 if(!rows.length)list.append(text('p','По этому фильтру записей нет.','pay-meta'));
 for(const x of rows){const row=text('div','','recovery-row');row.append(text('strong',x.title),text('div',(statuses[x.status]||x.status||'Колбек')+(x.at?' · '+stamp(x.at):''),'pay-meta'));if(x.error)row.append(text('p',x.error));row.append(button('Открыть',()=>openDetail(x)));list.append(row);}
}
async function refresh(){
 if(busy)return;const g=++generation;detail=null;$('detail').replaceChildren();message('Загружаю '+label().toLocaleLowerCase()+'…');$('list').replaceChildren();items=[];
 const results=await Promise.allSettled([request(''),request('/callbacks?limit=200')]);if(g!==generation)return;
 const failures=[];const a=results[0];
 if(a.status==='fulfilled'){
  const d=a.value;
  // route_me describes HA node naming; the URL is pinned and never auto-fails over.
  $('health').textContent=label()+' · '+d.build+' · '+(d.replication.healthy?'Обмен работает':('Обмен требует проверки: '+(d.replication.error||'нет подтверждения')));
  items.push(...d.journal.map(x=>({...x,type:'journal',id:x.key,title:titles[x.kind]||x.kind,at:x.last})),...d.outbox.map(x=>({...x,type:'outbox',title:'Сообщение #'+x.id+' · '+x.event_id})),...d.bot_repairs.map(x=>({...x,type:'bot',title:'Восстановление диалога #'+x.id,at:x.created_at})));
 }else{failures.push(a.reason.message);$('health').textContent=label()+' · состояние недоступно';}
 const b=results[1];if(b.status==='fulfilled')items.push(...b.value.groups.map(x=>({...x,type:'callback',id:x.ids[0],title:'Колбек #'+x.ids[0]+(x.ids.length>1?' · одинаковых тел: '+x.ids.length:''),status:'callback',at:x.created_at})));else failures.push('Колбеки: '+b.reason.message);
 render();message(failures.join(' '));
}
async function openDetail(item){
 if(busy)return;const g=++generation;detail=null;$('detail').replaceChildren(text('p','Загрузка подробностей…'));
 const paths={journal:'/entry/',outbox:'/outbox/',callback:'/callbacks/',bot:'/bot/'};
 try{const d=await request(paths[item.type]+encodeURIComponent(item.id));if(g!==generation)return;detail={item,data:d,node:node()};const box=$('detail');box.replaceChildren(text('h3',item.title),text('p',label(),'pay-meta'));
  if(item.ids)box.append(text('p','Исходные записи: '+item.ids.join(', ')));
  if(item.type==='callback')box.append(text('p',d.processing==='recorded'?'Обработка зарегистрирована. Результат сохранён ниже.':'Обработка на этом сервере не подтверждена. Сверьте резерв и журнал обмена.'));
  if(item.type==='outbox')box.append(text('p','Статус: '+(statuses[d.status]||d.status)+' · попыток: '+(d.attempts||0)));
  if(d.retry)box.append(text('p',d.retry.reason));
  if(item.type==='outbox'&&d.retry&&d.retry.allowed)box.append(button('Безопасно повторить сообщение',()=>retryMessage()));
  if(item.type==='journal'&&['rf_failure','rf_transport'].includes(d.kind))box.append(button('Повторить обмен на этом сервере',()=>retryExchange()));
  box.append(button('Обновить карточку',()=>openDetail(item)),button('Скачать JSON',download));const pre=text('pre',JSON.stringify(d,null,2),'recovery-json');pre.tabIndex=0;box.append(pre);box.scrollIntoView({block:'nearest',behavior:'smooth'});
 }catch(e){if(g===generation)$('detail').replaceChildren(text('p',e.message));}
}
async function mutate(path,prompt){
 if(busy||!confirm(label()+'. '+prompt))return;const current=detail?.item;lock(true);message('Выполняю действие. Повторно не нажимайте.');
 try{const d=await request(path,'POST');message('Запрос принят. Обновляю состояние…');lock(false);await refresh();if(path.startsWith('/outbox/')&&current)await openDetail(current);message(path==='/rf/retry'?'Обмен выполнен. Последнее применённое событие: '+d.through+'.':('Запрос повтора сообщения принят. Факт доставки смотрите в карточке сообщения; принятие запроса ещё не означает доставку.'));}
 catch(e){message(e.message+' Автоматического повторного запроса не было. Нажмите «Обновить», чтобы проверить результат.');}
 finally{lock(false);}
}
function retryMessage(){if(!detail||detail.node!==node()||!detail.data.retry?.allowed)return;return mutate('/outbox/'+detail.item.id+'/retry','Повторить сообщение #'+detail.item.id+' с тем же номером события? Сервер ещё раз проверит, что предыдущая попытка точно не была принята.');}
function retryExchange(){return mutate('/rf/retry','Повторить обычный обмен? События не будут пропущены, платёжные колбеки заново не отправляются.');}
function download(){if(!detail)return;const blob=new Blob([JSON.stringify({server:detail.node,...detail.data},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='club-'+detail.node+'-'+detail.item.type+'-'+String(detail.item.id).replace(/[^a-z0-9_-]/gi,'_')+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
window.openRecoveryPopup=function(){
 previousFocus=document.activeElement;
 if(!$('overlay')){
 const overlay=text('div','','popup-overlay popup-centered');overlay.id='recovery-overlay';
 overlay.innerHTML='<div class="popup recovery-popup" role="dialog" aria-modal="true" aria-labelledby="recovery-title"><button class="popup-close-x" id="recovery-close" aria-label="Закрыть">×</button><div class="popup-body"><h2 id="recovery-title">Журнал и восстановление</h2><p class="pay-meta">Исходные данные, причины сбоев и результат исправления. Токены и подписи скрыты. Данные клиентов не публикуйте.</p><div class="recovery-controls"><label>Сервер <select id="recovery-node"><option value="primary">Основной</option><option value="reserve">Резервный</option></select></label><button class="action-btn" id="recovery-refresh">Обновить</button><button class="action-btn" id="recovery-exchange">Повторить обмен</button></div><p id="recovery-health"></p><p id="recovery-message" role="status" aria-live="polite"></p><details><summary>Как пользоваться</summary><p>Откройте запись и прочитайте причину. Кнопка повтора сообщения появляется только при подтверждённом отказе до принятия ботом. При неизвестном результате повтор запрещён. Обмен можно повторить без пропуска событий. Колбеки оплаты доступны для просмотра и сверки; они не удаляются и не отправляются заново.</p><p>Если сервер не отвечает, выберите второй. После потери связи во время действия сначала обновите журнал. Зелёный статус обмена не означает, что конкретный платёж или сообщение уже обработаны.</p></details><div class="recovery-controls"><label>Показать <select id="recovery-filter"><option value="all">Всё</option><option value="attention">Требует внимания</option><option value="journal">Восстановления</option><option value="outbox">Сообщения боту</option><option value="callback">Колбеки оплаты</option><option value="bot">Диалоги бота</option></select></label><label>Поиск <input id="recovery-search" type="search" placeholder="Номер, событие или ошибка"></label></div><p id="recovery-count" class="pay-meta"></p><div class="recovery-columns"><div id="recovery-list"></div><div id="recovery-detail" aria-live="polite"></div></div></div></div>';
 document.body.append(overlay);$('close').addEventListener('click',close);overlay.addEventListener('keydown',e=>{if(e.key==='Escape')close();if(e.key==='Tab'){const list=[...overlay.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),summary,[tabindex="0"]')];const first=list[0],last=list[list.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});$('node').addEventListener('change',refresh);$('refresh').addEventListener('click',refresh);$('exchange').addEventListener('click',retryExchange);$('filter').addEventListener('change',render);$('search').addEventListener('input',render);
 }
 $('overlay').classList.add('open');$('close').focus();refresh();
};
function close(){if(busy)return;++generation;$('overlay').classList.remove('open');detail=null;items=[];$('list').replaceChildren();$('detail').replaceChildren();previousFocus?.focus();}
})();
