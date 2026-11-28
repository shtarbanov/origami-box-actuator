import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultSpec} from '../kernel/spec.mjs';
import {wallTuckProgram} from '../kernel/wall-tuck-study.mjs';
import {point,points,area,sub,cross,dot} from '../kernel/sheet-folds.mjs';
import {solidPanelMesh,thickFoldState,thickPanelContacts,compileThickFolds} from '../kernel/thick-folds.mjs';
import {wallTuckThickContext,wallTuckThicknessAudit,wallTuckPhysicalPose,wallTuckPhysicalStoryboard,wallTuckClosedState,wallTuckStackSection} from '../kernel/wall-tuck-thickness.mjs';
const opts={marginMm:8,heatWidthMm:1};
function context(w=.8,h=1,side=1){const s=defaultSpec();s.footprint.frontWidth=80;s.rise.front=30;s.footprint.rearWidthRatio=w;s.rise.rearRatio=h;if(side!==1)s.rise.rightToLeftRatio=side;return wallTuckThickContext(wallTuckProgram(s,opts));}
const distance=(a,b)=>Math.hypot(...sub(a,b));
test('requested directions are DOWN, UP, UP; thick meshes keep their volume and rigid distances',()=>{
 const c=context();assert.deepEqual(c.context.options.foldSigns,[-1,1,1]);
 assert.ok(points(thickFoldState(c.program,{step:1,progress:.5}).panels[5])[0][2]<0);
 assert.ok(points(thickFoldState(c.program,{step:2,progress:.5}).panels[4])[0][2]>0);
 assert.ok(points(thickFoldState(c.program,{step:3,progress:.5}).panels[3])[0][2]>0);
 for(let step=0;step<=3;step++)for(const progress of [0,.11,.5,.89,1]){
  const state=thickFoldState(c.program,{step,progress});
  for(let i=0;i<6;i++){
   const p=state.panels[i],m=solidPanelMesh(p),ref=solidPanelMesh(c.program.initial.panels[i]);let volume=0;
   for(const face of m.faces)for(let j=1;j<face.length-1;j++)volume+=dot(m.verticesMm[face[0]],cross(m.verticesMm[face[j]],m.verticesMm[face[j+1]]))/6;
   assert.ok(Math.abs(volume-area(p.uvMm)*.3)<1e-8);
   for(let a=0;a<m.verticesMm.length;a++)for(let b=a+1;b<m.verticesMm.length;b++)assert.ok(Math.abs(distance(m.verticesMm[a],m.verticesMm[b])-distance(ref.verticesMm[a],ref.verticesMm[b]))<1e-8);
  }
 }
});
test('coincident surfaces hide real plastic penetration; finite accommodation resolves the sampled path',()=>{
 const c=context(),raw=c.context.program.steps[2].panels.map(p=>({...p,thicknessMm:.3}));
 assert.ok(thickPanelContacts(raw).some(p=>p.includes('top')&&p.includes('right-lower')));
 assert.deepEqual(c.program.failures,[]);assert.ok(c.program.steps[1].radiusMm>=.3);assert.ok(c.program.steps[2].radiusMm>0);
 for(const p of c.program.steps)assert.ok(p.radiusMm*Math.abs(p.angleRad)<=4+1e-8);
});
test('the sealed pouch opens and the opposite wall closes inward before either end reference',()=>{
 const c=context(),story=wallTuckPhysicalStoryboard(c,{framesPerFold:13});
 assert.deepEqual(story.map(p=>p.phase),['prefold','prefold','prefold','prefold','seal','open','inward','front-seal','rear-seal']);
 const first=wallTuckStackSection(c,thickFoldState(c.program,{step:3})),last=wallTuckStackSection(c,wallTuckClosedState(c,0,true),'left');
 assert.deepEqual(first.layers.map(p=>p.panelId),['bottom','right-lower','right-upper','top']);
 assert.deepEqual(last.layers.map(p=>p.panelId),['bottom','left-lower','left-upper','top']);
 for(const s of [first,last])for(let i=1;i<s.layers.length;i++)assert.ok(s.layers[i].minZMm>=s.layers[i-1].maxZMm-1e-8);
 assert.deepEqual(story[6].frames.at(-1).wallDirections,{left:'inward',right:'inward'});
});
test('post-seal physical branches join continuously, conserve rigid plates and fit available film gaps',()=>{
 for(const c of [context(1),context(),context(1,.6),context(.8,.6),context(1,1,.8)]){
  const report=wallTuckThicknessAudit(c,{samples:151});assert.equal(report.finitePanelPathPass,true,JSON.stringify(report));
  const a=thickFoldState(c.program,{step:3}),b=wallTuckClosedState(c,0),u=wallTuckClosedState(c,1),v=wallTuckClosedState(c,1,true);
  for(let i=0;i<6;i++)for(let j=0;j<a.panels[i].uvMm.length;j++){
   assert.ok(distance(points(a.panels[i])[j],points(b.panels[i])[j])<1e-8);assert.ok(distance(points(u.panels[i])[j],points(v.panels[i])[j])<1e-8);
  }
 }
});
test('free overhangs close the seam without stretching and heat stays outside the modeled body envelope',()=>{
 const c=context();for(const progress of [0,.25,.5,.75,1]){
  const p=wallTuckPhysicalPose(c,{phase:'seal',progress});for(const m of p.meshes.filter(m=>m.role==='seam-film'))assert.ok(Math.abs(distance(m.verticesMm[0],m.verticesMm[1])-2)<1e-8);
  if(progress===1){assert.ok(p.seamGuideMismatchMm<1e-8);assert.equal(p.heater.normalApproachClear,true);assert.ok(p.heater.outwardOffsetMm>p.heater.minimumBodyEnvelopeOffsetMm);}
 }
 for(const phase of ['open','inward'])for(const progress of [0,.25,.5,.75,1])assert.ok(wallTuckPhysicalPose(c,{phase,progress}).seamGuideMismatchMm<1e-8);
});
test('insufficient gap/thickness combinations are rejected rather than hidden by overlapping volumes',()=>{
 const c=context();const bad=compileThickFolds(c.context.program,{thicknessMm:2,gapMm:1,samples:31});assert.ok(bad.failures.length>0);
 assert.throws(()=>compileThickFolds(c.context.program,{thicknessMm:0,gapMm:4}));assert.throws(()=>wallTuckThicknessAudit(c,{samples:0}));
});
