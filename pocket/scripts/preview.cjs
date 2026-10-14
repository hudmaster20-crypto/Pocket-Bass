const http=require('http'),fs=require('fs'),path=require('path');
const base=path.resolve(__dirname,'..');
http.createServer((req,res)=>{
  let name;
  try{name=decodeURIComponent(new URL(req.url,'http://localhost').pathname)}catch{res.writeHead(400).end();return}
  if(name==='/')name='/index.html';
  const file=path.resolve(base,'.'+name);
  const assets=path.join(base,'assets')+path.sep;
  if(file!==path.join(base,'index.html')&&!file.startsWith(assets)){res.writeHead(404).end();return}
  fs.readFile(file,(e,data)=>{if(e){res.writeHead(404).end();return}res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':'text/html');res.end(data)});
}).listen(4173,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:4173'));
