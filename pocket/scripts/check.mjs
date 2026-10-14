import { readFileSync, existsSync, mkdirSync, copyFileSync, cpSync } from 'node:fs';
import vm from 'node:vm';
const files=['theme.js','lessons.js','core.js','profiles.js','account-ui.js','app.js'];
for(const name of files){const file='assets/js/'+name;new vm.Script(readFileSync(file,'utf8'),{filename:file});}
for(const file of ['index.html','assets/css/style.css','assets/css/upgrade.css','netlify/functions/pocket.mjs','server/access.mjs'])if(!existsSync(file))throw Error('Missing '+file);
const html=readFileSync('index.html','utf8');
for(const [,file] of html.matchAll(/(?:src|href)="(assets\/[^"?#]+)"/g))if(!existsSync(file))throw Error('Broken asset path: '+file);
const context=vm.createContext({});vm.runInContext(readFileSync('assets/js/lessons.js','utf8'),context);
vm.runInContext(`if(LESSONS.length!==16)throw Error('Expected 16 lessons');for(const l of LESSONS){if(l.sections.length<3||l.practice.length<3||!l.answer)throw Error('Incomplete lesson '+l.title)}`,context);
mkdirSync('.netlify/site',{recursive:true});
copyFileSync('index.html','.netlify/site/index.html');
cpSync('assets','.netlify/site/assets',{recursive:true});
// Retain the existing Sites preview build target when working in its checkout.
if(existsSync('.openai/hosting.json')){mkdirSync('dist',{recursive:true});copyFileSync('index.html','dist/index.html');cpSync('assets','dist/assets',{recursive:true});}
console.log('Build ready: root index.html and linked assets verified; 16 lessons. Public output: .netlify/site/');
