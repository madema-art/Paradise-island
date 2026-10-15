// Read-only preview. Serves the game's GET APIs without permitting notebook writes.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd(), port = Number(process.argv[2]) || 8772;
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css', '.json':'application/json', '.glb':'model/gltf-binary', '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml', '.mp3':'audio/mpeg', '.ogg':'audio/ogg', '.wav':'audio/wav' };
http.createServer((req,res)=>{
  const json=(status,body)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
  if(req.method!=='GET' && req.method!=='HEAD') {json(405,{ok:false,error:'Read-only preview'});return;}
  let pathname;
  try {pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{json(400,{ok:false});return;}
  if(pathname==='/api/notes') {json(200,{ok:true,storePath:'notes/island-notes.json',doc:JSON.parse(fs.readFileSync(path.join(root,'notes/island-notes.json'),'utf8'))});return;}
  if(pathname==='/api/music/playlist') {
    const exts=new Set(['.mp3','.ogg','.wav','.m4a','.flac','.opus']);
    const items=fs.readdirSync(path.join(root,'music')).filter(f=>exts.has(path.extname(f).toLowerCase())).sort().map(f=>({id:f,title:f.replace(/\.[^.]+$/,'').replace(/_/g,' '),src:'music/'+encodeURIComponent(f)}));
    json(200,{ok:true,items});return;
  }
  const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end('not found');return;}
  res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});
  if(req.method==='HEAD')res.end();else fs.createReadStream(file).pipe(res);
}).listen(port,'127.0.0.1',()=>console.log(`Read-only Paradise Island preview: http://127.0.0.1:${port}`));
