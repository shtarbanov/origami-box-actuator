import test from 'node:test';
import assert from 'node:assert/strict';
import {model,pose,unfold,distance,panelWorld} from '../kernel/geometry.mjs';
import {audit,assemblyAudit} from '../kernel/validate.mjs';
import {mobilityProfile} from '../kernel/mobility.mjs';
import {combinedVertices} from '../kernel/combined.mjs';
import {wedgeVertices} from '../kernel/mechanism.mjs';
import {defaultSpec,validateDesign,analyzeDesign} from '../kernel/index.mjs';
import {rearApexRelief} from '../kernel/fabrication.mjs';
import {call} from '../api/client.mjs';
test('combined taper and pitch preserves every rigid distance over a parameter grid',()=>{
 let checks=0;
 for(const H of [60,100])for(const ratio of [.7,.9,1.1,1.4])for(const rearRatio of [0,.3,.8,1.2,1.7]){
  const p={kind:'combined',length:H,width0:100,width1:100*ratio,l0:12,l1:12*rearRatio,gap:2,thickness:.3},m=model(p),net=unfold(p);
  assert.equal(net.collisions.length,0);
  const expectedTop=distance(m.v.E,m.v.J),expectedBottom=distance(m.v.A,m.v.D);assert.ok(Math.abs(expectedTop-expectedBottom)<1e-8);
  for(let n=0;n<=50;n++){
   const v=pose({...p,opening:n/50}).v;
   for(const f of m.faces)for(const a of f.ids)for(const b of f.ids){assert.ok(Math.abs(distance(m.v[a],m.v[b])-distance(v[a],v[b]))<1e-7);checks++;}
   for(const f of net.faces){const world=panelWorld(net,f,v);assert.ok(world.flat().every(Number.isFinite));}
  }
 }
 console.log('Combined rigid-distance comparisons:',checks);
});
test('new analytic solution has the existing wedge as an exact special case',()=>{
 for(const l1 of [0,8,20,30])for(const opening of [0,.01,.3,.8,1]){
  const p={length:75,width0:80,width1:80,l0:24,l1};
  const a=combinedVertices(p,opening),b=wedgeVertices(p,opening);
  for(const id of Object.keys(a))assert.ok(distance(a[id],b[id])<1e-8);
 }
});
test('combined solution approaches the parallel taper continuously',()=>{
 const p={length:75,width0:100,width1:80,l0:16,gap:4};
 for(const sign of [-1,1])for(const opening of [0,.3,.8,1]){
  const a=combinedVertices({...p,l1:p.l0+sign*1e-5},opening),b=pose({...p,kind:'taper',opening}).v;
  for(const id of Object.keys(a))assert.ok(distance(a[id],b[id])<4e-5);
 }
});
test('combined reference designs pass sampled closure, interference and open-net assembly',()=>{
 for(const p of [
  {kind:'combined',length:75,width0:70,width1:45,l0:20,l1:8},
  {kind:'combined',length:75,width0:60,width1:80,l0:14,l1:24},
  {kind:'combined',length:90,width0:80,width1:60,l0:20,l1:0}
 ]){
  const a=audit(p,{samples:301,thickness:.3}),b=assemblyAudit(p,{samples:151,thickness:.3});
  assert.ok(a.numericalPass);assert.ok(b.sampledPass);assert.ok(a.minimumSampledSafeOpening<.5);
 }
});
test('mobility distinguishes geometry changes and identifies singular endpoints',()=>{
 const p={length:75,width0:70,width1:45,l0:20,l1:8};
 assert.equal(mobilityProfile({...p,kind:'rectangle'}).genericSampledDof,3);
 for(const kind of ['taper','wedge','combined','hinge'])assert.equal(mobilityProfile({...p,kind}).genericSampledDof,1,kind);
 const profile=mobilityProfile({...p,kind:'combined'});assert.deepEqual(profile.singularSamples,[0,1]);
});
test('tapered direct hinges preserve rigid facets and satisfy the derived rise ratio',()=>{
 for(const ratio of [.5,.7,.99999999999,1.00000000001,1.3,2])for(const left of [false,true]){
  const s=defaultSpec();s.footprint={length:75,frontWidth:70,rearWidthRatio:ratio};s.rise={front:35,rearRatio:ratio};s.walls={left,right:!left};
  const v=validateDesign(s,{samples:101,assemblySamples:51});assert.ok(v.actuation.numericalPass);assert.ok(v.assembly.sampledPass);
  const a=analyzeDesign(s);assert.ok(Math.abs(a.path.at(-1).rearMaxRiseMm/35-ratio)<1e-9);
  assert.equal(a.mobility.genericSampledDof,1);
 }
});
test('thickness-derived apex relief fixes an independently detected assembly collision',()=>{
 const p={kind:'combined',length:100,width0:100,width1:70,l0:12,l1:0,gap:2,thickness:.3};
 const q=rearApexRelief(p),theta=Math.abs(Math.asin(-24/100))*.75;
 assert.ok(q>p.gap/2);assert.ok(q*Math.sin(theta/2)>=p.thickness/2*Math.cos(theta/2));
 assert.ok(assemblyAudit(p,{samples:201,thickness:.3}).sampledPass);
});
test('matching width/rise ratios create a 3-DOF spherical special case',()=>{
 for(const ratio of [.6,.7,1.3,1.4]){
  const p={kind:'combined',length:75,width0:70,width1:70*ratio,l0:20,l1:20*ratio};
  assert.equal(mobilityProfile(p).genericSampledDof,3);
 }
});
test('spherical six-panel geometry supports an independently chosen small yaw path',()=>{
 const spec=defaultSpec();spec.footprint={length:75,frontWidth:70,rearWidthRatio:.7};spec.rise={front:40,rearRatio:.7};
 for(let i=0;i<=100;i++){
  const f=i/100,result=call('research.orientation',{spec,state:{progress:.3+.6*f,yawDeg:1.3*Math.sin(Math.PI*f)}});
  assert.ok(result.maxRigidErrorMm<1e-8);assert.equal(result.contacts.length,0);assert.ok(result.minimumHingeVertexHeightMm>=-1e-8);
 }
 assert.throws(()=>call('research.orientation',{spec,state:{progress:.5,yawDeg:20}}),e=>e.issues[0].code==='ORIENTATION_OUTSIDE_CONES');
});
