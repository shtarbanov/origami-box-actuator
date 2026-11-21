import assert from 'node:assert/strict';
import {unfold,model,pose,lengthError,sheet,record,parameters,distance,panelWorld} from './geometry.mjs';
import {audit,assemblyAudit,collide} from './validate.mjs';
import {proofConditions} from './mechanism.mjs';
let count=0;
for(const kind of ['rectangle','taper','wedge'])for(const length of [40,75,120])for(const gap of [1,4,7]){
 const p={kind,length,width0:64,width1:48,l0:16,l1:kind==='wedge'?8:16,gap};
 for(const folding of [false,true]){const n=unfold(p,folding);assert.equal(n.faces.length,6);assert.ok(lengthError(n)<1e-7);assert.equal(n.folds.length,folding?3:0);assert.equal(n.seals.length,folding?6:0);assert.equal(n.collisions.length,0);count++;}
 const r=record(p);assert.equal(r.validation.physicalTest,null);assert.equal(r.validation.pressureModel,false);
 assert.deepEqual(parameters(JSON.parse(JSON.stringify(r)).parameters),parameters(p));
}
const base=unfold({kind:'rectangle',width0:48,l0:24},true);
assert.equal(Math.max(...base.faces[0].panel.map(p=>p[0]))-Math.min(...base.faces[0].panel.map(p=>p[0])),44);
for(const p of [{kind:'rectangle'},{kind:'taper',width0:64,width1:48,l0:20},{kind:'wedge',width0:56,l0:24,l1:8},{kind:'wedge',width0:60,l0:24,l1:0},{kind:'wedge',width0:60,l0:12,l1:20},{kind:'wedge',width0:60,l0:20,l1:20}]){
 const a=model(p),net=unfold(p);
 for(const opening of [0,.001,.2,.5,.999,1]){
  const b=pose({...p,opening});
  for(const f of a.faces)for(const x of f.ids)for(const y of f.ids)assert.ok(Math.abs(distance(a.v[x],a.v[y])-distance(b.v[x],b.v[y]))<1e-7);
  for(const f of net.faces){const world=panelWorld(net,f,b.v);for(let i=0;i<f.panel.length;i++)for(let j=0;j<f.panel.length;j++)assert.ok(Math.abs(distance(f.panel[i],f.panel[j])-distance(world[i],world[j]))<1e-7);}
 }
 assert.ok(audit(p,{samples:81,thickness:.3}).numericalPass);
 assert.ok(assemblyAudit(p,{samples:81,thickness:.3}).sampledPass);
}
assert.throws(()=>parameters({l0:30,width0:40}));assert.throws(()=>parameters({gap:NaN}));
assert.throws(()=>parameters({kind:'wedge',length:40,l0:24,l1:0,width0:60}));
assert.throws(()=>parameters({kind:'wedge',width0:48,l0:24,l1:8}));
assert.ok(proofConditions(parameters({kind:'wedge',width0:56,l0:24,l1:8})).requiredWidthMm>48);
assert.equal(sheet({kind:'rectangle',length:150,width0:100,l0:30,paper:'A4'}).fit,false);
assert.equal(sheet({kind:'rectangle',length:150,width0:100,l0:30,paper:'A3'}).fit,true);
const square=[[-1,-1,0],[1,-1,0],[1,1,0],[-1,1,0]];
assert.equal(collide(square,[[-.5,0,-1],[.5,0,-1],[.5,0,1],[-.5,0,1]],0),true);
assert.equal(collide(square,square.map(([x,y,z])=>[x,y,z+.1]),.3),true);
assert.equal(collide(square,square.map(([x,y,z])=>[x,y,z+.4]),.3),false);
assert.equal(collide(square,square.map(([x,y,z])=>[x+2,y,z]),0),false);
const thick=audit({kind:'rectangle'},{samples:81,thickness:.3});
assert.ok(thick.finiteThicknessCollisions.length>0);assert.ok(thick.minimumSampledSafeOpening>0);
console.log(`PASS: ${count} nets; all face distances/diagonals; 6 closed-chain and assembly sweeps; triangle/parallel limits; collision detector positive/negative cases; invalid width and tilt rejection; thickness interference.`);
import {fixedCamera,polygonArea3D} from './camera.mjs';
let areaChecks=0;
for(const p of [{kind:'rectangle'},{kind:'taper',width0:64,width1:48,l0:20},{kind:'wedge',width0:56,l0:24,l1:8}]){
 const net=unfold(p),cam=fixedCamera(p,'actuation'),cam2=fixedCamera({...p,opening:.02},'actuation');
 assert.equal(cam.scale,cam2.scale);assert.equal(cam.cx,cam2.cx);assert.equal(cam.cy,cam2.cy);
 const ref=pose({...p,opening:1}),areas=net.faces.map(f=>polygonArea3D(panelWorld(net,f,ref.v)));
 const fixedBottom=panelWorld(net,net.faces[0],ref.v).map(cam.project);
 for(let i=0;i<=100;i++){
  const m=pose({...p,opening:i/100});
  for(let j=0;j<6;j++){const poly=panelWorld(net,net.faces[j],m.v);assert.ok(Math.abs(polygonArea3D(poly)-areas[j])<1e-7);areaChecks++;if(j===0)poly.map(cam.project).forEach((q,k)=>assert.ok(distance(q,fixedBottom[k])<1e-8));}
 }
 console.log(p.kind,JSON.stringify({bottomAreaMm2:areas[0],topAreaMm2:areas[3],fixedScale:cam.scale}));
}
console.log(`PASS: ${areaChecks} physical-panel area checks; fixed bottom screen coordinates and camera across opening.`);
// Four-panel film hinge: closed path, actual area, fixed pivot and upper limit.
for(const W of [48,60,80]){
 const p={kind:'hinge',width0:W,l0:24},n=unfold(p),m=model(p),ref=n.faces.map(f=>polygonArea3D(panelWorld(n,f,m.v)));
 assert.equal(n.faces.length,4);assert.equal(n.hinges.length,3);assert.equal(n.folds.length,1);
 for(let k=0;k<=100;k++){
  const q=pose({...p,opening:k/100});assert.deepEqual(q.v.A,m.v.A);assert.deepEqual(q.v.D,m.v.D);
  for(let i=0;i<4;i++){
   const f=n.faces[i];for(const a of f.ids)for(const b of f.ids)assert.ok(Math.abs(distance(q.v[a],q.v[b])-distance(m.v[a],m.v[b]))<1e-7);
   assert.ok(Math.abs(polygonArea3D(panelWorld(n,f,q.v))-ref[i])<1e-7);
  }
 }
 assert.ok(audit(p,{samples:181}).numericalPass);assert.ok(assemblyAudit(p,{samples:181}).sampledPass);
 assert.ok(sheet(p).fit);assert.ok(sheet(p,false).fit);
}
assert.ok(Math.abs(proofConditions(parameters({kind:'hinge'})).maximumOpeningAngleDeg-60)<1e-10);
console.log('PASS: 4-panel hinge, fixed pivot, rigid distances and areas, 3 width cases, closed-loop and net-assembly paths.');
