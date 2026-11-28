import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {defaultSpec} from '../kernel/spec.mjs';
import {fabricationGuide} from '../kernel/fabrication-guide.mjs';
import {wallTuckProgram,wallTuckPose,studyWallTuck} from '../kernel/wall-tuck-study.mjs';
import {identity,compileSheetFolds,sampleSheetFolds,auditSheetFolds} from '../kernel/sheet-folds.mjs';
const options={marginMm:8,heatWidthMm:1,samples:101};
function spec(w=.8,h=1,side=1){const s=defaultSpec();s.footprint.frontWidth=80;s.rise.front=30;s.footprint.rearWidthRatio=w;s.rise.rearRatio=h;if(side!==1)s.rise.rightToLeftRatio=side;return s;}

test('doubling, swinging inward and opposite-wall folding leave exactly two exposed target layers',()=>{
 for(const s of [spec(),spec(1),spec(1,.6),spec(.8,.6),spec(1,1,.8),spec(.8,.7,.8)]){
  const before=structuredClone(s),r=studyWallTuck(s,options),a=r.audit;
  assert.equal(r.candidatePass,true,JSON.stringify(a));assert.ok(r.seam.errorMm<1e-8);
  assert.deepEqual(r.heater.targetRegions,['end-0','end-5']);assert.equal(r.heater.touchingPatchIds.length,2);
  assert.equal(r.heater.normalApproachClear,true);assert.equal(r.heater.opposedMaterialFaces,true);assert.deepEqual(r.heater.panelIdsInFootprint,[]);
  for(const key of ['maxRigidDistanceErrorMm','maxFilmDistanceErrorMm','maxFilmContinuityErrorMm','maxPanelAttachmentErrorMm','maxHingeErrorMm','maxAreaErrorMm2'])assert.ok(a[key]<1e-8,key);
  assert.equal(a.filmCrossings.length,0);assert.equal(a.panelCrossings.length,0);assert.equal(a.stackViolations.length,0);
  assert.deepEqual(s,before);assert.equal(r.manufacturingReady,false);
 }
});
test('the old central half-fold remains a different operation and does not close the seam',()=>{
 const r=studyWallTuck(spec(),{...options,wholeFoldHinge:2});
 assert.equal(r.audit.sampledPass,true);assert.ok(Math.abs(r.seam.errorMm-30)<1e-8);
 assert.equal(r.heater.localSealPass,false);assert.equal(r.candidatePass,false);
});
test('the heated band must stay outward of the guide; centering it includes unwanted body layers',()=>{
 const r=studyWallTuck(spec(),options);
 assert.equal(r.heater.placement,'guide-is-inner-edge-of-outward-heated-band');
 assert.equal(r.heater.touchingPatchIds.length,2);
 assert.equal(r.heater.inwardGuideComparison.fullyCoveringPatchIds.length,4);
 assert.ok(r.heater.centeredGuideComparison.touchingPatchIds.length>2);
});
test('identical rigid endpoints still reject the swing direction that extracts film through the body',()=>{
 for(const first of [-1,1])for(const swing of [-1,1])for(const whole of [-1,1]){
  const r=studyWallTuck(spec(),{...options,samples:31,foldSigns:[first,swing,whole]});
  assert.ok(r.seam.errorMm<1e-8);assert.equal(r.heater.localSealPass,true);
  assert.equal(r.candidatePass,first!==swing);assert.equal(r.audit.stackViolations.length>0,first===swing);
 }
});
test('a zero-height apex can keep rigid plates while tearing the proposed extra-film crease pattern',()=>{
 const r=studyWallTuck(spec(1,0),options);
 assert.ok(r.audit.maxRigidDistanceErrorMm<1e-8);assert.ok(r.seam.errorMm<1e-8);
 assert.ok(r.audit.maxFilmContinuityErrorMm>1);assert.equal(r.candidatePass,false);
});
test('kernel poses and crease metadata rewind exactly and survive JSON transport without shared output arrays',()=>{
 const c=wallTuckProgram(spec(),options),program=JSON.parse(JSON.stringify(c.program));
 assert.deepEqual(program.steps.map(p=>p.hingeId),['right-middle','top-right','left-middle']);
 for(let step=1;step<=3;step++){
  const from=wallTuckPose(c,{step,progress:0}),previous=wallTuckPose(c,{step:step-1,progress:1});
  assert.deepEqual(from.panels.map(p=>p.pointsMm),previous.panels.map(p=>p.pointsMm));
  for(const progress of [0,.13,.5,.87,1])assert.deepEqual(sampleSheetFolds(c.program,{step,progress}),sampleSheetFolds(program,{step,progress}));
 }
 const before=sampleSheetFolds(program,{step:2,progress:.5}),mutated=sampleSheetFolds(program,{step:2,progress:.5});
 mutated.panels[0].uvMm[0][0]=999;mutated.operation.axisMm[0][0]=999;mutated.panels[0].anchorsMm.A[0]=999;
 assert.deepEqual(sampleSheetFolds(program,{step:2,progress:.5}),before);
});
test('generic folding works on an unrelated two-panel sheet and imports no box model or GUI',async()=>{
 const model={film:[{id:'sheet',region:'body',stackLevel:0,uvMm:[[-2,0],[2,0],[2,3],[-2,3]],transform:identity()}],panels:[
  {id:'fixed',uvMm:[[-1.8,.2],[-.2,.2],[-.2,2.8],[-1.8,2.8]],transform:identity()},
  {id:'flap',uvMm:[[.2,.2],[1.8,.2],[1.8,2.8],[.2,2.8]],transform:identity()}],hinges:[{id:'any-name',axisUvMm:[[0,0],[0,3]],parentPanelId:'fixed',movingPanelIds:['flap'],movingSide:-1}]};
 const before=structuredClone(model),program=compileSheetFolds(model,[{id:'user-fold',hingeId:'any-name',angleRad:Math.PI}]);
 assert.equal(auditSheetFolds(program,{samples:61}).sampledPass,true);assert.deepEqual(model,before);
 const source=await fs.readFile(new URL('../kernel/sheet-folds.mjs',import.meta.url),'utf8');
 assert.ok(!/from ['"].*(?:geometry|spec|fabrication|ui|interpreter)/.test(source));
});
test('local study does not enable a complete fabrication guide and input errors are explicit',()=>{
 assert.equal(fabricationGuide(spec()).supported,false);
 for(const opts of [undefined,{...options,heatWidthMm:0},{...options,samples:2},{...options,foldSigns:[1,0,1]},{...options,unknown:1}])assert.throws(()=>wallTuckProgram(spec(),opts),e=>e.code==='INVALID_OPTIONS');
});
