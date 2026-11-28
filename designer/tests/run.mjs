import {spawnSync} from 'node:child_process';
import {readdirSync,writeFileSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const tests=readdirSync(new URL('./',import.meta.url)).filter(n=>n.endsWith('.test.mjs')).map(n=>'tests/'+n);
const commands=[['--test',...tests],...['geometry','cutting-layout','camera','view-controls','folding-constraints','seal-study','kresling-assembly'].map(n=>[n+'.test.mjs'])];
const results=[];
for(const args of commands){
 const start=performance.now(),run=spawnSync(process.execPath,args,{cwd:root,encoding:'utf8'});
 process.stdout.write(run.stdout??'');process.stderr.write(run.stderr??'');
 results.push({command:['node',...args].join(' '),exitCode:run.status,elapsedMs:Math.round(performance.now()-start)});
 if(run.status!==0){process.exitCode=1;break;}
}
mkdirSync(new URL('../verification/',import.meta.url),{recursive:true});
writeFileSync(new URL('../verification/refactor-checks.json',import.meta.url),JSON.stringify({timestamp:new Date().toISOString(),node:process.version,passed:results.length===commands.length&&results.every(r=>r.exitCode===0),results},null,2));
