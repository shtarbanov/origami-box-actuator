import test from 'node:test';
import assert from 'node:assert/strict';
import {fabricationGuide,fabricationPose,validateFabrication,defaultSpec,evaluatePose} from '../kernel/index.mjs';
import {handleRequest} from '../api/dispatch.mjs';
import {API_VERSION} from '../api/protocol.mjs';
import {createFabricationPlayer} from '../ui/fabrication-player.mjs';
import {fabricationSVG} from '../ui/fabrication-render.mjs';
import {cameraForFrame,frameFromPoints} from '../ui/camera.mjs';
import {defaultView} from '../view-controls.mjs';
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const area=ps=>{
 const sum=[0,0,0];for(let i=0;i<ps.length;i++){
  const a=ps[i],b=ps[(i+1)%ps.length];sum[0]+=a[1]*b[2]-a[2]*b[1];sum[1]+=a[2]*b[0]-a[0]*b[2];sum[2]+=a[0]*b[1]-a[1]*b[0];
 }return Math.hypot(...sum)/2;
};
const call=async(method,payload)=>{const r=handleRequest({apiVersion:API_VERSION,method,payload});if(!r.ok)throw Error(r.errors[0].message);return r.value;};
const clean=pose=>JSON.parse(JSON.stringify(pose));

