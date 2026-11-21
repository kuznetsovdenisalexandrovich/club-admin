/* Same authenticated configuration and report; a stop never erases assignments. */
let guestExperimentConfig=null;
async function guestExperimentAdminApi(path,body){
 const r=await fetch(API+'/guest-experiment/admin/'+path,{method:body?'PUT':'GET',headers:{'X-Admin-Token':ADMIN_TOKEN,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 const d=await r.json();if(!r.ok)throw Error(d.detail||'Не удалось получить ответ');return d;
}
function openGuestExperiment(){
 let el=document.getElementById('guest-experiment-editor');
 if(!el){el=document.createElement('div');el.id='guest-experiment-editor';el.className='popup-overlay popup-centered';el.innerHTML='<div class="popup" style="max-width:900px;width:100%;max-height:90dvh;overflow:auto;padding:24px"><div class="ie-toolbar"><h2>Четыре ветки после фильма</h2><button class="scroll-btn" data-ge="close">Закрыть</button></div><div id="ge-body"></div><p id="ge-status" role="status"></p></div>';document.body.appendChild(el);}
 el.classList.add('open');guestExperimentAdminLoad();
}
async function guestExperimentAdminLoad(){
 document.getElementById('ge-status').textContent='Загружаем состояние…';
 try{
  const [c,r]=await Promise.all([guestExperimentAdminApi('config'),guestExperimentAdminApi('report')]);guestExperimentConfig=c;const e=escapeHtmlText;
  const names={A:'Боги продаж',B:'Моя задача',C:'Вытащи из игнора',D:'Продажи — это секс'};
  document.getElementById('ge-body').innerHTML='<p class="pay-meta">'+e(r.note)+'</p><p>A — Боги продаж · B — Моя задача · C — Вытащи из игнора · D — Продажи — это секс</p><label class="ie-check"><input id="ge-enabled" type="checkbox" '+(c.enabled?'checked':'')+'> Включено для новых бесплатных гостей после фильма</label><label class="ie-field">Тестовые Telegram ID (не входят в статистику)<input id="ge-pilots" value="'+e(c.pilot_ids.join(', '))+'"></label><label class="ie-field">Исключённые Telegram ID<input id="ge-excluded" value="'+e(c.excluded_ids.join(', '))+'"></label><div class="ie-toolbar"><button class="action-btn" data-ge="save">Сохранить</button><button class="scroll-btn" data-ge="stop">Отключить для всех</button><button class="scroll-btn" data-ge="reload">Обновить</button></div><p class="pay-meta">Версия настроек '+c.revision+'. Остановка возвращает прежний путь; история назначений и покупок сохраняется. Участники, прежние покупатели, администратор и тестеры не попадают в обычную выборку.</p><div style="overflow:auto"><table style="width:100%;text-align:left"><thead><tr>'+['Первая ветка','Назначено','Показ','Начали','Прошли игру','Досмотр','К оплате','Купили за 7 дней','Прошло 7 дней'].map(t=>'<th style="padding:8px">'+e(t)+'</th>').join('')+'</tr></thead><tbody>'+r.variants.map(v=>'<tr>'+[names[v.variant],v.assigned,v.shown,v.started,v.game_completed,v.completed,v.payment_open,v.buyers_7d,v.matured_7d].map(x=>'<td style="padding:8px">'+e(String(x))+'</td>').join('')+'</tr>').join('')+'</tbody></table></div><p class="pay-meta">Действия считаются по всем посещённым веткам внутри первоначальной группы. Пока не прошло 7 дней, окно покупки ещё открыто. Не выбираем победителя по первым оплатам.</p><details><summary>Пути между ветками</summary>'+Object.entries(r.paths).map(([p,n])=>'<p>'+e(p)+' — '+Number(n)+'</p>').join('')+'</details><p class="pay-meta">Тестовых аккаунтов: '+r.pilot_accounts+'</p>';
  document.getElementById('ge-status').textContent=c.enabled?'Эксперимент включён.':c.pilot_ids.length?'Только технический пилот.':'Эксперимент выключен.';
 }catch(e){document.getElementById('ge-status').textContent=e.message;}
}
async function guestExperimentAdminSave(stop){
 if(!guestExperimentConfig)return;const buttons=[...document.querySelectorAll('[data-ge="save"],[data-ge="stop"]')];buttons.forEach(b=>b.disabled=true);
 try{
  const ids=id=>{const values=document.getElementById(id).value.split(',').map(v=>v.trim()).filter(Boolean).map(Number);if(values.some(v=>!Number.isSafeInteger(v)||!v))throw Error('Проверь ID аккаунтов');return values;};
  const cfg={...guestExperimentConfig,enabled:stop?false:document.getElementById('ge-enabled').checked,pilot_ids:stop?[]:ids('ge-pilots'),excluded_ids:ids('ge-excluded')};
  guestExperimentConfig=await guestExperimentAdminApi('config',cfg);await guestExperimentAdminLoad();
 }catch(e){document.getElementById('ge-status').textContent=e.message+' Обнови состояние перед повтором.';}finally{buttons.forEach(b=>b.disabled=false);}
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-ge]');if(!b)return;const a=b.dataset.ge;if(a==='close')document.getElementById('guest-experiment-editor').classList.remove('open');if(a==='reload')guestExperimentAdminLoad();if(a==='save'||a==='stop')guestExperimentAdminSave(a==='stop');});
