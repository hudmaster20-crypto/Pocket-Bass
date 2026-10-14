import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

const cookieName={player:'pocket_player',admin:'pocket_owner'};
const ttl={player:7*86400,admin:3600};
const hash=value=>createHash('sha256').update(value).digest('hex');
const equal=(a,b)=>timingSafeEqual(Buffer.from(hash(a)),Buffer.from(hash(b)));
const blank=()=>({attempts:0,correct:0,minutes:0,completed:[],receipts:[]});
const publicProgress=p=>({attempts:p.attempts,correct:p.correct,minutes:p.minutes,completed:p.completed});
const publicUser=u=>({id:u.id,name:u.name,active:u.active,createdAt:u.createdAt});
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status})};
const uid=value=>typeof value==='string'&&/^[a-f0-9-]{36}$/.test(value);

export function createHandler({store,secret,now=()=>Date.now()}){
  const sign=value=>createHmac('sha256',secret).update('pocket-session-v1:'+value).digest('base64url');
  function token(payload,role){const body=Buffer.from(JSON.stringify({...payload,role,exp:Math.floor(now()/1000)+ttl[role]})).toString('base64url');return body+'.'+sign(body)}
  function session(request,role){
    const cookies=request.headers.get('cookie')||'';
    const value=cookies.split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName[role]+'='))?.slice(cookieName[role].length+1);
    if(!value||value.length>2000)return null;
    const [body,sig,...extra]=value.split('.');if(extra.length||!body||!sig||!equal(sign(body),sig))return null;
    try{const p=JSON.parse(Buffer.from(body,'base64url').toString());return p.role===role&&Number.isFinite(p.exp)&&p.exp>Math.floor(now()/1000)?p:null}catch{return null}
  }
  const cookie=(request,role,value,remove=false)=>`${cookieName[role]}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${remove?0:ttl[role]}${new URL(request.url).protocol==='https:'?'; Secure':''}`;
  const reply=(value,status=200,cookies)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...(cookies?{'Set-Cookie':cookies}:{})}});
  const read=key=>store.get(key,{type:'json',consistency:'strong'});
  async function update(key,mutate){
    for(let tries=0;tries<8;tries++){
      const current=await store.getWithMetadata(key,{type:'json',consistency:'strong'});
      const next=mutate(current?.data??null);
      const result=await store.setJSON(key,next,current?{onlyIfMatch:current.etag}:{onlyIfNew:true});
      if(result.modified)return next;
    }
    fail('Another device is saving. Please retry in a moment.',409);
  }
  async function player(request){const s=session(request,'player');if(!s||!uid(s.id))fail('Sign in with your access key to sync progress.',401);const u=await read('users-'+s.id);if(!u||!u.active||u.version!==s.version)fail('This access key was replaced or revoked. Ask the owner for a new key.',401);return u}
  const owner=request=>{if(!session(request,'admin'))fail('Owner sign-in is required.',401)};
  function validateDelta(data){
    if(!uid(data.id))fail('Invalid progress update ID.');
    const fields=['attempts','correct','minutes'];for(const f of fields)if(data[f]!==undefined&&(!Number.isSafeInteger(data[f])||data[f]<0||data[f]>10000000))fail('Invalid progress values.');
    const completed=data.completed??[];if(!Array.isArray(completed)||completed.length>16||completed.some(n=>!Number.isInteger(n)||n<0||n>=16))fail('Invalid completed lesson.');
    return {id:data.id,attempts:data.attempts||0,correct:data.correct||0,minutes:data.minutes||0,completed};
  }
  async function issueKey(u){
    const key='pkt_'+randomBytes(32).toString('base64url');
    await store.setJSON('keys-'+hash(key),{id:u.id,version:u.version},{onlyIfNew:true});
    return {key,name:u.name,id:u.id};
  }
  return async request=>{
    try{
      const action=new URL(request.url).searchParams.get('action')||'session';
      if(!['GET','POST'].includes(request.method))return reply({error:'Method not allowed.'},405);
      if(action==='config'&&request.method==='GET')return reply({configured:true,ready:secret.length>=32});
      if(secret.length<32)fail('The owner must configure POCKET_ADMIN_KEY with at least 32 characters.',503);
      const readOnly=['session','admin-list'];
      if((readOnly.includes(action)&&request.method!=='GET')||(!readOnly.includes(action)&&request.method!=='POST'))fail('Method not allowed.',405);
      let data={};
      if(request.method==='POST'){
        const origin=request.headers.get('origin');
        if(origin!==new URL(request.url).origin)fail('Requests must come from this site.',403);
        if(!request.headers.get('content-type')?.startsWith('application/json'))fail('JSON is required.',415);
        if(Number(request.headers.get('content-length')||0)>32768)fail('Request is too large.',413);
        const raw=await request.text();if(raw.length>32768)fail('Request is too large.',413);
        try{data=JSON.parse(raw)}catch{fail('Invalid JSON.')}
        if(!data||Array.isArray(data)||typeof data!=='object')fail('Invalid request.');
      }
      if(action==='admin-login'){
        if(typeof data.key!=='string'||data.key.length>512||!equal(data.key,secret))fail('Owner key was not recognized.',401);
        return reply({ok:true},200,cookie(request,'admin',token({},'admin')));
      }
      if(action==='login'){
        if(typeof data.key!=='string'||!/^pkt_[A-Za-z0-9_-]{43}$/.test(data.key))fail('Access key was not recognized.',401);
        const lookup=await read('keys-'+hash(data.key));const u=lookup&&await read('users-'+lookup.id);
        if(!u||!u.active||lookup.version!==u.version)fail('Access key was not recognized. Ask the owner if it was replaced or revoked.',401);
        const p=await read('progress-'+u.id)||blank();
        return reply({user:publicUser(u),progress:publicProgress(p)},200,cookie(request,'player',token({id:u.id,version:u.version},'player')));
      }
      if(action==='logout')return reply({ok:true},200,cookie(request,'player','',true));
      if(action==='admin-logout')return reply({ok:true},200,cookie(request,'admin','',true));
      if(action==='session'){
        let u=null,p=null;try{u=await player(request);p=await read('progress-'+u.id)||blank()}catch(e){if(e.status!==401)throw e}
        return reply({user:u?publicUser(u):null,progress:p?publicProgress(p):null,admin:!!session(request,'admin')});
      }
      if(action==='progress'){
        const u=await player(request),delta=validateDelta(data);
        const result=await update('progress-'+u.id,p=>{
          p=p||blank();if(p.receipts.includes(delta.id))return p;
          const attempts=p.attempts+delta.attempts,correct=p.correct+delta.correct,minutes=p.minutes+delta.minutes;
          if(correct>attempts||attempts>10000000||minutes>10000000)fail('Invalid progress totals.');
          // Keep mutation receipts permanently, so even a delayed offline retry is idempotent.
          return {attempts,correct,minutes,completed:[...new Set([...p.completed,...delta.completed])],receipts:[...p.receipts,delta.id]};
        });return reply({progress:publicProgress(result)});
      }
      if(action.startsWith('admin-'))owner(request);
      if(action==='admin-list'){
        // Filter after listing: this also works with Netlify's local emulator,
        // whose prefix behavior can differ for encoded object names.
        const result=await store.list();
        const records=(await Promise.all(result.blobs.filter(b=>b.key.startsWith('users-')).map(b=>read(b.key)))).filter(Boolean);
        const users=await Promise.all(records.map(async u=>({...publicUser(u),progress:publicProgress(await read('progress-'+u.id)||blank())})));
        users.sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
        return reply({users});
      }
      if(action==='admin-create'){
        if(typeof data.name!=='string'||!data.name.trim()||data.name.trim().length>40)fail('Use a player name from 1 to 40 characters.');
        const u={id:randomUUID(),name:data.name.trim(),active:true,version:1,createdAt:new Date(now()).toISOString()};
        await store.setJSON('users-'+u.id,u,{onlyIfNew:true});return reply(await issueKey(u),201);
      }
      if(action==='admin-rename'){
        if(!uid(data.id)||typeof data.name!=='string'||!data.name.trim()||data.name.trim().length>40)fail('Use a valid account and a name from 1 to 40 characters.');
        const u=await update('users-'+data.id,u=>{if(!u)fail('Player not found.',404);return {...u,name:data.name.trim()}});return reply({user:publicUser(u)});
      }
      if(action==='admin-revoke'||action==='admin-rotate'){
        if(!uid(data.id))fail('Invalid player ID.');
        const u=await update('users-'+data.id,u=>{if(!u)fail('Player not found.',404);return {...u,active:action==='admin-rotate',version:u.version+1}});
        return reply(action==='admin-rotate'?await issueKey(u):{ok:true});
      }
      return reply({error:'Unknown action.'},404);
    }catch(e){return reply({error:e.status?e.message:'Cloud storage is temporarily unavailable. Please retry.'},e.status||503)}
  };
}