test('fabrication stages describe actual manufacturing, independent of actuation progress',()=>{
 const s=defaultSpec(),guide=fabricationGuide(s);
 assert.equal(guide.supported,true);
 assert.deepEqual(guide.stages.map(s=>s.id),['layout','half-fold','long-seal','inlet','open-pouch','inward-fold','front-seal','rear-seal']);
 const flat=fabricationPose(s,{stageId:'layout'}),half=fabricationPose(s,{stageId:'half-fold'});
 assert.ok(flat.panels.flatMap(p=>p.pointsMm).every(p=>Math.abs(p[2])<1e-8));
 // Half folding around E-J shifts the top by -2l. It is not the collapsed
 // actuation pose (which has no lateral translation).
 const top=p=>p.panels.find(p=>p.id==='top').pointsMm;
 assert.ok(distance(top(half)[0],top(evaluatePose(s,{mode:'actuation',progress:0}))[0])>40);
 assert.deepEqual(fabricationPose(s,{stageId:'front-seal'}).sealedIds,['long','front']);
 assert.deepEqual(fabricationPose(s,{stageId:'rear-seal'}).sealedIds,['long','front','rear']);
});
test('sampled manufacturing paths preserve distances, area, hinges, closure and matched seals',()=>{
 for(const [W,h,L,g,t] of [[48,48,75,4,.3],[85,30,95,3,0],[120,60,40,5,1],[30,20,10,1,2]]){
  const s=defaultSpec();s.footprint.frontWidth=W;s.footprint.length=L;s.rise.front=h;s.fabrication.hingeGap=g;s.fabrication.panelThickness=t;
  const result=validateFabrication(s,{samples:151});assert.equal(result.numericalPass,true,JSON.stringify(result));
  const guide=fabricationGuide(s),reference=fabricationPose(s,{stageId:'layout'});
  for(const stage of guide.stages)for(const progress of [0,.07,.29,.53,.87,1]){
   const pose=fabricationPose(s,{stageId:stage.id,progress});
   pose.panels.forEach((p,f)=>{
    assert.ok(Math.abs(area(p.pointsMm)-area(reference.panels[f].pointsMm))<1e-7);
    for(let i=0;i<p.pointsMm.length;i++)for(let j=i+1;j<p.pointsMm.length;j++)assert.ok(Math.abs(distance(p.pointsMm[i],p.pointsMm[j])-distance(reference.panels[f].pointsMm[i],reference.panels[f].pointsMm[j]))<1e-7);
    const placement=pose.placements[f];p.pointsMm.forEach((point,i)=>{
     const [x,y]=placement.shapeMm[i],reconstructed=placement.originMm.map((v,k)=>v+placement.rotationRowMajor[k][0]*x+placement.rotationRowMajor[k][1]*y);
     assert.ok(distance(point,reconstructed)<1e-7);
    });
   });
   // One kernel-supplied envelope covers the full arc, not just endpoints.
   const points=[...pose.panels,...pose.film].flatMap(p=>p.pointsMm);
   for(const p of points)for(let i=0;i<3;i++)assert.ok(p[i]>=Math.min(...guide.framePointsMm.map(p=>p[i]))-1e-7&&p[i]<=Math.max(...guide.framePointsMm.map(p=>p[i]))+1e-7);
  }
 }
});
test('all neighboring stages share the exact same rigid-panel endpoints',()=>{
 const s=defaultSpec(),stages=fabricationGuide(s).stages;
 for(let i=1;i<stages.length;i++){
  const a=fabricationPose(s,{stageId:stages[i-1].id}),b=fabricationPose(s,{stageId:stages[i].id,progress:0});
  a.panels.forEach((p,f)=>p.pointsMm.forEach((v,j)=>assert.ok(distance(v,b.panels[f].pointsMm[j])<1e-7)));
 }
});
test('direct-side hinges keep a separate unsupported manufacturing diagnostic',()=>{
 for(const side of ['left','right']){
  const s=defaultSpec();s.rise.front=30;s.walls[side]=false;assert.equal(fabricationGuide(s).supported,false);
  assert.throws(()=>fabricationPose(s,{stageId:'layout'}),{code:'FABRICATION_GUIDE_UNSUPPORTED'});
 }
});
test('fabrication API has strict versioned payloads and never changes the input spec',async()=>{
 const s=defaultSpec(),before=structuredClone(s);
 assert.equal((await call('fabrication.describe',{spec:s})).stages.length,8);
 assert.equal((await call('fabrication.validate',{spec:s,options:{samples:11}})).numericalPass,true);
 for(const state of [{stageId:'missing'},{stageId:'layout',progress:2},{stageId:'layout',progress:NaN},{stageId:'layout',extra:true}])assert.equal(handleRequest({apiVersion:API_VERSION,method:'fabrication.pose',payload:{spec:s,state}}).ok,false);
 assert.equal(handleRequest({apiVersion:API_VERSION,method:'fabrication.validate',payload:{spec:s,options:{mode:'assembly'}}}).ok,false);
 assert.equal(handleRequest({apiVersion:API_VERSION,method:'fabrication.validate',payload:{spec:s,options:{samples:1}}}).ok,false);
 assert.deepEqual(s,before);
});
test('UI player consumes API ordering, reaches every step, reverses exactly and guards rapid clicks',async()=>{
 const updates=[],methods=[];let time=0;
 const player=createFabricationPlayer(async(m,p)=>{methods.push(m);return call(m,p);},state=>updates.push(clean(state)),{nextFrame:async()=>time+=250});
 assert.equal(await player.open(defaultSpec()),true);
 const endpoints=[clean(player.state.pose)];
 for(let i=1;i<8;i++){
  const pending=player.step(1);assert.equal(await player.step(1),false);assert.equal(await pending,true);endpoints.push(clean(player.state.pose));
 }
 assert.equal(await player.step(1),false);
 for(let i=6;i>=0;i--){assert.equal(await player.step(-1),true);assert.deepEqual(clean(player.state.pose),endpoints[i]);}
 assert.equal(await player.step(-1),false);player.close();assert.equal(player.state.active,false);
 assert.ok(methods.every(m=>m.startsWith('fabrication.')));
 assert.ok(updates.some(s=>s.busy&&s.pose?.state.progress>0&&s.pose?.state.progress<1));
});
test('exiting cancels in-flight samples, including unsupported/loading paths',async()=>{
 let resume;const player=createFabricationPlayer(call,()=>{},{nextFrame:()=>new Promise(r=>resume=r)});
 await player.open(defaultSpec());const step=player.step(1);player.close();resume(0);assert.equal(await step,false);assert.equal(player.state.active,false);
 const s=defaultSpec();s.rise.front=30;s.walls.left=false;assert.equal(await player.open(s),false);assert.match(player.state.error,/both folding side walls/);
});
test('seal rendering uses kernel cue coordinates and a stable camera without solver imports',()=>{
 const s=defaultSpec(),camera=cameraForFrame(frameFromPoints(fabricationGuide(s).framePointsMm));
 for(const stageId of ['long-seal','front-seal','rear-seal']){
  const p=fabricationPose(s,{stageId}),svg=fabricationSVG(p,camera,defaultView());assert.match(svg,/data-scene-role="tool"/);assert.match(svg,/data-scene-role="bond"/);assert.match(svg,/data-scene-role="film"/);
  assert.equal(p.activeSeal.pairedLinesMm.length,2);
  const [a,b]=p.activeSeal.pairedLinesMm;assert.ok(Math.min(distance(a[0],b[0])+distance(a[1],b[1]),distance(a[0],b[1])+distance(a[1],b[0]))<1e-7);
 }
});
