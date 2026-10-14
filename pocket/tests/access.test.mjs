import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createHandler} from '../server/access.mjs';

class Store{
  data=new Map();revision=0;
  async get(key){return structuredClone(this.data.get(key)?.data??null)}
  async getWithMetadata(key){return structuredClone(this.data.get(key)??null)}
  async setJSON(key,data,condition={}){const old=this.data.get(key);if((condition.onlyIfNew&&old)||(condition.onlyIfMatch&&condition.onlyIfMatch!==old?.etag))return {modified:false};const etag=String(++this.revision);this.data.set(key,{data:structuredClone(data),etag});return {modified:true,etag}}
  async list({prefix=''}={}){return {blobs:[...this.data.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key}))}}
}
const SECRET='test-only-owner-secret-with-48-randomish-characters';
function fixture(){const store=new Store();let now=1000000000000;const handler=createHandler({store,secret:SECRET,now:()=>now});const call=async(action,body,cookie='',options={})=>{const request=new Request('https://pocket.example/.netlify/functions/pocket?action='+action,{method:body===undefined?'GET':'POST',headers:{...(body!==undefined?{'Content-Type':'application/json',Origin:'https://pocket.example'}:{}),Cookie:cookie,...options.headers},body:body===undefined?undefined:JSON.stringify(body)});const r=await handler(request);return {status:r.status,json:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]||'',headers:r.headers}};return {store,call,advance:ms=>{now+=ms}}}
async function owner(f){const r=await f.call('admin-login',{key:SECRET});assert.equal(r.status,200);return r.cookie}
async function player(f,admin,name='Alex'){const issued=await f.call('admin-create',{name},admin);assert.equal(issued.status,201);const logged=await f.call('login',{key:issued.json.key});return {...issued.json,cookie:logged.cookie}}

test('configuration, owner authorization, invalid keys, origin and session-cookie protection',async()=>{
  const f=fixture();assert.deepEqual((await f.call('config')).json,{configured:true,ready:true});
  assert.equal((await f.call('admin-create',{name:'No owner'})).status,401);
  assert.equal((await f.call('admin-login',{key:'wrong'})).status,401);
  assert.equal((await f.call('login',{key:'pkt_wrong'})).status,401);
  assert.equal((await f.call('admin-login',{key:SECRET},'',{headers:{Origin:'https://other.example'}})).status,403);
  const result=await f.call('admin-login',{key:SECRET});assert.match(result.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);assert.match(result.headers.get('set-cookie'),/Secure/);
  assert.equal((await f.call('admin-list',undefined,result.cookie+'tamper')).status,401);
  assert.equal(result.headers.get('cache-control'),'no-store');
});
test('players have isolated cloud progress; retries do not double count',async()=>{
  const f=fixture(),admin=await owner(f),a=await player(f,admin,'Alex'),b=await player(f,admin,'Sam');
  const update={id:randomUUID(),attempts:1,correct:1,minutes:2,completed:[0,8]};
  assert.equal((await f.call('progress',update,a.cookie)).status,200);
  assert.equal((await f.call('progress',update,a.cookie)).json.progress.attempts,1);
  assert.equal((await f.call('session',undefined,a.cookie)).json.progress.correct,1);
  assert.equal((await f.call('session',undefined,b.cookie)).json.progress.attempts,0);
  assert.equal((await f.call('progress',{...update,id:randomUUID(),attempts:-1},a.cookie)).status,400);
  assert.equal((await f.call('progress',{id:randomUUID(),completed:[16]},a.cookie)).status,400);
  const keys=[...f.store.data.keys()].filter(k=>k.startsWith('keys-'));assert.equal(keys.length,2);assert.ok(keys.every(k=>!k.includes(a.key)));
});
test('simultaneous writes merge without dropping answers',async()=>{
  const f=fixture(),a=await player(f,await owner(f));
  const results=await Promise.all(Array.from({length:5},()=>f.call('progress',{id:randomUUID(),attempts:1,correct:1},a.cookie)));
  assert.ok(results.every(r=>r.status===200));assert.equal((await f.call('session',undefined,a.cookie)).json.progress.attempts,5);
});
test('revocation invalidates keys and existing sessions; replacement preserves progress',async()=>{
  const f=fixture(),admin=await owner(f),a=await player(f,admin);
  await f.call('progress',{id:randomUUID(),minutes:4,completed:[3]},a.cookie);
  await f.call('admin-revoke',{id:a.id},admin);
  assert.equal((await f.call('login',{key:a.key})).status,401);
  assert.equal((await f.call('progress',{id:randomUUID(),minutes:1},a.cookie)).status,401);
  const rotated=await f.call('admin-rotate',{id:a.id},admin);
  const fresh=await f.call('login',{key:rotated.json.key});assert.equal(fresh.status,200);assert.equal(fresh.json.progress.minutes,4);
  assert.equal((await f.call('login',{key:a.key})).status,401);
});
test('expiry, signout, and fail-closed setup',async()=>{
  const f=fixture(),admin=await owner(f),a=await player(f,admin);
  assert.match((await f.call('logout',{},a.cookie)).headers.get('set-cookie'),/Max-Age=0/);
  f.advance(8*86400*1000);assert.equal((await f.call('session',undefined,a.cookie)).json.user,null);
  assert.equal((await f.call('admin-list',undefined,admin)).status,401);
  const unconfigured=createHandler({store:new Store(),secret:''});const r=await unconfigured(new Request('https://pocket.example/?action=session'));assert.equal(r.status,503);
});
test('developer dashboard can list progress and rename accounts; players cannot',async()=>{
  const f=fixture(),admin=await owner(f),a=await player(f,admin);
  await f.call('progress',{id:randomUUID(),minutes:2,completed:[1]},a.cookie);
  assert.equal((await f.call('admin-list',undefined,a.cookie)).status,401);
  assert.equal((await f.call('admin-rename',{id:a.id,name:'New'},a.cookie)).status,401);
  assert.equal((await f.call('admin-rename',{id:a.id,name:'New'},admin)).status,200);
  const list=(await f.call('admin-list',undefined,admin)).json.users;
  assert.equal(list[0].name,'New');assert.equal(list[0].progress.minutes,2);assert.equal(list[0].progress.completed[0],1);
});
