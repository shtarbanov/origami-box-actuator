import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {defaultSpec,resolveSpec} from '../kernel/spec.mjs';
import {unfold,distance,pose} from '../kernel/geometry.mjs';
import {prefoldMaps,outwardMaps,panelsCoplanar} from '../kernel/fabrication-motion.mjs';
import {fabricationGuide,fabricationPose,validateFabrication} from '../kernel/fabrication-guide.mjs';
const cases=[['taper',.8,1,1],['wedge',1,.6,1],['triangle',1,0,1],['combined',.8,.6,1],['lateral',1,1,.8],['compound',.85,.7,.8],['wider-rear',1.35,1,1],['reverse-pitch',1,1.3,1],['reverse-lateral',1,1,1.3]];
const specFor=([,width,rise,side])=>{
 const s=defaultSpec();s.footprint.frontWidth=80;s.rise.front=30;s.footprint.rearWidthRatio=width;s.rise.rearRatio=rise;if(side!==1)s.rise.rightToLeftRatio=side;return s;
};
test('two side-pair prefolds align both closing seam endpoints and stack congruent top/bottom plates',()=>{
 for(const item of cases){
  const p=resolveSpec(specFor(item)).parameters,net=unfold(p),maps=prefoldMaps(net);
  for(const id of net.seam)assert.ok(distance(maps[0][id],maps[5][id])<1e-8,item[0]);
  for(const [a,b] of [['A','E'],['B','F'],['C','G'],['D','J']])assert.ok(distance(maps[0][a],maps[3][b])<1e-8,item[0]);
  const start=outwardMaps(p,net,0);for(let f=0;f<6;f++)for(const id of net.faces[f].ids)assert.ok(distance(maps[f][id],start[f][id])<1e-8,item[0]);
  const end=outwardMaps(p,net,1),target=pose({...p,opening:1}).v;
  for(let f=0;f<6;f++)for(const id of net.faces[f].ids)assert.ok(distance(end[f][id],target[id])<1e-8,item[0]);
 }
});
test('nonrectangular rigid geometry remains consistent but is not an approved sealing route',()=>{
 for(const item of cases){
  const s=specFor(item),g=fabricationGuide(s),audit=validateFabrication(s,{samples:151});
  assert.equal(g.supported,false);assert.deepEqual(g.stages,[]);assert.equal(g.diagnostics[0].code,'SEAL_LAYER_ACCESS_UNVERIFIED');
  assert.throws(()=>fabricationPose(s,{stageId:'long-seal'}),e=>e.code==='SEAL_LAYER_ACCESS_UNVERIFIED');
  assert.equal(audit.manufacturingReady,false);assert.equal(audit.guideAvailable,false);assert.equal(audit.validationScope,'sampled-rigid-panel-geometry');assert.equal(audit.sealLayerAccess,'unverified');
  assert.equal(audit.numericalPass,true,item[0]+': '+JSON.stringify(audit));assert.ok(audit.flatStackContactSamples>0);
  assert.ok(audit.maxPanelMapErrorMm<1e-8);assert.equal(audit.unexpectedSurfaceCrossings.length,0);
 }
});
test('coplanar stacking is distinguished from panels crossing at an angle',()=>{
 const a=[[0,0,0],[2,0,0],[2,2,0],[0,2,0]],same=[[.5,.5,0],[1.5,.5,0],[1.5,1.5,0],[.5,1.5,0]],through=[[1,0,-1],[1,2,-1],[1,2,1],[1,0,1]];
 assert.equal(panelsCoplanar(a,same),true);assert.equal(panelsCoplanar(a,through),false);
});
test('the generic GUI contains no shape-specific manufacturing routing',async()=>{
 const entry=await fs.readFile(new URL('../ui/block-app.mjs',import.meta.url),'utf8'),guide=await fs.readFile(new URL('../ui/fabrication-feature.mjs',import.meta.url),'utf8');
 assert.ok(!/align-seam|taper|wedge|oblique|compound/.test(entry+guide));
});
