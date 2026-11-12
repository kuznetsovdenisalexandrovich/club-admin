/* admin-v254: one-screen review, saved frame pools and direct owner delivery. */
var cardReview = {active:false, keys:[], index:0, fx:null, generation:0, frames:[], frame:0, busy:false,
  ready:false, dirty:false, cache:new Map(), grants:{}, state:null, holo:null, own:false, selected:null};
function reviewStopFx(){if(cardReview.fx){cardReview.fx.destroy();cardReview.fx=null;}cardReview.generation++;}
async function reviewStart(all){
  if(cardReview.busy)return;
  if(cardReview.active && cardReview.dirty && !confirm('Начать другую очередь без сохранения текущих правок?'))return;
  if(typeof dashboardTab==='function')dashboardTab('rewards');
  var host=document.getElementById('card-review-workspace');
  host.hidden=false;host.innerHTML='<p class="cr-note">Загружаю очередь карт…</p>';
  document.getElementById('cards-popup-overlay').classList.remove('open');
  cardExpanded=null;cardEditMode=false;
  host.scrollIntoView({block:'start',behavior:'smooth'});
  reviewStopFx();cardReview.active=true;cardReview.busy=true;cardReview.cache.clear();
  var gen=cardReview.generation;
  try{
    var list=await cardReviewRequest('/cards/admin/catalog');
    if(gen!==cardReview.generation)return;
    cardTypes=list;
    cardReview.keys=list.filter(function(c){return c.image_url&&(all||c.needs_review);}).sort(cardAddedCmp).map(function(c){return c.key;});
    cardReview.index=0;cardReview.busy=false;cardReview.dirty=false;
    if(!cardReview.keys.length){cardReview.active=false;host.innerHTML='<p class="cr-note">Все загруженные карты уже проверены.</p>';return;}
    reviewOpenCurrent();
  }catch(e){cardReview.busy=false;cardReview.active=false;host.textContent='Не удалось загрузить очередь: '+e.message;}
}
function reviewData(key){
  if(!cardReview.cache.has(key)){
    var p=cardReviewRequest('/cards/admin/review-state?key='+encodeURIComponent(key));
    cardReview.cache.set(key,p);p.catch(function(){cardReview.cache.delete(key);});
  }
  return cardReview.cache.get(key);
}
function reviewPrefetch(){
  var key=cardReview.keys[cardReview.index+1];
  for(var k of cardReview.cache.keys())if(k!==key&&k!==cardReview.keys[cardReview.index])cardReview.cache.delete(k);
  if(!key)return;
  reviewData(key).catch(function(){});
  var c=cardTypes.find(function(c){return c.key===key;});
  if(c){cardReview.nextImage=new Image();cardReview.nextImage.src=c.image_full_url||c.image_url;}
}
function reviewOpenCurrent(){
  reviewStopFx();cardReview.busy=false;cardReview.ready=false;cardReview.dirty=false;
  var host=document.getElementById('card-review-workspace');
  if(cardReview.index>=cardReview.keys.length){cardReview.active=false;host.innerHTML='<h3>Очередь пройдена</h3><p class="cr-note">Отложенные карты остаются в очереди непроверенных.</p>';renderCardsWidget();return;}
  var c=cardTypes.find(function(c){return c.key===cardReview.keys[cardReview.index];});
  if(!c){cardReview.index++;reviewOpenCurrent();return;}
  host.innerHTML=reviewHtml(c);host.scrollIntoView({block:"start"});reviewMount(c);reviewPrefetch();
}
function reviewExit(){
  if(cardReview.busy)return;
  if(cardReview.dirty&&!confirm('Закончить без сохранения текущих правок?'))return;
  cardReview.active=false;reviewStopFx();cardReview.cache.clear();
  var host=document.getElementById('card-review-workspace');host.hidden=true;host.innerHTML='';renderCardsWidget();
}
function reviewNext(){
  if(cardReview.busy)return;
  if(cardReview.dirty&&!confirm('Отложить карту без сохранения текущих правок?'))return;
  cardReview.index++;reviewOpenCurrent();
}
function reviewLock(value){
  cardReview.busy=value;
  document.querySelectorAll('#card-review-workspace button,#card-review-workspace input,#card-review-workspace select').forEach(function(b){b.disabled=value;});
}
function reviewStatus(text){var el=document.getElementById('cr-status');if(el)el.textContent=text;}
async function reviewSave(approve){
  var key=cardReview.keys[cardReview.index];
  var state=await cardReviewRequest('/cards/admin/review-save',{key:key,revision:cardReview.state.revision,
    holo:cardReview.own?Object.assign({},cardReview.holo):null,
    frame_keys:cardReview.selected===null?null:Array.from(cardReview.selected),approve:approve});
  cardReview.state=state;cardReview.cache.set(key,Promise.resolve(state));cardReview.dirty=false;
  var c=cardTypes.find(function(c){return c.key===key;});if(c){c.needs_review=state.needs_review;c.holo=state.holo;}
}
async function reviewApprove(){
  if(cardReview.busy||!cardReview.ready)return;
  reviewLock(true);reviewStatus('Сохраняю и одобряю…');
  try{await reviewSave(true);cardReview.index++;reviewOpenCurrent();}
  catch(e){reviewLock(false);reviewStatus(e.message+' Правки остались на экране.');}
}
async function reviewSaveDraft(){
  if(cardReview.busy||!cardReview.ready)return;
  reviewLock(true);
  try{await reviewSave(false);reviewStatus('Настройки сохранены. Карта ещё ждёт одобрения.');}
  catch(e){reviewStatus(e.message);}
  finally{reviewLock(false);}
}
async function reviewSendSelf(){
  if(cardReview.busy||!cardReview.ready)return;
  var key=cardReview.keys[cardReview.index];
  if(cardReview.grants[key]&&cardReview.grants[key].done){reviewStatus('Эта карта уже выдана тебе в этом просмотре.');return;}
  reviewLock(true);reviewStatus('Выдаю карту в твоё приложение…');
  var receipt=cardReview.grants[key];
  if(!receipt){
    var storageKey='card-review-grant:'+key;
    try{receipt=JSON.parse(localStorage.getItem(storageKey)||'null');}catch(e){}
    receipt=receipt||{request_id:crypto.randomUUID()};cardReview.grants[key]=receipt;
    try{localStorage.setItem(storageKey,JSON.stringify(receipt));}catch(e){}
  }
  try{
    if(cardReview.dirty)await reviewSave(false);
    await cardReviewRequest('/cards/admin/review-grant-self',{key:key,request_id:receipt.request_id});
    receipt.done=true;
    try{localStorage.removeItem('card-review-grant:'+key);}catch(e){}
    reviewStatus('Карта выдана тебе. Открой её в паке в приложении — без выбора получателя.');
  }catch(e){reviewStatus('Не удалось подтвердить выдачу: '+e.message+'. Можно повторить — дубля не будет.');}
  finally{reviewLock(false);}
}
function reviewReload(){
  if(cardReview.busy)return;
  if(cardReview.dirty&&!confirm('Загрузить сохранённую карту и убрать текущие правки?'))return;
  cardReview.cache.delete(cardReview.keys[cardReview.index]);reviewOpenCurrent();
}
function reviewHtml(c){
  return '<div class="cr-toolbar"><div><strong>Конвейер одобрений</strong><span class="cr-note"> '+(cardReview.index+1)+' / '+cardReview.keys.length+'</span></div><button class="action-btn" onclick="reviewExit()">Закончить</button></div>'
  +'<div class="cr-layout"><div class="cr-preview"><div class="hfe-scene cr-scene"><div class="hfe-card is-bare" id="cr-card"><div class="hfe-win" id="cr-win"><img id="cr-art" alt=""><div class="cr-shade"></div></div><div class="cr-copy"><b>'+escapeHtmlAdm(c.god||c.title||'')+'</b></div><img class="hfe-frame" id="cr-frame" alt="" hidden></div></div>'
  +'<div class="hfe-nav"><button class="action-btn" onclick="reviewFrame(-1)">‹</button><span id="cr-frame-label">Загружаю рамки…</span><button class="action-btn" onclick="reviewFrame(1)">›</button></div>'
  +'<button class="action-btn" onclick="openAdminZoom('+jsArg(c.image_full_url||c.image_url)+')">Оригинал крупно</button><p id="cr-ratio" class="cr-note"></p></div>'
  +'<div class="cr-settings"><h3>'+escapeHtmlAdm(c.title||c.key)+'</h3><p class="cr-note">'+escapeHtmlAdm([RARITY_LABELS[c.rarity]||c.rarity,c.set_key||'Без коллекции',c.series_key||'Без сезона'].join(' · '))+'</p>'
  +'<div id="cr-controls">Загружаю настройки…</div></div></div>'
  +'<div class="cr-footer"><div class="cr-actions"><button class="popup-save" onclick="reviewApprove()" disabled>Одобрить и следующая</button><button class="action-btn" onclick="reviewSaveDraft()" disabled>Сохранить настройки</button><button class="action-btn" onclick="reviewSendSelf()" disabled>Выдать себе</button><button class="action-btn" onclick="reviewNext()">Позже</button><button class="action-btn" onclick="reviewReload()">Обновить карту</button></div><p class="cr-note">Одобрение не меняет включение карты в выдачу. Выбранные рамки применяются к новым экземплярам.</p><div id="cr-status" role="status" aria-live="polite"></div></div>';
}
async function reviewMount(c){
  var gen=cardReview.generation;cardReview.frames=[];cardReview.frame=0;
  var img=document.getElementById('cr-art');if(!img)return;
  img.onload=function(){if(gen!==cardReview.generation)return;document.getElementById('cr-ratio').textContent='Оригинал '+img.naturalWidth+' × '+img.naturalHeight;};
  img.src=c.image_full_url||c.image_url;
  try{
    var state=await reviewData(c.key);
    if(gen!==cardReview.generation||!cardReview.active)return;
    cardReview.state=state;cardReview.frames=state.frames||[];
    cardReview.selected=state.frame_keys===null?null:new Set(state.frame_keys);
    cardReview.own=!!state.holo;
    var base=state.holo||state.inherited_holo;
    cardReview.holo=HoloFX.normalize(base||Object.assign(HoloFX.defaults('lines'),{on:false}));
    cardReview.holo.on=!!(base&&base.on);
    cardReview.frame=Math.max(0,cardReview.frames.findIndex(function(f){return cardReview.selected===null||cardReview.selected.has(f.key);}));
    reviewControls();reviewFrame(0);reviewApply(false);cardReview.ready=true;reviewLock(false);
  }catch(e){if(gen===cardReview.generation)reviewStatus('Не удалось загрузить карту: '+e.message+'. Нажми «Обновить карту».');}
}
function reviewControls(){
  var S=cardReview.holo;
  var h='<div class="hfe-h">Допустимые рамки</div><label class="hfe-on"><input type="checkbox" id="cr-auto-frames" '+(cardReview.selected===null?'checked':'')+' onchange="reviewAutoFrames(this.checked)">Все подходящие рамки</label><p class="cr-note" id="cr-frame-count"></p><div class="cr-frame-grid" id="cr-frame-grid"></div>'
   +'<div class="hfe-h">Перелив</div><label class="hfe-on"><input type="checkbox" id="cr-holo-on" '+(S.on?'checked':'')+' onchange="reviewHoloOn(this.checked)">Включён</label><p class="cr-note" id="cr-holo-source"></p><div class="hfe-pats" id="cr-patterns"></div>';
  HOLO_GROUPS.forEach(function(g){h+='<details class="cr-holo-group"'+(g[0]==='Сила эффекта'?' open':'')+'><summary>'+g[0]+'</summary>';
    g[1].forEach(function(f){var k=f[0],range=HoloFX.RANGES[k];h+='<div class="hfe-row"><label for="cr-'+k+'">'+f[1]+'</label><output id="cr-'+k+'-out">'+holoFmt(f[2],S[k])+'</output><input type="range" id="cr-'+k+'" min="'+range[1]+'" max="'+range[2]+'" step="'+HOLO_STEP[k]+'" value="'+S[k]+'" oninput="reviewSlide('+jsArg(k)+','+jsArg(f[2])+',this.value)"></div>';});h+='</details>';});
  h+='<label class="hfe-row">Наложение<select id="cr-blend" onchange="reviewBlend(this.value)">'+HOLO_BLEND_NAMES.map(function(o){return '<option value="'+o[0]+'"'+(S.blend===o[0]?' selected':'')+'>'+o[1]+'</option>';}).join('')+'</select></label><button class="action-btn" onclick="reviewInherited()">Перелив как у коллекции / сезона</button>';
  document.getElementById('cr-controls').innerHTML=h;
  var box=document.getElementById('cr-patterns');
  HoloFX.PATTERNS.forEach(function(p){var b=document.createElement('button');b.type='button';b.className='hfe-pat';b.dataset.p=p.id;b.setAttribute('aria-pressed',String(S.pattern===p.id));var canvas=document.createElement('canvas');canvas.width=68;canvas.height=68;b.appendChild(canvas);var label=document.createElement('span');label.textContent=p.name;b.appendChild(label);b.onclick=function(){reviewPattern(p.id);};box.appendChild(b);HoloFX.thumb(canvas,p.id);});
  reviewFrameControls();reviewSource();
}
function reviewSource(){document.getElementById('cr-holo-source').textContent=cardReview.own?'Своя настройка этой карты':'Настройка коллекции / сезона';}
function reviewChanged(){cardReview.dirty=true;reviewStatus('Есть несохранённые правки. «Одобрить» сохранит их и откроет следующую карту.');}
function reviewApply(changed){
  if(changed){cardReview.own=true;reviewChanged();reviewSource();}
  if(!cardReview.holo.on){if(cardReview.fx){cardReview.fx.destroy();cardReview.fx=null;}return;}
  var settings=typeof withClubCardMotion==='function'?withClubCardMotion(cardReview.holo):cardReview.holo;
  if(cardReview.fx)cardReview.fx.set(settings);
  else cardReview.fx=HoloFX.mount(document.getElementById('cr-win'),settings,{input:document.getElementById('cr-card'),tiltEl:document.getElementById('cr-card')});
}
function reviewSlide(k,kind,v){cardReview.holo[k]=+v;document.getElementById('cr-'+k+'-out').textContent=holoFmt(kind,v);reviewApply(true);}
function reviewHoloOn(on){cardReview.holo.on=on;reviewApply(true);}
function reviewBlend(blend){cardReview.holo.blend=blend;reviewApply(true);}
function reviewPattern(id){var p=HoloFX.PATTERNS.find(function(p){return p.id===id;});if(!p)return;Object.assign(cardReview.holo,{pattern:p.id,scale:p.def.scale,density:p.def.density,angle:p.def.angle,on:true});cardReview.own=true;reviewControls();reviewApply(true);}
function reviewInherited(){var base=cardReview.state.inherited_holo;cardReview.holo=HoloFX.normalize(base||Object.assign(HoloFX.defaults('lines'),{on:false}));cardReview.holo.on=!!(base&&base.on);cardReview.own=false;reviewControls();reviewApply(false);reviewChanged();}
function reviewAutoFrames(auto){cardReview.selected=auto?null:new Set(cardReview.frames.map(function(f){return f.key;}));reviewFrameControls();reviewChanged();}
function reviewToggleFrame(key,on){if(cardReview.selected===null)cardReview.selected=new Set(cardReview.frames.map(function(f){return f.key;}));if(on)cardReview.selected.add(key);else cardReview.selected.delete(key);document.getElementById('cr-auto-frames').checked=false;var i=cardReview.frames.findIndex(function(f){return f.key===key;});if(i>=0){cardReview.frame=i;reviewFrame(0);}reviewFrameControls();reviewChanged();}
function reviewFrameControls(){
  var box=document.getElementById('cr-frame-grid');box.innerHTML='';
  cardReview.frames.forEach(function(f){var label=document.createElement('label');label.className='cr-frame-option';var input=document.createElement('input');input.type='checkbox';input.checked=cardReview.selected===null||cardReview.selected.has(f.key);input.onchange=function(){reviewToggleFrame(f.key,input.checked);};var img=document.createElement('img');img.src=f.url;img.alt=f.key;img.loading='lazy';label.appendChild(input);label.appendChild(img);box.appendChild(label);});
  var count=cardReview.selected===null?cardReview.frames.length:cardReview.selected.size;
  document.getElementById('cr-frame-count').textContent=cardReview.frames.length?'Выбрано '+count+' из '+cardReview.frames.length+'. Новому экземпляру достанется случайная из выбранных.':'Подходящих рамок пока нет — карта будет без рамки.';
}
function reviewFrame(delta){
  var frames=cardReview.frames,el=document.getElementById('cr-frame'),card=document.getElementById('cr-card');if(!el||!card)return;
  cardReview.frame=frames.length?(cardReview.frame+delta+frames.length)%frames.length:0;
  var f=frames[cardReview.frame];el.hidden=!f;card.classList.toggle('is-bare',!f);if(f)el.src=f.url;else el.removeAttribute('src');
  document.getElementById('cr-frame-label').textContent=f?'Примерка '+(cardReview.frame+1)+' / '+frames.length:'Без рамки';
}
async function cardReviewRequest(path,body){
  var r=await fetch(API+path+(path.includes('?')?'&':'?')+'x_admin_token='+encodeURIComponent(ADMIN_TOKEN),body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:undefined);
  var d=await r.json();if(!r.ok)throw new Error(d.detail||'HTTP '+r.status);return d;
}
function cardCompressionOptions(){var e=document.getElementById('pu-compression');return e&&e.value==='original'?{maxFull:2400,quality:.9}:e&&e.value==='small'?{maxFull:1200,quality:.78}:{maxFull:1600,quality:.85};}
async function packEstimateCompression(){
  var out=document.getElementById('pu-size');out.textContent='Считаю размер…';var source=0,encoded=0;
  try{for(var row of packUp){if(row.done)continue;var enc=await cardArtEncode(row.file,cardCompressionOptions());source+=row.file.size;encoded+=(enc.thumb.split(',')[1].length+enc.full.split(',')[1].length)*.75;}out.textContent=(source/1048576).toFixed(1)+' МБ → примерно '+(encoded/1048576).toFixed(1)+' МБ (превью + полные)';}catch(e){out.textContent=e.message;}
}
var preparedCards={rows:[],sets:[],busy:false,generation:0};
async function preparedRead(files){
  if(preparedCards.busy)return;var generation=++preparedCards.generation;document.getElementById('prepared-go').disabled=true;var status=document.getElementById('prepared-status');status.textContent='Проверяю папку и контрольные суммы…';preparedCards.rows=[];
  try{
    var list=Array.from(files),manifest=list.find(function(f){return f.name==='manifest.json';});if(!manifest)throw Error('В папке нет manifest.json');
    var data=JSON.parse(await manifest.text());if(data.version!==1||!Array.isArray(data.cards)||!Array.isArray(data.sets))throw Error('Неизвестный формат манифеста');
    var map=new Map(list.map(function(f){return [f.name,f];})),keys=new Set();
    for(var r of data.cards){
      if(!/^[a-z0-9-]{1,60}$/.test(r.key)||keys.has(r.key))throw Error('Некорректный или повторный ключ карты');keys.add(r.key);
      if(!data.sets.some(function(s){return s.key===r.set_key;})||!['common','uncommon','rare','legendary'].includes(r.rarity)||!['dark','light','special'].includes(r.style)||!r.god)throw Error('Неполные значения карты '+r.key);
      var f=map.get(r.file);if(!f)throw Error('Не найден '+r.file);
      var hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await f.arrayBuffer()))).map(function(b){return b.toString(16).padStart(2,'0');}).join('');
      if(generation!==preparedCards.generation)return;
      if(hash!==r.sha256)throw Error('Файл изменился: '+r.file);preparedCards.rows.push({meta:r,file:f});
    }
    preparedCards.sets=data.sets;
    status.textContent='Готово к загрузке: '+preparedCards.rows.length+' карт, '+data.sets.length+' коллекций. Новые карты выключены до проверки. Повторный запуск продолжает по тем же ключам.';
    document.getElementById('prepared-go').disabled=false;
  }catch(e){if(generation!==preparedCards.generation)return;preparedCards.rows=[];status.textContent=e.message;document.getElementById('prepared-go').disabled=true;}
}
async function preparedUpload(){
  if(preparedCards.busy||!preparedCards.rows.length)return;preparedCards.busy=true;var button=document.getElementById('prepared-go'),status=document.getElementById('prepared-status');button.disabled=true;
  var done=0,skipped=0,failed=[];
  try{
    var catalog=await cardReviewRequest('/cards/admin/catalog'),sets=(await cardReviewRequest('/cards/admin/sets')).sets||[];
    for(var s of preparedCards.sets){if(!sets.some(function(e){return e.key===s.key;}))await cardReviewRequest('/cards/admin/sets',{key:s.key,title:s.title,season_key:s.season_key||'',rarity:s.rarity});}
    for(var row of preparedCards.rows){var r=row.meta;status.textContent=(done+skipped+failed.length+1)+' / '+preparedCards.rows.length+' · '+r.key;
      try{
        var existing=catalog.find(function(c){return c.key===r.key;});
        if(existing&&existing.image_url&&existing.holo){skipped++;continue;}
        if(!existing){await cardReviewRequest('/cards/admin/catalog',{key:r.key,title:r.god,god:r.god,rarity:r.rarity,style:r.style,set_key:r.set_key,series_key:r.series_key||'',weight:r.weight,effect_type:'points',effect_points:r.effect_points,card_class:'regular',active:false,needs_review:true,create_only:true});}
        if(!existing||!existing.image_url){
          var options=cardCompressionOptions(),encoded=await cardArtEncode(row.file,options);
          // Prepared JPEG/PNG is already compressed: preserve its full version when no downsize is requested.
          if(Math.max(r.width||Infinity,r.height||Infinity)<=options.maxFull){encoded.full=await new Promise(function(resolve,reject){var reader=new FileReader();reader.onload=function(){resolve(reader.result);};reader.onerror=reject;reader.readAsDataURL(row.file);});}
          await cardArtPost(r.key,encoded);
        }
        if(!existing||!existing.holo)await cardReviewRequest('/cards/admin/card-holo',{key:r.key,holo:r.holo});
        done++;
      }catch(e){failed.push(r.key+': '+e.message);}
    }
    status.textContent='Загружено '+done+', уже готовы '+skipped+', ошибок '+failed.length+(failed.length?'\n'+failed.join('\n'):'')+'. Карты ждут ревью.';
    await loadCardTypes();
  }catch(e){status.textContent='Не удалось начать: '+e.message;}finally{preparedCards.busy=false;button.disabled=false;}
}
function cardSuggestedHolo(c){
  var h=2166136261;for(var ch of c.key){h=Math.imul(h^ch.charCodeAt(0),16777619)>>>0;}
  var intensity=({common:.12,uncommon:.18,rare:.24,legendary:.30})[c.rarity]||.12;
  return {on:true,pattern:['lines','foil','glitter'][h%3],intensity:Math.round(intensity*(.85+((h>>>8)%31)/100)*1000)/1000,glare:.1,tilt:8,range:18,smooth:.16,angle:[25,35,45,55][(h>>>16)%4],band:35,soft:.45,travel:1.2,blend:c.style==='light'?'soft-light':'color-dodge'};
}
async function reviewRandomizeMissing(button){
  if(button)button.disabled=true;var count=0;
  try{
    var fresh=await cardReviewRequest('/cards/admin/catalog');
    for(var c of fresh){if(c.holo||(c.card_class||'regular')!=='regular'||!c.image_url)continue;
      await cardReviewRequest('/cards/admin/card-holo',{key:c.key,holo:cardSuggestedHolo(c)});
      await cardReviewRequest('/cards/admin/reviewed',{keys:[c.key],reviewed:false});count++;
      if(button)button.textContent='Настроено: '+count;
    }
    await loadCardTypes();alert('Перелив назначен: '+count+'. Карты ждут ревью. Собственные настройки сохранены.');
  }catch(e){alert('Остановлено после '+count+': '+e.message);}finally{if(button){button.disabled=false;button.textContent='Назначить переливы без настройки';}}
}
