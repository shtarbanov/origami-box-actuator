import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {handleRequest} from '../api/dispatch.mjs';
import {API_VERSION} from '../api/protocol.mjs';
import {createDesignSession} from '../ui/design-session.mjs';
import {createInputDebounce} from '../ui/dom-utils.mjs';
import {createFabricationPlayer} from '../ui/fabrication-player.mjs';
import {fabricationGuide,fabricationPose,defaultSpec} from '../kernel/index.mjs';
const call=async(method,payload={})=>{const r=handleRequest({apiVersion:API_VERSION,method,payload});if(!r.ok)throw Error(r.errors[0].message);return r.value;};
async function setup(){
 const catalog=await call('intent.describe'),saved=new Map(),storage={getItem:k=>saved.get(k),setItem:(k,v)=>saved.set(k,v)},controller={build:async(spec,paper)=>({spec,paper}),import:async s=>s};
 const session=createDesignSession({call,controller,catalog,storage});await session.start();return {session,storage,catalog,controller};
}
test('design session works without DOM, guide, camera or a renderer; undo/redo/save retain intent',async()=>{
 const {session,storage,catalog,controller}=await setup(),initial=structuredClone(session.state.intent);
 await session.command({type:'set-value',field:'frontWidth',value:80},'width');assert.equal(session.state.validReport.values.frontWidth,80);
 await session.travel('undo');assert.deepEqual(session.state.intent,initial);
 await session.travel('redo');assert.equal(session.state.validReport.values.frontWidth,80);
 const project=await session.export();await session.newDesign();assert.equal(session.state.validReport.values.frontWidth,60);
 await session.open(project);assert.equal(session.state.validReport.values.frontWidth,80);
 const reloaded=createDesignSession({call,controller,catalog,storage});await reloaded.start();assert.deepEqual(reloaded.state.intent,session.state.intent);
});
test('independent mode leases block edits and release exactly once, without losing design values',async()=>{
 const {session}=await setup(),before=structuredClone(session.state.intent),a=session.lock(),b=session.lock();
 assert.equal(await session.command({type:'set-value',field:'frontWidth',value:90}),false);a();a();
 assert.equal(await session.command({type:'set-value',field:'frontWidth',value:90}),false);assert.deepEqual(session.state.intent,before);
 b();await session.command({type:'set-value',field:'frontWidth',value:90});assert.equal(session.state.validReport.values.frontWidth,90);
});
test('failed project import preserves the last valid model, and returned guide metadata is isolated',async()=>{
 const {session}=await setup(),previous=structuredClone(session.state.validReport);
 await session.open({schema:'origami-box/project/1'});assert.equal(session.state.phase,'error');assert.deepEqual(session.state.validReport,previous);
 const guide=fabricationGuide(defaultSpec()),duration=guide.stages[1].transition.durationMs;
 guide.stages[1].transition.durationMs=1;assert.equal(fabricationGuide(defaultSpec()).stages[1].transition.durationMs,duration);
 const pose=fabricationPose(defaultSpec(),{stageId:'half-fold'});pose.stage.transition.durationMs=2;assert.equal(fabricationGuide(defaultSpec()).stages[1].transition.durationMs,duration);
});
test('queued commands stay cumulative; gesture rejection keeps the valid design and paper is separate',async()=>{
 const {session}=await setup();
 await Promise.all([session.command({type:'set-value',field:'frontWidth',value:90}),session.command({type:'set-value',field:'length',value:100})]);
 assert.equal(session.state.validReport.values.frontWidth,90);assert.equal(session.state.validReport.values.length,100);
 const before=structuredClone(session.state.intent),gesture={request:command=>({intent:before,command})};
 await session.command({type:'direct-dimension',field:'frontWidth',value:1},'drag-test',gesture);
 assert.equal(session.state.phase,'rejected');assert.deepEqual(session.state.intent,before);
 await session.setPaper('A3');assert.equal(session.state.bundle.paper,'A3');assert.equal(session.state.validReport.values.frontWidth,90);
});
test('pending parameter input flushes once before another feature acquires the editor',async()=>{
 const debounce=createInputDebounce(),values=[];debounce.schedule(()=>values.push(1),1000);debounce.schedule(()=>values.push(2),1000);
 debounce.flush();assert.deepEqual(values,[2]);debounce.flush();assert.deepEqual(values,[2]);
 debounce.schedule(()=>values.push(3),1000);debounce.cancel();assert.deepEqual(values,[2]);
});
test('a new kernel-defined guide stage needs no GUI stage names, operation cases or new order logic',async()=>{
 const ids=['stencil','an-unfamiliar-motion','new-closure-method'],requests=[];let clock=0;
 const invoke=async(method,payload)=>{
  requests.push([method,payload]);if(method==='fabrication.describe')return {supported:true,stages:ids.map(id=>({id,operation:'future-operation',title:id,instruction:id,transition:{durationMs:750}}))};
  if(method==='fabrication.validate')return {numericalPass:true};return {state:payload.state,panels:[]};
 };
 const player=createFabricationPlayer(invoke,()=>{},{nextFrame:async()=>clock+=250});await player.open({});await player.step(1);await player.step(1);assert.equal(player.state.pose.state.stageId,ids[2]);
 await player.step(-1);assert.equal(player.state.pose.state.stageId,ids[1]);
 assert.ok(requests.some(([m,p])=>m==='fabrication.pose'&&p.state.progress>0&&p.state.progress<1));
});
test('kernel animates the sealer press and bond, and attaches a rigid hollow stepped inlet',()=>{
 const spec=defaultSpec(),sample=(id,progress)=>fabricationPose(spec,{stageId:id,progress});
 for(const id of ['long-seal','front-seal','rear-seal']){
  const a=sample(id,0),b=sample(id,.5),c=sample(id,1);assert.equal(a.action.pressFraction,0);assert.equal(b.action.pressFraction,1);assert.equal(c.action.pressFraction,0);
  assert.equal(a.action.bondFraction,0);assert.equal(c.action.bondFraction,1);
  assert.equal(b.meshes.find(m=>m.id==='upper-jaw').verticesMm[0][2],.25);
 }
 const a=sample('inlet',0),b=sample('inlet',1),mesh=p=>p.meshes.find(m=>m.id==='inlet');
 assert.ok(a.details[0].framePointsMm.length>0);assert.deepEqual(a.details[0].framePointsMm,b.details[0].framePointsMm);
 assert.ok(mesh(a).verticesMm[0][2]>mesh(b).verticesMm[0][2]);
 const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
 for(let i=0;i<mesh(a).verticesMm.length;i+=5)for(let j=i+1;j<mesh(a).verticesMm.length;j+=11)assert.ok(Math.abs(distance(mesh(a).verticesMm[i],mesh(a).verticesMm[j])-distance(mesh(b).verticesMm[i],mesh(b).verticesMm[j]))<1e-7);
 assert.ok(mesh(b).bore.radiusMm>0);assert.equal(mesh(b).faces.length,192);
 assert.ok(sample('rear-seal',1).meshes.some(m=>m.id==='inlet'));
});
test('feature implementations have no imports of one another; the entry only wires ports',async()=>{
 const root=new URL('../ui/',import.meta.url),names=['parameter-feature','viewport-feature','actuation-feature','fabrication-feature','project-feature'];
 for(const name of names){const source=await fs.readFile(new URL(name+'.mjs',root),'utf8');assert.ok(!/from ['"][^'"]*(?:block-app|(?:parameter|viewport|actuation|fabrication|project)-feature)\.mjs['"]/.test(source),name);}
 const session=await fs.readFile(new URL('design-session.mjs',root),'utf8');assert.ok(!/\b(document|window|HTMLElement|localStorage|sessionStorage)\b/.test(session));
 const entry=await fs.readFile(new URL('block-app.mjs',root),'utf8');assert.ok(entry.split('\n').length<80);assert.ok(!/innerHTML|addEventListener|Math\.(sin|cos)/.test(entry));
 const player=await fs.readFile(new URL('fabrication-player.mjs',root),'utf8');assert.ok(!/half-fold|long-seal|inward-fold|operation\s*===/.test(player));
});
