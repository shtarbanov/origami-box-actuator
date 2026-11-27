import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {parseArgs} from 'node:util';
const {values}=parseArgs({options:{port:{type:'string',default:'4173'},repository:{type:'boolean',default:false}}});
const root=path.resolve(fileURLToPath(new URL(values.repository?'../':'.',import.meta.url))),port=Number(values.port);
if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid local port.');
createServer(async(req,res)=>{
 try{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(pathname==='/__origami_designer'){
   res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
   res.end(JSON.stringify({schema:'origami-box/local-session/1',root}));return;
  }
  const file=path.resolve(root,'.'+pathname+(pathname.endsWith('/')?'index.html':'')),relative=path.relative(root,file);
  if(relative.startsWith('..')||path.isAbsolute(relative)){res.writeHead(403);res.end();return;}
  const data=await readFile(file);
  res.writeHead(200,{'Cache-Control':'no-store','Content-Type':({'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream'});res.end(data);
 }catch{res.writeHead(404);res.end('Not found');}
}).listen(port,'127.0.0.1',()=>console.log(`Local: http://127.0.0.1:${port}/${values.repository?'designer/':''}`));
