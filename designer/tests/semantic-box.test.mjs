import test from 'node:test';
import assert from 'node:assert/strict';
import {newIntent,applyCommand} from '../intent/model.mjs';
import {resolveIntent} from '../constraints/resolve.mjs';
import {interpretText} from '../intent/text.mjs';
import {defaultSpec,resolveSpec} from '../kernel/spec.mjs';
import {model,pose,distance} from '../kernel/geometry.mjs';
import {validateDesign,templateGeometry} from '../kernel/index.mjs';
import {call} from '../api/client.mjs';
const solve=i=>{const r=resolveIntent(i,{ranges:false});assert.equal(r.status,'resolved',r.conflicts?.[0]?.message);return r;};
const feature=(i,feature,value,mode)=>applyCommand(i,{type:'set-feature',feature,value,mode});

test('description clauses compose a box; changing angle/ratio replaces the same longitudinal relation',()=>{
 let r=solve(feature(feature(feature(newIntent(),'outline',.8),'longitudinal',.75),'lateral',.7));
 assert.match(r.description.sentence,/trapezoidal box actuator with unequal front\/rear and left\/right lift/);
 const original=structuredClone(r.spec),angle=r.measurements.longitudinalAngleDeg;
 r=solve(feature(r.intent,'longitudinal',angle,'angle'));
 assert.equal(r.intent.blocks.filter(b=>['tilt','equal-rise','rise-ratio'].includes(b.op)).length,1);
 assert.ok(Math.abs(r.values.rearRise-original.rise.front*original.rise.rearRatio)<1e-10);
 r=solve(feature(r.intent,'longitudinal',r.values.rearRise/r.values.frontRise,'ratio'));
 assert.equal(r.intent.blocks.some(b=>b.op==='tilt'),false);
 const sequence=r.intent.blocks.map(b=>b.id),switched=call('intent.command',{intent:r.intent,command:{type:'switch-feature-mode',feature:'longitudinal',mode:'angle'}});
 assert.deepEqual(switched.intent.blocks.map(b=>b.id),sequence);assert.ok(Math.abs(switched.values.rearRise-r.values.rearRise)<1e-10);
});

test('left and right front heights are independently editable and other corners remain constrained',()=>{
 let r=solve(applyCommand(newIntent(),{type:'direct-side-rise',side:'left',value:25}));
 assert.ok(Math.abs(r.measurements.frontLeftRise-25)<1e-9);assert.ok(Math.abs(r.measurements.frontRightRise-32)<1e-9);
 r=solve(applyCommand(r.intent,{type:'direct-side-rise',side:'right',value:27}));
 assert.ok(Math.abs(r.measurements.frontLeftRise-25)<1e-9);assert.ok(Math.abs(r.measurements.frontRightRise-27)<1e-9);
 const pinned=applyCommand(r.intent,{type:'toggle-block-lock',id:r.intent.blocks.find(b=>b.op==='side-rise-ratio').id});
 const changed=solve(applyCommand(pinned,{type:'direct-side-rise',side:'right',value:30}));assert.ok(Math.abs(changed.values.sideRiseRatio-r.values.sideRiseRatio)<1e-10);
 const fixed=applyCommand(r.intent,{type:'add-block',op:'lock',field:'frontRise'});
 assert.equal(resolveIntent(applyCommand(fixed,{type:'direct-side-rise',side:'right',value:38})).status,'conflict');
 const lateral=r.intent.blocks.find(b=>b.op==='side-rise-ratio');r=solve(applyCommand(r.intent,{type:'remove-block',id:lateral.id}));
 assert.ok(Math.abs(r.measurements.frontLeftRise-r.measurements.frontRightRise)<1e-9);
});

test('trapezoid, longitudinal and lateral conditions commute and regenerate panel outlines',()=>{
 const f=[['outline',.8],['longitudinal',.75],['lateral',.7]],a=solve(f.reduce((i,[k,v])=>feature(i,k,v),newIntent())),b=solve(f.toReversed().reduce((i,[k,v])=>feature(i,k,v),newIntent()));
 assert.deepEqual(a.spec,b.spec);
 const net=templateGeometry(a.spec);assert.deepEqual(net.folding.overlaps,[]);assert.deepEqual(net.cutting.overlaps,[]);
 const left=net.folding.panels.find(p=>p.id==='left-lower').pointsMm,right=net.folding.panels.find(p=>p.id==='right-lower').pointsMm;
 const edgeLengths=ps=>ps.map((p,i)=>distance(p,ps[(i+1)%ps.length])).sort((a,b)=>a-b);
 assert.notDeepEqual(edgeLengths(left),edgeLengths(right));
 const record=call('intent.export',{intent:a.intent});assert.equal(call('intent.open',{project:JSON.parse(JSON.stringify(record))}).status,'resolved');
});

