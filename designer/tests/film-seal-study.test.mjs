import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultSpec} from '../kernel/spec.mjs';
import {studyExternalFin,heatedFilmLayers} from '../kernel/film-seal-study.mjs';
import {fabricationGuide} from '../kernel/fabrication-guide.mjs';
import {handleRequest} from '../api/dispatch.mjs';
const options={marginMm:8,heatWidthMm:1,setbackMm:2,samples:101}; // explicit study examples
function spec(w=.8,h=1,side=1){const s=defaultSpec();s.footprint.frontWidth=80;s.rise.front=30;s.footprint.rearWidthRatio=w;s.rise.rearRatio=h;if(side!==1)s.rise.rightToLeftRatio=side;return s;}

test('prepared free margins and downward closure isolate the local two-layer fin',()=>{
 for(const s of [spec(),spec(1),spec(1,.6),spec(.8,.6),spec(1,1,.8),spec(1.3,1.2)]){
  const before=structuredClone(s),r=studyExternalFin(s,options),c=r.checks;
  assert.equal(c.candidatePass,true,JSON.stringify(c.failures));assert.equal(c.localHeaterIsolationPass,true);
  assert.equal(r.heater.coveringPatchIds.length,2);assert.equal(r.heater.opposedMarginNormals,true);
  assert.equal(c.intersections.length,0);assert.equal(c.stackViolations.length,0);
  assert.ok(c.maxIsometryErrorMm<1e-8);assert.ok(c.maxPanelAttachmentErrorMm<1e-8);assert.ok(c.areaErrorMm2<1e-8);
  assert.equal(r.manufacturingReady,false);assert.deepEqual(s,before);
 }
});
test('closing the second pair upward crosses actual film despite the same rigid endpoint',()=>{
 const r=studyExternalFin(spec(),{...options,secondFoldDirection:'up'});
 assert.equal(r.checks.candidatePass,false);assert.ok(r.checks.intersections.length>0);
 assert.ok(r.checks.failures.some(f=>f.code==='FILM_CROSSING'));
});
test('waiting until after closure cannot extract buried margins through a deposited layer',()=>{
 const r=studyExternalFin(spec(),{...options,marginTiming:'after-close'});
 // A pure noncoplanar intersection test misses this departure from a flat stack.
 assert.equal(r.checks.intersections.length,0);assert.ok(r.checks.stackViolations.length>0);
 assert.equal(r.checks.candidatePass,false);assert.ok(r.checks.failures.some(f=>f.code==='STACK_ORDER_VIOLATION'));
});
test('thermal layer counting includes fully stacked and partially overlapping extra film',()=>{
 const band=[[0,0,0],[5,0,0],[5,1,0],[0,1,0]],film=[0,1,2].map(i=>({id:'layer-'+i,pointsMm:band}));
 film.push({id:'partial',pointsMm:[[2,0,0],[6,0,0],[6,2,0],[2,2,0]]});
 film.push({id:'elsewhere',pointsMm:band.map(p=>[p[0],p[1],10])});
 assert.deepEqual(heatedFilmLayers(film,band),{touchingPatchIds:['layer-0','layer-1','layer-2','partial'],fullyCoveringPatchIds:['layer-0','layer-1','layer-2']});
});
test('variable heater dimensions must fit and the rectangular blank can invalidate a plan',()=>{
 const short=studyExternalFin(spec(),{...options,marginMm:2});assert.equal(short.checks.candidatePass,false);
 assert.ok(short.checks.failures.some(f=>f.code==='INSUFFICIENT_MARGIN'));
 const apex=studyExternalFin(spec(1,0),options);assert.equal(apex.checks.candidatePass,false);
 assert.ok(apex.checks.failures.some(f=>f.code==='MARGIN_CROSSES_SECOND_FOLD'));
 for(const opts of [undefined,{...options,heatWidthMm:0},{...options,marginMm:NaN},{...options,unknown:2},{...options,secondFoldDirection:'sideways'}])assert.throws(()=>studyExternalFin(spec(),opts),e=>e.code==='INVALID_OPTIONS');
});
test('passing local research does not unlock the withdrawn public fabrication guide',()=>{
 const s=spec();assert.equal(studyExternalFin(s,options).checks.candidatePass,true);
 assert.equal(fabricationGuide(s).supported,false);
 const response=handleRequest({apiVersion:'origami-box/api/1',method:'fabrication.pose',payload:{spec:s,state:{stageId:'long-seal'}}});
 assert.equal(response.ok,false);assert.equal(response.errors[0].code,'SEAL_LAYER_ACCESS_UNVERIFIED');
});
