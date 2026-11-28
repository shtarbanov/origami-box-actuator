import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {newIntent,applyCommand} from '../intent/model.mjs';
import {interpretText} from '../intent/text.mjs';
import {resolveIntent} from '../constraints/resolve.mjs';
import {call} from '../api/client.mjs';
const solve=i=>resolveIntent(i,{ranges:false});
const act=(i,c)=>applyCommand(i,c);
test('one box has no kind selection; a width relation and removed wall resolve dependent rise',()=>{
 const original=newIntent(),copy=structuredClone(original);
 let i=act(original,{type:'add-block',op:'width-ratio',value:.8});
 i=act(i,{type:'toggle-wall',side:'left'});const r=solve(i);
 assert.equal(r.status,'resolved');assert.equal(r.values.rearWidth,48);assert.equal(r.values.rearRise,25.6);
 assert.equal(r.roles.rearRise.role,'dependent');assert.equal(r.spec.walls.left,false);
 assert.equal(r.blockStates['initial-rise'].active,false);assert.deepEqual(original,copy);
 assert.ok(!Object.hasOwn(r.spec,'kind'));
});
test('explicit conflicting ratios explain the exact source blocks and do not change a fixed value',()=>{
 let i=newIntent();i=act(i,{type:'add-block',op:'width-ratio',value:.8});i=act(i,{type:'add-block',op:'rise-ratio',value:.5});i=act(i,{type:'toggle-wall',side:'left'});
 const r=solve(i);assert.equal(r.status,'conflict');assert.equal(r.conflicts[0].code,'HINGE_RATIO_CONFLICT');
 assert.equal(r.conflicts[0].blockIds.length,3);
 let fixed=act(newIntent(),{type:'add-block',op:'lock',field:'frontWidth'});
 fixed=act(fixed,{type:'set-value',field:'frontWidth',value:80});const f=solve(fixed);
 assert.equal(f.status,'conflict');assert.equal(f.conflicts[0].code,'LOCK_CONFLICT');assert.ok(f.conflicts[0].blockIds.includes(fixed.blocks.at(-1).id));
});
test('restoring a wall and removing a shape condition restore their neutral geometry',()=>{
 let i=act(newIntent(),{type:'add-block',op:'width-ratio',value:.8});i=act(i,{type:'toggle-wall',side:'left'});
 let r=solve(i);i=r.intent;
 i=act(i,{type:'remove-block',id:'initial-rise'});i=act(i,{type:'toggle-wall',side:'left'});r=solve(i);
 assert.equal(r.status,'resolved');assert.equal(r.roles.rearRise.role,'dependent');assert.equal(r.values.rearRise,32);
 const widthBlock=i.blocks.find(b=>b.op==='width-ratio');r=solve(act(r.intent,{type:'remove-block',id:widthBlock.id}));
 assert.equal(r.roles.rearWidth.role,'dependent');assert.equal(r.values.rearWidth,60);
});
test('relation order does not change generated geometry',()=>{
 let i=act(newIntent(),{type:'add-block',op:'width-ratio',value:.8});i=act(i,{type:'add-block',op:'tilt',value:-10});
 const a=solve(i),b=solve(act(i,{type:'reorder',ids:i.blocks.map(b=>b.id).reverse()}));
 assert.equal(a.status,'resolved');assert.deepEqual(a.spec,b.spec);
 assert.deepEqual(call('design.build',{spec:a.spec}),call('design.build',{spec:b.spec}));
});
test('both walls removed and conflicting equality/tilt are diagnosed',()=>{
 let i=act(newIntent(),{type:'toggle-wall',side:'left'});i=act(i,{type:'toggle-wall',side:'right'});
 assert.equal(solve(i).conflicts[0].code,'NO_FOLDING_WALL');
 i=act(newIntent(),{type:'add-block',op:'equal-rise'});i=act(i,{type:'add-block',op:'tilt',value:10});
 const r=solve(i);assert.equal(r.conflicts[0].code,'TILT_RISE_CONFLICT');assert.equal(r.conflicts[0].blockIds.length,2);
});
test('direct edits change a free ratio; a pinned ratio and fixed front dimension explain a conflict',()=>{
 let i=act(newIntent(),{type:'add-block',op:'width-ratio',value:.8});let r=solve(i);
 r=solve(act(r.intent,{type:'direct-dimension',field:'rearWidth',value:42}));
 assert.equal(r.values.frontWidth,60);assert.equal(r.values.rearWidth,42);assert.equal(r.intent.blocks.find(b=>b.op==='width-ratio').value,.7);
 i=act(r.intent,{type:'toggle-block-lock',id:r.intent.blocks.find(b=>b.op==='width-ratio').id});i=act(i,{type:'add-block',op:'lock',field:'frontWidth'});
 r=solve(act(i,{type:'direct-dimension',field:'rearWidth',value:50}));assert.equal(r.status,'conflict');
});
test('a ratio conflicting with two fixed widths cites both fixed dimensions',()=>{
 let i=act(newIntent(),{type:'add-block',op:'width-ratio',value:.8});i=solve(i).intent;
 i=act(i,{type:'add-block',op:'lock',field:'frontWidth'});i=act(i,{type:'add-block',op:'lock',field:'rearWidth'});
 const link=i.blocks.find(b=>b.op==='width-ratio'),r=solve(act(i,{type:'update-block',id:link.id,value:.7}));
 assert.equal(r.status,'conflict');assert.equal(r.conflicts[0].blockIds.length,3);
});
test('a direct connection can derive a free width ratio from required rise conditions',()=>{
 let i=act(newIntent(),{type:'add-block',op:'rise-ratio',value:.7});i=act(i,{type:'toggle-wall',side:'left'});
 const r=solve(i);assert.equal(r.status,'resolved');assert.equal(r.values.rearWidth,42);assert.equal(r.values.rearRise,22.4);
 assert.equal(r.blockStates['initial-width'].active,false);
});
test('tilt, rise ratio and a fixed rise can derive length instead of reporting a false conflict',()=>{
 let i=act(newIntent(),{type:'add-block',op:'rise-ratio',value:.5});i=act(i,{type:'add-block',op:'lock',field:'frontRise'});i=act(i,{type:'add-block',op:'tilt',value:-10});
 const r=solve(i);assert.equal(r.status,'resolved');assert.ok(Math.abs(r.values.length-16/Math.sin(10*Math.PI/180))<1e-8);
 assert.equal(r.roles.length.role,'dependent');assert.equal(r.roles.frontRise.role,'fixed');
 const fixed=act(i,{type:'add-block',op:'lock',field:'length',value:75});const c=solve(fixed);
 assert.equal(c.status,'conflict');assert.equal(c.conflicts[0].blockIds.length,4);
});
test('ranges update with geometry and their tested boundaries reject inadmissible neighbors',()=>{
 const a=resolveIntent(newIntent()),i=act(a.intent,{type:'set-value',field:'frontWidth',value:80}),b=resolveIntent(i);
 assert.ok(a.fields.find(f=>f.id==='frontRise').range.max<61);
 assert.ok(b.fields.find(f=>f.id==='frontRise').range.max>79);
 const maximum=a.fields.find(f=>f.id==='gap').range.max;
 assert.equal(solve(act(a.intent,{type:'set-value',field:'gap',value:maximum+.02})).status,'conflict');
 assert.equal(a.fields.find(f=>f.id==='rearWidth').role,'dependent');
});
test('controlled language and blocks share the same solver; unknown text is atomic',()=>{
 const i=newIntent(),parsed=interpretText(i,'rear width 0.8 times front width; remove left wall');
 assert.ok(parsed.ok);assert.equal(solve(parsed.intent).values.rearRise,25.6);
 const unknown=interpretText(i,'front width 70 mm; make it magical');assert.equal(unknown.ok,false);assert.ok(!unknown.intent);assert.deepEqual(i,newIntent());
 const dimensions=interpretText(i,'front width 70 mm; rear width 50 mm');const r=solve(dimensions.intent);
 assert.equal(r.status,'resolved');assert.equal(r.values.frontWidth,70);assert.equal(r.values.rearWidth,50);
 assert.equal(r.roles.frontWidth.role,'fixed');
});
test('project roundtrip retains blocks, fixed values and engine-generated geometry',()=>{
 let i=act(newIntent(),{type:'add-block',op:'lock',field:'length'});i=solve(i).intent;
 const project=call('intent.export',{intent:i}),loaded=call('intent.open',{project:JSON.parse(JSON.stringify(project))});
 assert.equal(loaded.status,'resolved');assert.deepEqual(loaded.intent,i);
 const altered=structuredClone(project);altered.design.reference[0].pointsMm[0][0]+=.01;
 assert.throws(()=>call('intent.open',{project:altered}),e=>e.issues[0].code==='PROJECT_MISMATCH');
});
test('interpreter has no engine/UI imports; editor has no type selector',async()=>{
 for(const name of await readdir(new URL('../intent/',import.meta.url))){const source=await readFile(new URL('../intent/'+name,import.meta.url),'utf8');assert.ok(!/from ['"].*(kernel|ui|constraints)\//.test(source));}
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');assert.ok(!/id="preset"|Tapered footprint|<option.*Hinge/.test(html));
});
