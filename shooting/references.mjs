const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function frameEvidence(value){
 try{const d=JSON.parse(value);if(Array.isArray(d.frames))return d.frames.map(f=>`<p class="reel-text"><strong>${esc(f.time)} сек.</strong> ${esc(f.scene)}${f.text?`<br>На экране: ${esc(f.text)}`:''}</p>`).join('')}catch{}
 return `<p class="reel-text">${esc(value)}</p>`;
}
export function sampleTimes(duration){
 if(!Number.isFinite(duration)||duration<=0||duration>180)throw Error('Для первого разбора нужен ролик до 3 минут.');
 return [...new Set([0.05,0.7,1.5,2.5,4,6,...Array.from({length:10},(_,i)=>duration*(i+1)/11)].filter(t=>t<duration).map(t=>Math.min(duration * 0.999,Math.round(t*100)/100)).filter(t=>t>=0&&t<duration))].sort((a,b)=>a-b);
}
function waitMedia(video,event,action){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>finish(Error('Не удалось прочитать видео. Попробуй MP4 или запись экрана.')),15000);function finish(err){clearTimeout(timer);video.removeEventListener(event,ok);video.removeEventListener('error',bad);err?reject(err):resolve()}const ok=()=>finish(),bad=()=>finish(Error('Браузер не смог открыть видео. Попробуй MP4.'));video.addEventListener(event,ok,{once:true});video.addEventListener('error',bad,{once:true});action()})}
export async function extractFrames(blob){
 const url=URL.createObjectURL(blob),video=document.createElement('video');video.muted=true;video.playsInline=true;video.preload='auto';
 try{
  await waitMedia(video,'loadedmetadata',()=>video.src=url);
  const duration=video.duration,times=sampleTimes(duration),canvas=document.createElement('canvas');
  if(!video.videoWidth||!video.videoHeight)throw Error('В файле нет видеодорожки.');
  const scale=Math.min(1,640/Math.max(video.videoWidth,video.videoHeight));canvas.width=Math.max(1,Math.round(video.videoWidth*scale));canvas.height=Math.max(1,Math.round(video.videoHeight*scale));
  const context=canvas.getContext('2d'),frames=[];
  for(const time of times){await waitMedia(video,'seeked',()=>video.currentTime=time);context.drawImage(video,0,0,canvas.width,canvas.height);frames.push({time,image:canvas.toDataURL('image/jpeg',0.72)})}
  return {duration,frames};
 }finally{video.removeAttribute('src');video.load();URL.revokeObjectURL(url)}
}
export function openReferences({modal,base,token,onSaved}){
 const dialog=modal('<h2>Разобрать рилс</h2><div id="reel-work"></div>'),host=dialog.querySelector('#reel-work');let active=null,closed=false,processing=false;
 const close=()=>{closed=true;dialog.remove()};dialog.addEventListener('close',close,{once:true});
 async function request(path,{body,form,blob=false}={}){
  const r=await fetch(base+'/shooting/references'+path,{method:body||form||blob?'POST':'GET',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},body:form|| (body?JSON.stringify(body):undefined),cache:'no-store',referrerPolicy:'no-referrer'});
  if(!r.ok){let d;try{d=await r.json()}catch{}throw Error(typeof d?.detail==='string'?d.detail:r.status===404?'Серверная часть разбора ещё не подключена.':'Не удалось выполнить запрос. Попробуй ещё раз.')}
  return blob?r.blob():r.json();
 }
 const footer=()=>'<div class="row"><button type="button" data-back>Все разборы</button><button type="button" data-close>Закрыть</button></div>';
 function bind(){host.querySelector('[data-close]')?.addEventListener('click',close);host.querySelector('[data-back]')?.addEventListener('click',home)}
 function fail(message){if(closed)return;const box=host.querySelector('[role=alert]');if(box)box.textContent=message;else{const p=document.createElement('p');p.className='error';p.setAttribute('role','alert');p.textContent=message;host.prepend(p)}}
 function progress(text){if(closed)return;host.innerHTML=`<p role="status">${esc(text)}</p><p class="muted">Сохранённые этапы останутся в списке разборов. Можно закрыть окно и вернуться позже.</p><button type="button" data-close>Закрыть</button>`;bind()}
 async function home(){
  if(closed)return;progress('Загружаем разборы…');
  try{const res=await request('');if(closed)return;
   host.innerHTML=`<p class="muted">Ссылка → разбор → твой угол → сценарий. Без настроек поиска.</p>${res.ready?'':'<p class="error">На сервере ещё не подключены модели для разбора.</p>'}<form id="reel-start"><label>Ссылка на рилс<input name="url" type="url" required maxlength="2000" placeholder="https://www.instagram.com/reel/…"></label><button class="primary" ${res.ready?'':'disabled'}>Разобрать</button></form><p role="alert" class="error"></p><h3>Последние разборы</h3>${res.items.length?res.items.map(r=>`<div class="reel-history"><button type="button" data-ref="${esc(r.id)}">${esc(r.data.analysis?.title||r.data.metadata?.title||r.url)}</button><small class="muted">${r.busy?'В работе':r.data.analysis?'Разбор готов':r.data.transcript?'Речь распознана':'Ожидает видео'}</small></div>`).join(''):'<p class="muted">Здесь появятся сохранённые референсы.</p>'}<button type="button" data-close>Закрыть</button>`;bind();
   host.querySelector('form').onsubmit=async e=>{e.preventDefault();const url=new FormData(e.target).get('url');progress('Сохраняем ссылку…');try{active=await request('',{body:{url}});if(!closed)await open(active,true)}catch(err){await home();fail(err.message)}};
   host.querySelectorAll('[data-ref]').forEach(b=>b.onclick=async()=>{progress('Открываем разбор…');try{active=await request('/'+b.dataset.ref);if(!closed)await open(active)}catch(err){await home();fail(err.message)}});
  }catch(err){if(closed)return;host.innerHTML='<p role="alert" class="error"></p><button type="button" data-retry>Повторить</button><button type="button" data-close>Закрыть</button>';bind();host.querySelector('[data-retry]').onclick=home;fail(err.message)}
 }
 async function open(row,auto=false){
  active=row;if(closed)return;
  if(row.busy){host.innerHTML=`<p>Этот разбор ещё выполняется.</p><button type="button" data-refresh>Обновить состояние</button>${footer()}`;bind();host.querySelector('[data-refresh]').onclick=async()=>{try{await open(await request('/'+row.id))}catch(err){fail(err.message)}};return}
  if(row.data.analysis){showAnalysis();return}
  if(auto){await processVideo();return}showUpload();
 }
 function showUpload(message=''){
  if(closed)return;
  host.innerHTML=`<p><a href="${esc(active.url)}" target="_blank" rel="noopener noreferrer">Открыть исходный рилс</a></p><p class="muted">Попробуем получить видео по ссылке. Если Instagram его не отдаст, выбери файл или запись экрана со звуком. MP4/MOV, до 3 минут и 24 МБ.</p><button type="button" class="primary" data-fetch>${active.data.transcript?'Продолжить разбор':'Получить видео и разобрать'}</button><label>Или загрузи видео<input type="file" accept="video/mp4,video/quicktime,.mp4,.mov" data-file></label><p role="alert" class="error">${esc(message)}</p>${footer()}`;bind();host.querySelector('[data-fetch]').onclick=()=>processVideo();host.querySelector('[data-file]').onchange=e=>{const file=e.target.files[0];if(file)void processVideo(file)};
 }
 async function processVideo(file){
  if(processing||closed)return;processing=true;
  try{
   progress(file?'Читаем видео…':'Получаем видео из Instagram…');const blob=file||await request('/'+active.id+'/media',{blob:true});
   if(closed)return;if(blob.size>24*1024*1024)throw Error('Видео больше 24 МБ. Выбери короткую запись экрана или MP4 до 24 МБ.');
   const digest=await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()),media_sha256=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
   if(active.data.media_sha256&&active.data.media_sha256!==media_sha256)throw Error('Для продолжения нужен тот же файл, из которого уже распознана речь. Загрузи исходный файл ролика.');
   progress('Смотрим первые секунды и ключевые кадры…');const visual=await extractFrames(blob);if(closed)return;
   if(!active.data.transcript){progress('Распознаём речь…');const form=new FormData();form.append('file',blob,'reel.mp4');active=await request('/'+active.id+'/transcribe',{form});if(closed)return}
   progress('Разбираем историю, хук и интригу. Ищем три твоих угла…');active=await request('/'+active.id+'/analyze',{body:{...visual,media_sha256}});if(!closed)showAnalysis();
  }catch(err){if(!closed){try{active=await request('/'+active.id)}catch{}showUpload(err.message)}}finally{processing=false}
 }
 function showAnalysis(){
  if(closed)return;const a=active.data.analysis,m=active.data.metadata||{};
  const sections=[['Что зрителю интересно',a.interest],['Хук: что происходит в начале',a.hook],['Интрига после хука',a.intrigue],['Формат',a.format],['Предположение о механике',a.interpretation],['Что можно перенести',a.transferable],['Чего мы не знаем',a.limitations]];
  host.innerHTML=`<h3>${esc(a.title)}</h3><p><a href="${esc(active.url)}" target="_blank" rel="noopener noreferrer">Исходный рилс</a>${m.uploader?' · '+esc(m.uploader):''}${Number.isFinite(m.view_count)?' · '+esc(m.view_count.toLocaleString('ru'))+' просмотров на момент проверки':''}</p><p class="muted">Разбор речи и выборочных кадров. Причины просмотров — предположения; статистики удержания у нас нет.</p>${sections.map(([t,v])=>`<section><h4>${t}</h4><p class="reel-text">${esc(v)}</p></section>`).join('')}<details><summary>Ход ролика по времени</summary>${a.beats.map(b=>`<p><strong>${esc(b.time)}</strong> ${esc(b.observation)}</p>`).join('')}</details><details><summary>Расшифровка и наблюдения кадров</summary><p class="reel-text">${esc(active.data.transcript?.text)}</p>${frameEvidence(active.data.visual)}${a.speaker_map?.length?'<h4>Кто говорит</h4>'+a.speaker_map.map(x=>`<p class="reel-text"><strong>${esc(x.role)}:</strong> ${esc(x.quote)}<br><span class="muted">${esc(x.evidence)}</span></p>`).join(''):''}</details><h3>Как адаптировать под тебя</h3><label>Пожелание к сценарию — необязательно<textarea id="reel-note" maxlength="3000" rows="2" placeholder="Например: оставить тему отношений и сделать сценку на два голоса"></textarea></label>${a.adaptations.map((x,i)=>`<section class="panel"><h4>${esc(x.title)}</h4><p class="reel-text">${esc(x.angle)}</p><p class="muted">Берём из референса: ${esc(x.borrow)}</p><button type="button" data-choice="${i}">Написать этот сценарий</button></section>`).join('')}<p role="alert" class="error"></p>${Object.entries(active.data.drafts||{}).length?'<h3>Уже подготовленные сценарии</h3>'+Object.entries(active.data.drafts).map(([key,d])=>`<p><button type="button" data-draft="${esc(key)}">${esc(d.script.title)}${d.card_id?' · добавлен в Съёмки':''}</button></p>`).join(''):''}${footer()}`;bind();
  host.querySelectorAll('[data-choice]').forEach(b=>b.onclick=async()=>{const note=host.querySelector('#reel-note').value,choice=Number(b.dataset.choice);progress('Пишем варианты хуков, интриг и тел…');try{const result=await request('/'+active.id+'/script',{body:{choice,note}});active.data.drafts??={};active.data.drafts[result.key]=result.draft;if(!closed)showDraft(result.key)}catch(err){if(!closed){showAnalysis();host.querySelector('#reel-note').value=note;fail(err.message)}}});
  host.querySelectorAll('[data-draft]').forEach(b=>b.onclick=()=>showDraft(b.dataset.draft));
 }
 function showDraft(key){
  if(closed)return;const d=active.data.drafts[key],s=d.script;
  host.innerHTML=`<h3>${esc(s.title)}</h3><p class="reel-text">${esc(s.idea)}</p>${s.blocks.map(b=>`<section><h4>${esc(b.title)}</h4>${b.texts.map((t,i)=>`<p class="reel-text"><strong>Вариант ${i+1}.</strong> ${esc(t)}</p>`).join('')}</section>`).join('')}<details><summary>Заметки и проверка фактов</summary><p class="reel-text">${esc(s.notes)}</p></details><p class="muted">Все варианты добавятся как черновики ИИ. Источник и теги сохранятся; существующие карточки не изменятся.</p><p role="alert" class="error"></p><div class="row"><button type="button" class="primary" data-save>${d.card_id?'Открыть в Съёмках':'Добавить в Съёмки'}</button><button type="button" data-analysis>К разбору</button><button type="button" data-close>Закрыть</button></div>`;bind();host.querySelector('[data-analysis]').onclick=showAnalysis;host.querySelector('[data-save]').onclick=async()=>{const button=host.querySelector('[data-save]');button.disabled=true;try{const card=await request('/'+active.id+'/save',{body:{key}});d.card_id=card.id;if(!closed){close();await onSaved(card)}}catch(err){if(!closed){button.disabled=false;fail(err.message)}}};
 }
 void home();
}
