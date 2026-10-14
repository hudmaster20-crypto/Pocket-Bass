import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {randomBytes,randomUUID} from 'node:crypto';
import {BlobsServer} from '@netlify/blobs/server';
import {getStore} from '@netlify/blobs';
import {createHandler} from '../server/access.mjs';

test('installed Netlify Blobs adapter persists accounts, progress, and dashboard summaries',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'pocket-blobs-test-'));
  const server=new BlobsServer({directory,logger:()=>{}});
  try{
    const {port}=await server.start();
    const store=getStore({name:'pocket-test',siteID:'test-site',token:'test-token',apiURL:`http://127.0.0.1:${port}`,consistency:'strong'});
    const secret=randomBytes(32).toString('hex');const handler=createHandler({store,secret});
    async function call(action,data,cookie=''){
      const req=new Request('https://pocket.example/.netlify/functions/pocket?action='+action,{method:data===undefined?'GET':'POST',headers:{Origin:'https://pocket.example','Content-Type':'application/json',Cookie:cookie},body:data===undefined?undefined:JSON.stringify(data)});
      const response=await handler(req);return {status:response.status,json:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
    }
    const admin=await call('admin-login',{key:secret});assert.equal(admin.status,200);
    const created=await call('admin-create',{name:'Integration player'},admin.cookie);assert.equal(created.status,201,JSON.stringify(created.json));
    const login=await call('login',{key:created.json.key});assert.equal(login.status,200);
    const event={id:randomUUID(),attempts:1,correct:1,minutes:2,completed:[8]};
    assert.equal((await call('progress',event,login.cookie)).status,200);
    assert.equal((await call('progress',event,login.cookie)).json.progress.attempts,1);
    const secondDevice=await call('login',{key:created.json.key});assert.equal(secondDevice.json.progress.minutes,2);
    const list=await call('admin-list',undefined,admin.cookie);assert.equal(list.json.users?.length,1,JSON.stringify({response:list.json,all:await store.list()}));assert.equal(list.json.users[0].progress.completed[0],8);
  }finally{
    await server.stop();const absolute=resolve(directory);if(!absolute.startsWith(resolve(tmpdir())+sep)||!absolute.includes('pocket-blobs-test-'))throw Error('Unexpected temporary path');await rm(absolute,{recursive:true,force:true});
  }
});
