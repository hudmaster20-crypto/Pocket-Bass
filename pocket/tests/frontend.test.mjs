import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';

const source=f=>readFileSync(new URL((f==='index.html'?'../index.html':'../assets/js/'+f),import.meta.url),'utf8');
function context(initial={}){
  const storage=new Map(Object.entries(initial));
  const c=vm.createContext({console,crypto:webcrypto,localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},AbortSignal,fetch:async()=>new Response('',{status:404}),setTimeout,clearTimeout});
  vm.runInContext(source('lessons.js')+'\n'+source('core.js')+'\n'+source('profiles.js'),c);
  return {c,storage,run:code=>vm.runInContext(code,c)};
}
test('all major-key spellings and chord qualities remain musically consistent',()=>{
  const {run}=context();run(`for(const k of KEYS)for(let i=0;i<7;i++){const n=SPELLINGS[k][i],root={C:0,D:2,E:4,F:5,G:7,A:9,B:11}[n[0]],alter=n.slice(1)==='#'?1:n.slice(1)==='b'?-1:0;if((root+alter+12)%12!==(KEYS.indexOf(k)+MAJOR[i])%12)throw Error(k+' '+n)};if(chordName(6,'G')!=='Em')throw Error('Incorrect vi');`);
});
test('legacy progress is exportable without creating a local account',()=>{
  const old={attempts:10,correct:7,minutes:20,completed:[0,7],charts:[{title:'Old chart'}]};
  const {run,storage}=context({'pocket-v1':JSON.stringify(old)});
  assert.equal(run('Profiles.state.attempts'),0);assert.equal(run('Profiles.legacy().attempts'),10);assert.equal(run('Profiles.current.type'),'guest');assert.equal(JSON.parse(storage.get('pocket-v1')).charts[0].title,'Old chart');
});
test('guest practice is temporary; account creation and imports require the server',async()=>{
  const f=context();f.run('Profiles.record({attempts:2,correct:1,completed:[0]})');
  assert.equal(f.run('Profiles.state.attempts'),2);assert.equal(f.storage.size,0);
  const reloaded=context(Object.fromEntries(f.storage));assert.equal(reloaded.run('Profiles.state.attempts'),0);
  assert.equal(f.run('typeof Profiles.create'),'undefined');
  await assert.rejects(f.run('Profiles.importProgress({attempts:4,correct:3,minutes:5,completed:[3]})'),/Sign in/);
});
test('16 lessons have substantial explanations and exercises; no library route remains',()=>{
  const {run}=context();assert.equal(run('LESSONS.length'),16);
  for(const l of run('LESSONS')){const words=[l.idea,...l.sections.flat()].join(' ').split(/\s+/).length;assert.ok(words>150,`${l.title}: ${words} words`);assert.equal(l.practice.length,3);assert.ok(l.answer.length>10)}
  assert.ok(!source('app.js').includes("function library("));assert.ok(!source('index.html').includes('Worship library'));
});
test('memory questions always contain exactly one correct choice',()=>{
  const {run}=context();run(`let quizType='Numbers',question=null;for(const type of ['Numbers','Fretboard','Harmony']){quizType=type;for(let i=0;i<100;i++){makeQuestion();if(question.options.length!==4||new Set(question.options).size!==4||!question.options.includes(question.correct))throw Error('Bad quiz')}}`);
});
