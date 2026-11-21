import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const imports=s=>[...s.matchAll(/(?:from\s*|import\s*)['"]([^'"]+)['"]/g)].map(m=>m[1]);
test('kernel imports only kernel; it contains no I/O, UI markup or display palette',async()=>{
 for(const name of await fs.readdir(path.join(root,'kernel'))){if(!name.endsWith('.mjs'))continue;
  const source=await fs.readFile(path.join(root,'kernel',name),'utf8');
  for(const dep of imports(source))assert.ok(dep.startsWith('./')&&!dep.includes('..'),`${name} imports ${dep}`);
  const code=source.replace(/\/\/[^\n]*/g,'');
  assert.ok(!/\b(document|window|sessionStorage|localStorage|fetch|process)\b|<svg|#[0-9a-fA-F]{6}\b/.test(code),name);
 }
});
test('current UI cannot bypass public API to call a solver',async()=>{
 const names=['app.mjs','print.mjs',...(await fs.readdir(path.join(root,'ui'))).filter(n=>n.endsWith('.mjs')).map(n=>'ui/'+n),'adapters/svg.mjs'];
 for(const name of names){const source=await fs.readFile(path.join(root,name),'utf8');
  for(const dep of imports(source))assert.ok(!/kernel|geometry\.mjs|validate\.mjs|mechanism\.mjs|legacy-sheet/.test(dep),`${name} bypasses API via ${dep}`);
 }
});
test('kernel dependency graph has no cycles',async()=>{
 const graph=new Map();for(const name of await fs.readdir(path.join(root,'kernel'))){if(name.endsWith('.mjs'))graph.set(name,imports(await fs.readFile(path.join(root,'kernel',name),'utf8')).map(d=>d.replace('./','')));}
 const done=new Set();function visit(node,stack=new Set()){assert.ok(!stack.has(node),'Dependency cycle: '+[...stack,node].join(' -> '));if(done.has(node))return;const next=new Set([...stack,node]);for(const dep of graph.get(node)||[])visit(dep,next);done.add(node);}
 for(const node of graph.keys())visit(node);
});
