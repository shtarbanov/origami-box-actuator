import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultSpec,fabricationGuide,fabricationPose,validateFabrication} from '../kernel/index.mjs';
import {fixedProjectionStretchBound,isometricStripFrame} from '../kernel/film-strain-study.mjs';
import {createFabricationPlayer} from '../ui/fabrication-player.mjs';
import {call} from '../api/client.mjs';
const dist=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
function spec(side='left',ratio=1){const s=defaultSpec();s.footprint.frontWidth=80;s.footprint.rearWidthRatio=ratio;s.rise.front=30;s.rise.rearRatio=ratio;s.walls[side]=false;return s;}
test('one-wall hinges have four real solids and preserve rigid shape, thickness and every stage join',()=>{
 for(const side of ['left','right'])for(const ratio of [1,.8,1.2]){const s=spec(side,ratio),g=fabricationGuide(s);assert.equal(g.supported,true);assert.equal(g.stages.length,8);const audit=validateFabrication(s,{samples:51});assert.equal(audit.numericalPass,true,JSON.stringify(audit.finitePanelAudit));assert.equal(audit.manufacturingReady,false);
  const serial=fabricationPose(s,{stageId:'rear-seal'});assert.deepEqual(JSON.parse(JSON.stringify(serial)),serial);const flat=fabricationPose(s,{stageId:'layout'}),reference=flat.meshes.filter(m=>m.role==='panel');assert.equal(reference.length,4);
  for(let index=0;index<8;index++){const id=g.stages[index].id;for(const progress of [0,.1,.3,.5,.9,1]){const p=fabricationPose(s,{stageId:id,progress}),solids=p.meshes.filter(m=>m.role==='panel');assert.equal(solids.length,4);assert.ok(!p.panels.some(p=>p.id.startsWith(side)));
   for(let i=0;i<4;i++){const m=solids[i],r=reference[i];assert.equal(m.thicknessMm,.3);for(let a=0;a<m.verticesMm.length;a++)for(let b=a+1;b<m.verticesMm.length;b++)assert.ok(Math.abs(dist(m.verticesMm[a],m.verticesMm[b])-dist(r.verticesMm[a],r.verticesMm[b]))<1e-7);}
   if(index&&progress===0){const before=fabricationPose(s,{stageId:g.stages[index-1].id});for(let i=0;i<4;i++)for(let j=0;j<p.panels[i].pointsMm.length;j++)assert.ok(dist(before.panels[i].pointsMm[j],p.panels[i].pointsMm[j])<1e-7);}
  }}
 }
});
test('the remaining wall starts outward and goes inward through its straight configuration; endpoints do not certify end-film folding',()=>{
 const s=spec(),outer=fabricationPose(s,{stageId:'long-seal'}),inner=fabricationPose(s,{stageId:'inward-fold'}),mean=p=>p.pointsMm.reduce((v,p)=>v+p[0],0)/p.pointsMm.length;
 assert.ok(mean(outer.panels.find(p=>p.id==='right-lower'))>40);assert.ok(mean(inner.panels.find(p=>p.id==='right-lower'))<40);
 const lines=outer.activeSeal.pairedLinesMm;assert.ok(dist(lines[0][0],lines[1][0])<1e-8);assert.ok(dist(lines[0][1],lines[1][1])<1e-8);
 const end=fabricationPose(s,{stageId:'rear-seal'});assert.equal(end.activeSeal.status,'unverified-end-film');assert.equal(end.action,null);assert.match(end.stage.instruction,/not.*certified|not an inextensible/i);
});
test('the generic player can advance and rewind the new hinge route without UI-side family routing',async()=>{
 let t=0;const player=createFabricationPlayer(async(m,p)=>call(m,p),()=>{},{nextFrame:async()=>t+=200});assert.equal(await player.open(spec()),true);const first=structuredClone(player.state.pose);for(let i=0;i<7;i++)assert.equal(await player.step(1),true);for(let i=0;i<7;i++)assert.equal(await player.step(-1),true);assert.deepEqual(player.state.pose,first);player.close();
});
test('fixed projected endpoints require stretch, but releasing seal retreat admits an exact local crease construction',()=>{
 const bound=fixedProjectionStretchBound(11.9,.636619766);assert.ok(bound.minimumPairwiseExtension>.0014);assert.ok(bound.minimumRetreatForAnUnstretchedStraightRampMm>.017);
 for(const spanMm of [8,12,20])for(const stackHeightMm of [.6,1.2,2])for(let i=0;i<=60;i++){const f=isometricStripFrame({spanMm,stackHeightMm,widthMm:30,tailMm:3},i/60);assert.equal(f.localIsometryPass,true);assert.equal(f.globalPouchIsometryVerified,false);if(i===60){const a=f.meshes.find(m=>m.id==='bottom-clamp').verticesMm,b=f.meshes.find(m=>m.id==='top-clamp').verticesMm;for(let j=0;j<4;j++)assert.ok(dist(a[j],b[j])<1e-10);assert.ok(f.retreatMm>0);}}
});
