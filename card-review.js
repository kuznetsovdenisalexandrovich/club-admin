/* admin-v239: review queue and resumable prepared-card import. */
var cardReview = {active:false, keys:[], index:0, fx:null, generation:0, frames:[], frame:0, busy:false};
function reviewStopFx(){ if(cardReview.fx){cardReview.fx.destroy();cardReview.fx=null;} cardReview.generation++; }
function reviewStart(all){
  var list=typeof visibleCards==='function'?visibleCards().list:cardTypes;
  cardReview.keys=list.filter(function(c){return c.image_url&&(all||c.needs_review);}).map(function(c){return c.key;});
  if(!cardReview.keys.length){alert('В выбранном списке нет карточек для проверки. Измени фильтр или открой ревью всех карт.');return;}
  cardReview.active=true;cardReview.index=0;reviewOpenCurrent();
}
function reviewOpenCurrent(){
  reviewStopFx();cardReview.busy=false;
  if(cardReview.index>=cardReview.keys.length){cardReview.active=false;closeCardEditor();alert('Ревью завершено');return;}
  openCardEditor(cardReview.keys[cardReview.index]);
}
function reviewExit(){cardReview.active=false;reviewStopFx();closeCardEditor();}
function reviewNext(){if(cardReview.busy)return;cardReview.index++;reviewOpenCurrent();}
async function reviewApprove(){
  if(cardReview.busy)return;
  var key=cardReview.keys[cardReview.index],generation=cardReview.generation;cardReview.busy=true;
  document.querySelectorAll('.cr-actions button').forEach(function(b){b.disabled=true;});
  try{
    await cardReviewRequest('/cards/admin/reviewed',{keys:[key],reviewed:true});
    var c=cardTypes.find(function(c){return c.key===key;});if(c)c.needs_review=false;
    if(!cardReview.active||generation!==cardReview.generation)return;
    cardReview.index++;reviewOpenCurrent();
  }catch(e){if(!cardReview.active||generation!==cardReview.generation)return;document.getElementById('cr-status').textContent=e.message;cardReview.busy=false;document.querySelectorAll('.cr-actions button').forEach(function(b){b.disabled=false;});}
}
function reviewHtml(c,idx){
  return '<div class="cr-layout"><div><div class="hfe-scene cr-scene"><div class="hfe-card is-bare" id="cr-card"><div class="hfe-win" id="cr-win"><img id="cr-art" alt=""><div class="cr-shade"></div></div><div class="cr-copy"><b>'+escapeHtmlAdm(c.god||c.title||'')+'</b></div><img class="hfe-frame" id="cr-frame" alt="" hidden></div></div>'
    +'<div class="hfe-nav"><button class="action-btn" onclick="reviewFrame(-1)">‹</button><span id="cr-frame-label">Подбираю рамки…</span><button class="action-btn" onclick="reviewFrame(1)">›</button></div>'
    +'<p class="cr-note">Вариант рамки из пула выдачи: у каждого выданного экземпляра она может быть другой.</p>'
    +'<button class="action-btn" onclick="openAdminZoom('+jsArg(c.image_full_url||c.image_url)+')">Целый оригинал</button><p id="cr-ratio" class="cr-note"></p></div>'
    +'<div><p>'+ (cardReview.index+1)+' / '+cardReview.keys.length+'</p><h3>'+escapeHtmlAdm(c.title||c.key)+'</h3>'
    +'<dl><dt>Редкость</dt><dd>'+escapeHtmlAdm(RARITY_LABELS[c.rarity]||c.rarity)+'</dd><dt>Коллекция / сезон</dt><dd>'+escapeHtmlAdm((c.set_key||'Без коллекции')+' / '+(c.series_key||'Без сезона'))+'</dd><dt>Вес / баллы</dt><dd>'+Number(c.weight||0)+' / '+Number(c.effect_points||0)+'</dd><dt>Эффект</dt><dd>'+escapeHtmlAdm(({points:'Баллы',content:'Контент',reward:'Награда'})[c.effect_type]||c.effect_type||'Баллы')+'</dd><dt>Выдача</dt><dd>'+(c.active?'Включена':'Выключена')+'</dd></dl>'
    +'<p id="cr-holo" class="cr-note"></p><div class="cr-actions"><button class="popup-save" id="cr-approve" onclick="reviewApprove()">Одобрить</button><button class="action-btn" onclick="editCardType()">Редактировать</button><button class="action-btn" onclick="openHoloForCard('+jsArg(c.key)+')">Перелив</button><button class="action-btn" onclick="reviewNext()">Позже</button><button class="action-btn" onclick="reviewExit()">Закончить ревью</button></div><p class="cr-note">Одобрение отмечает проверку. Включение выдачи остаётся отдельной настройкой карты.</p><div id="cr-status" role="status"></div></div></div>';
}
async function reviewMount(c){
  reviewStopFx();var gen=cardReview.generation;cardReview.frames=[];cardReview.frame=0;
  var img=document.getElementById('cr-art');if(!img)return;
  img.onload=function(){if(gen!==cardReview.generation)return;var ratio=img.naturalWidth/img.naturalHeight,target=.7815/(.8347*4/3);var loss=1-Math.min(ratio/target,target/ratio);document.getElementById('cr-ratio').textContent='Оригинал '+img.naturalWidth+' × '+img.naturalHeight+'. В рамке обрезается примерно '+Math.round(loss*100)+'% площади. Пропорции сохраняются.';};
  img.src=c.image_full_url||c.image_url;
  try{
    var data=await Promise.all([cardReviewRequest('/cards/admin/frame-candidates?rarity='+encodeURIComponent(c.rarity)+'&season_key='+encodeURIComponent(c.series_key||'')+'&style='+encodeURIComponent(c.style||'dark')),cardReviewRequest('/cards/admin/sets'),cardReviewRequest('/cards/admin/series')]);
    if(gen!==cardReview.generation||!document.getElementById('cr-card'))return;
    cardReview.frames=data[0].frames||[];reviewFrame(0);
    var set=(data[1].sets||[]).find(function(s){return s.key===c.set_key;}),season=(data[2].series||[]).find(function(s){return s.key===c.series_key;});
    var holo=c.holo||(set&&set.holo)||(season&&season.holo);
    document.getElementById('cr-holo').textContent=holo&&holo.on?'Перелив: '+holo.pattern+' · '+Math.round(holo.intensity*100)+'%':'Перелив выключен';
    if(holo&&holo.on){cardReview.fx=HoloFX.mount(document.getElementById('cr-win'),Object.assign({},holo),{input:document.getElementById('cr-card'),tiltEl:document.getElementById('cr-card')});}
  }catch(e){if(gen===cardReview.generation&&document.getElementById('cr-status'))document.getElementById('cr-status').textContent='Не удалось собрать превью: '+e.message;}
}
function reviewFrame(delta){
  var frames=cardReview.frames,el=document.getElementById('cr-frame'),card=document.getElementById('cr-card');if(!el||!card)return;
  cardReview.frame=frames.length?(cardReview.frame+delta+frames.length)%frames.length:0;
  var f=frames[cardReview.frame];el.hidden=!f;card.classList.toggle('is-bare',!f);if(f)el.src=f.url;else el.removeAttribute('src');
  document.getElementById('cr-frame-label').textContent=f?'Рамка '+(cardReview.frame+1)+' / '+frames.length:'Подходящих рамок нет';
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
