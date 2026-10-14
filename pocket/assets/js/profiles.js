// Accounts live on the server. Only theme and unsent cloud mutations use browser storage.
const Profiles = (() => {
  const empty=()=>({attempts:0,correct:0,minutes:0,completed:[]});
  const clean=x=>{x=x||{};const n=v=>Number.isSafeInteger(v)&&v>=0?Math.min(v,10000000):0;const attempts=n(x.attempts);return {attempts,correct:Math.min(n(x.correct),attempts),minutes:n(x.minutes),completed:[...new Set((Array.isArray(x.completed)?x.completed:[]).filter(i=>Number.isInteger(i)&&i>=0&&i<LESSONS.length))]}};
  let storageOK=true,progress=empty(),cloud=null,cache=null,ready=false,configured=false,checking=true,syncing=false,syncError='',admin=false,onChange=()=>{},flushPromise=null;
  const read=(k,f)=>{try{return JSON.parse(localStorage.getItem(k))??f}catch{return f}};
  const write=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));return true}catch{storageOK=false;return false}};
  const api=async(action,data)=>{
    let response;try{response=await fetch('/.netlify/functions/pocket?action='+encodeURIComponent(action),{method:data===undefined?'GET':'POST',credentials:'same-origin',headers:data===undefined?{}:{'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data),signal:AbortSignal.timeout(12000)})}catch{throw Error('Cannot reach the server. Pending signed-in progress stays queued on this device.')}
    if(!response.headers.get('content-type')?.includes('application/json'))throw Error('Cloud accounts activate on the configured Netlify deployment.');
    const result=await response.json();if(!response.ok)throw Error(result.error||'Request failed. Please try again.');return result;
  };
  const announce=()=>onChange();
  const apply=(base,delta)=>clean({attempts:base.attempts+(delta.attempts||0),correct:base.correct+(delta.correct||0),minutes:base.minutes+(delta.minutes||0),completed:[...base.completed,...(delta.completed||[])]});
  const persist=()=>{if(cloud&&cache)write('pocket-pending-'+cloud.id,{queue:cache.queue})};
  async function flush(){
    if(flushPromise)return flushPromise;if(!cloud||!cache?.queue.length)return true;
    const who=cloud.id;syncing=true;syncError='';announce();
    flushPromise=(async()=>{try{
      while(cloud?.id===who&&cache.queue.length){const event=cache.queue[0],result=await api('progress',event);if(cloud?.id!==who)return false;cache.queue.shift();cache.base=clean(result.progress);progress=cache.queue.reduce(apply,cache.base);persist()}return true;
    }catch(e){syncError=e.message;return false}finally{syncing=false;flushPromise=null;announce()}})();return flushPromise;
  }
  async function useCloud(user,serverProgress){cloud=user;const saved=read('pocket-pending-'+user.id,{queue:[]});cache={base:clean(serverProgress),queue:Array.isArray(saved.queue)?saved.queue:[]};progress=cache.queue.reduce(apply,cache.base);announce();await flush()}
  return {
    get current(){return cloud?{...cloud,type:'cloud'}:{id:'preview',name:'Guest',type:'guest'}},get state(){return progress},get ready(){return ready},get configured(){return configured},get checking(){return checking},get admin(){return admin},get error(){return syncError},
    get status(){return cloud?(syncError?'Sync paused · retry in Account':syncing?'Saving to cloud…':!storageOK?'Cloud active · offline queue unavailable':'Cloud progress saved'):'Guest preview · progress is temporary'},
    onChange(fn){onChange=fn},
    async init(){try{const c=await api('config');configured=c.configured;ready=c.ready;if(ready){const s=await api('session');admin=s.admin;if(s.user)await useCloud(s.user,s.progress)}}catch{}finally{checking=false;announce()}},
    record(delta){progress=apply(progress,delta);if(cloud){cache.queue.push({...delta,id:crypto.randomUUID()});persist();void flush()}announce()},
    async login(key){if(cloud&&!await flush())throw Error('Retry pending sync before changing accounts.');const s=await api('login',{key:key.trim()});await useCloud(s.user,s.progress)},
    async logout(){if(cloud){if(!await flush())throw Error('There is unsynced progress. Retry sync before signing out.');await api('logout',{});cloud=null;cache=null;progress=empty();syncError='';announce()}},
    async ownerLogin(key){await api('admin-login',{key});admin=true;announce()},
    async ownerLogout(){await api('admin-logout',{});admin=false;announce()},
    async ownerList(){return (await api('admin-list')).users},async issue(name){return await api('admin-create',{name})},async revoke(id){return await api('admin-revoke',{id})},async rotate(id){return await api('admin-rotate',{id})},async rename(id,name){return await api('admin-rename',{id,name})},
    async retry(){if(!await flush())throw Error(syncError)},
    async refresh(){if(!cloud)return;await flush();const s=await api('session');if(!s.user||s.user.id!==cloud.id){syncError='Your session expired or was revoked. Sign in again to sync.';announce();return}cache.base=clean(s.progress);progress=cache.queue.reduce(apply,cache.base);announce()},
    async importProgress(data){if(!cloud)throw Error('Sign in to your cloud account before importing progress.');if(!data||!Number.isInteger(data.attempts)||data.attempts<0||!Number.isInteger(data.correct)||data.correct<0||data.correct>data.attempts||!Number.isInteger(data.minutes)||data.minutes<0||!Array.isArray(data.completed))throw Error('Choose a valid Pocket backup.');const x=clean(data);this.record({attempts:Math.max(0,x.attempts-progress.attempts),correct:Math.max(0,x.correct-progress.correct),minutes:Math.max(0,x.minutes-progress.minutes),completed:x.completed})},
    legacy(){return clean(read('pocket-v1',null))},empty,clean
  };
})();
