import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {createServer} from 'node:net';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
async function freePort(){const socket=createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));return port;}
async function serve(t,command,args){
 const port=await freePort(),child=spawn(command,[...args,'--port',String(port)],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
 let error='';child.stderr.on('data',s=>error+=s);
 t.after(()=>child.kill());
 let ready=false;
 for(let i=0;i<100;i++){
  if(child.exitCode!==null)throw Error('Server stopped: '+error);
  try{const response=await fetch(`http://127.0.0.1:${port}/__origami_designer`);if(response.ok){ready=true;break;}}catch{}
  await new Promise(resolve=>setTimeout(resolve,25));
 }
 assert.equal(ready,true,error);return `http://127.0.0.1:${port}`;
}
test('local Node server serves modules, identifies the correct checkout and blocks sibling paths',async t=>{
 const url=await serve(t,process.execPath,['server.mjs','--repository']);
 assert.deepEqual(await (await fetch(url+'/__origami_designer')).json(),{schema:'origami-box/local-session/1',root:path.dirname(root.replace(/[\\/]$/,''))});
 const page=await fetch(url+'/designer/');assert.match(await page.text(),/fabrication-toggle/);
 const module=await fetch(url+'/designer/ui/fabrication-player.mjs');assert.match(module.headers.get('content-type'),/javascript/);assert.equal(module.headers.get('cache-control'),'no-store');
 assert.equal((await fetch(url+'/%2e%2e%2fprivate.txt')).status,403);
});
const python=process.platform==='win32'?'python.exe':'python3',pythonAvailable=spawnSync(python,['--version'],{windowsHide:true}).status===0;
test('Python fallback serves the same repository and module MIME without npm packages',{skip:!pythonAvailable},async t=>{
 const url=await serve(t,python,['tools/local_server.py']);
 const session=await (await fetch(url+'/__origami_designer')).json();assert.equal(session.schema,'origami-box/local-session/1');
 assert.equal(path.resolve(session.root),path.dirname(root.replace(/[\\/]$/,'')));
 assert.match(await (await fetch(url+'/designer/')).text(),/Fabrication guide/);
 assert.match((await fetch(url+'/designer/adapters/worker.mjs')).headers.get('content-type'),/javascript/);
});
