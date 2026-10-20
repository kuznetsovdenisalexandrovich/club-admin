/* Full-app RF transport. Enable only with the parallel journal runtime. */
(function(root){
'use strict';
function createRFParallelTransport(config){
  const fetcher=config.fetch || root.fetch.bind(root);
  const endpoints=config.endpoints;
  if (!Array.isArray(endpoints)||endpoints.length!==2||new Set(endpoints).size!==2) throw Error('Two distinct endpoints required');
  endpoints.forEach(x=>{const u=new URL(x);if(u.pathname!=='/'||u.search||u.hash||u.username||u.password||(!config.isolated && u.protocol!=='https:'))throw Error('Invalid endpoint');});
  const timeout=config.timeoutMs || 3500;
  let active=0, streak=0, returnBarrier=0;
  const storage=config.storage;const storageKey='club_rf_parallel_route_v2';
  try{const saved=JSON.parse(storage.getItem(storageKey)||'null');if(saved&&[0,1].includes(saved.active)&&Number.isSafeInteger(saved.returnBarrier)&&saved.returnBarrier>=0){active=saved.active;returnBarrier=saved.returnBarrier;}}catch(e){}
  function persist(){try{storage.setItem(storageKey,JSON.stringify({active,returnBarrier}));}catch(e){}}
  async function timed(url,options,healthIndex=null){
    const controller=new AbortController();
    const parent=options && options.signal;
    if(parent && parent.aborted)throw new DOMException('Aborted','AbortError');
    const abort=()=>controller.abort();
    if(parent)parent.addEventListener('abort',abort,{once:true});
    let timer,done=false;
    const started=Date.now();
    const check=async()=>{
      if(done)return;
      if(healthIndex===null || Date.now()-started>=(config.requestTimeoutMs||120000))return abort();
      const alive=await readiness(healthIndex);
      if(done)return;
      if(!alive)return abort();
      timer=setTimeout(check,timeout);
    };
    timer=setTimeout(check,timeout);
    try{return await fetcher(url,{...options,signal:controller.signal});}
    finally{done=true;clearTimeout(timer);if(parent)parent.removeEventListener('abort',abort);}
  }
  async function readiness(index){
    try {
      const r=await timed(endpoints[index]+'/rf/readiness',{cache:'no-store',redirect:'error'});
      if(!r.ok)return null;
      const d=await r.json();
      return d.protocol===2 && d.ready===true && d.node===['selectel','timeweb'][index] && Number.isSafeInteger(d.own_seq) && Number.isSafeInteger(d.peer_seq) ? d : null;
    }catch(e){return null;}
  }
  function remember(response,index){
    const seq=Number(response.headers.get('x-rf-own-seq'));
    if(index===1 && Number.isSafeInteger(seq)&&seq>=0){returnBarrier=Math.max(returnBarrier,seq);persist();}
  }
  async function request(input,options={}){
    if(input instanceof URL)input=input.href;
    if(typeof Request!=='undefined' && input instanceof Request){
      const request=new Request(input,options);
      options={method:request.method,headers:request.headers,mode:request.mode,
        credentials:request.credentials,cache:request.cache,referrer:request.referrer,
        referrerPolicy:request.referrerPolicy,integrity:request.integrity,
        keepalive:request.keepalive,signal:request.signal,
        body:['GET','HEAD'].includes(request.method)?undefined:await request.clone().blob()};
      input=request.url;
    }
    if(typeof input!=='string' || !/^https?:\/\//i.test(input))return fetcher(input,options);
    const u=new URL(input);
    if(!endpoints.includes(u.origin) && !(config.aliases||[]).includes(u.origin))return fetcher(input,options);
    const method=(options.method||'GET').toUpperCase();
    const headers=new Headers(options.headers||{});
    if(config.identity){const identity=config.identity();if(identity.tg_init)headers.set("x-rf-tg-init",identity.tg_init);if(identity.vk_query)headers.set("x-rf-vk-query",identity.vk_query);}
    const mutation=!['GET','HEAD','OPTIONS'].includes(method);
    if(mutation&&!headers.has('Idempotency-Key')){
      if(!root.crypto||!root.crypto.randomUUID)throw Error('Secure operation ID unavailable');
      headers.set('Idempotency-Key',root.crypto.randomUUID());
    }
    const retry=true;
    const path=u.pathname+u.search;
    const send=async i=>{if(i===0&&returnBarrier)headers.set('x-rf-min-timeweb',String(returnBarrier));else headers.delete('x-rf-min-timeweb');const r=await timed(endpoints[i]+path,{...options,headers,redirect:'error'},i);remember(r,i);return r;};
    const original=active;

    let response,error;
    try{response=await send(original);if(![425,502,503,504].includes(response.status))return response;}
    catch(e){error=e;if(options.signal&&options.signal.aborted)throw e;}
    if(!retry){if(error)throw error;return response;}
    const target=1-original;
    const ready=await readiness(target);
    // Returning requires a positive proof that the primary includes reserve writes.
    if(!ready || (target===0 && ready.peer_seq<returnBarrier)) {if(error)throw error;return response;}
    const next=await send(target);
    if(![425,502,503,504].includes(next.status)){active=target;streak=0;persist();if(config.onSwitch)config.onSwitch(active);}
    return next;
  }
  async function considerReturn(){
    if(active!==1)return false;
    const reserve=await readiness(1);
    if(reserve){returnBarrier=Math.max(returnBarrier,reserve.own_seq);persist();}
    const primary=await readiness(0);
    if(!primary||primary.peer_seq<returnBarrier){streak=0;return false;}
    if(++streak<3)return false;
    active=0;streak=0;persist();if(config.onSwitch)config.onSwitch(active);return true;
  }
  return {request,considerReturn,state:()=>({active:['selectel','timeweb'][active],returnBarrier})};
}
if(typeof module==='object'&&module.exports)module.exports={createRFParallelTransport};
else root.createRFParallelTransport=createRFParallelTransport;
})(typeof globalThis==='object'?globalThis:this);

(function(){
 if(window.__rfTransport)return;
 const transport=createRFParallelTransport({
  endpoints:['https://selectel-api.youselllikeagod-magazine.ru','https://kuznetsovdenisalexandrovich-club-backend-3c7e.twc1.net'],
  aliases:['https://api.youselllikeagod-magazine.ru','https://reserve-api.youselllikeagod-magazine.ru','https://club-backend-production-fc7f.up.railway.app'],
  fetch:window.fetch.bind(window),storage:(()=>{try{return localStorage;}catch(e){return null;}})()
 });
 window.__rfTransport=transport;window.fetch=transport.request;
 setInterval(()=>transport.considerReturn().catch(()=>{}),5000);
})();