test('compound slopes preserve rigid faces, seam closure, contacts and the sampled assembly path',()=>{
 let maximumError=0,count=0;
 for(const width of [.8,1,1.2])for(const rise of [.8,1,1.2])for(const side of [.7,1.3]){
  const s=defaultSpec();s.footprint={length:75,frontWidth:70,rearWidthRatio:width};s.rise={front:30,rearRatio:rise,rightToLeftRatio:side};
  const r=validateDesign(s,{samples:101,assemblySamples:41});
  assert.equal(r.actuation.numericalPass,true);assert.equal(r.assembly.sampledPass,true);
  maximumError=Math.max(maximumError,r.actuation.maxRigidErrorMm,r.actuation.maxSeamErrorMm);count++;
 }
 assert.ok(maximumError<1e-8,maximumError);assert.equal(count,18);
});

test('near-equal lateral heights use a stable parallel limit without panel deformation',()=>{
 for(const side of [1-1e-3,1-1e-6,1-1e-9,1+1e-9]){
  const s=defaultSpec();s.footprint.frontWidth=64;s.footprint.rearWidthRatio=.8;s.rise={front:32,rearRatio:1,rightToLeftRatio:side};
  const p=resolveSpec(s).parameters,reference=model(p);
  for(let k=0;k<=100;k++){const v=pose({...p,opening:k/100}).v;
   for(const f of reference.faces)for(const a of f.ids)for(const b of f.ids)assert.ok(Math.abs(distance(reference.v[a],reference.v[b])-distance(v[a],v[b]))<1e-8);
  }
 }
});

test('reciprocal lateral ratios mirror the same rigid mechanism and connect continuously at the endpoints',()=>{
 for(const side of [.7,1.3]){
  const s=defaultSpec();s.footprint.frontWidth=64;s.footprint.rearWidthRatio=.8;s.rise={front:30,rearRatio:.8,rightToLeftRatio:side};
  const p=resolveSpec(s).parameters;const mirrored=structuredClone(s);mirrored.rise.rightToLeftRatio=1/side;const other=resolveSpec(mirrored).parameters;
  for(const t of [0,.1,.5,.9,1]){
   const a=pose({...p,opening:t}).v,b=pose({...other,opening:t}).v;
   for(const [left,right] of [['A','B'],['D','C'],['E','F'],['J','G'],['K','M'],['L','N']])assert.ok(distance(a[left],[-b[right][0],b[right][1],b[right][2]])<1e-8);
  }
  for(const end of [0,1]){const a=pose({...p,opening:end}).v,b=pose({...p,opening:end===0?1e-9:1-1e-9}).v;for(const id of Object.keys(a))assert.ok(distance(a[id],b[id])<.01);}
 }
});

test('incompatible lateral geometry identifies its source instead of drawing a distorted top',()=>{
 let i=feature(newIntent(),'lateral',.7);i=applyCommand(i,{type:'toggle-wall',side:'left'});
 let r=resolveIntent(i,{ranges:false});assert.equal(r.status,'conflict');assert.match(r.conflicts[0].message,/zero lift/);assert.equal(r.conflicts[0].blockIds.length,2);
 const hinge=defaultSpec();hinge.walls.left=false;hinge.rise.rightToLeftRatio=1;assert.throws(()=>resolveSpec(hinge),/zero lift/);
 i=feature(feature(newIntent(),'longitudinal',0),'lateral',.2);r=resolveIntent(i,{ranges:false});assert.equal(r.status,'conflict');assert.match(r.conflicts[0].message,/positive rise/);
 const s=defaultSpec();s.footprint.length=12;s.footprint.frontWidth=20;s.rise={front:20,rearRatio:.01,rightToLeftRatio:.1};
 assert.throws(()=>templateGeometry(s),/squared edge slopes/);
});

test('controlled description clauses and direct height text emit the same intent commands',()=>{
 const p=interpretText(newIntent(),'trapezoidal outline ratio 0.8; front/rear lift ratio 0.75; left/right lift ratio 0.7');assert.equal(p.ok,true);assert.match(solve(p.intent).description.sentence,/left\/right/);
 const q=interpretText(newIntent(),'left rise 25 mm');assert.equal(q.ok,true);assert.ok(Math.abs(solve(q.intent).measurements.frontLeftRise-25)<1e-9);
});
