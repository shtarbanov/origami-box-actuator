import assert from 'node:assert/strict';
import {sealDefaults,sealDesign,sealSvg} from './seal-study.mjs';
const dist=(a,b)=>Math.hypot(...a.map((x,i)=>x-b[i]));
let cases=0;
for(let n=3;n<=10;n++)for(const height of [30,50,75])for(const twist of [0,20,40,60]){
 const d=sealDesign({n,height,twist,gap:2});
 assert.equal(d.panels.length,2*n);assert.ok(d.maxEdgeError<1e-7);
 assert.ok(Math.abs(d.layFlatWidth-d.C/2)<1e-10);
 // Each matched edge pair of the nominal tube closes at its reference pose.
 const a=d.vertices.B0,b=d.vertices['B'+(n-1)];
 assert.ok(Math.abs(dist(a,b)-d.a)<1e-7);
 assert.ok(Math.abs(dist(d.at(0,0),d.at(0,d.v))-dist(d.vertices.B0,d.vertices.T0))<1e-7);
 for(const panel of d.panels)assert.equal(panel.points.length,3);
 cases++;
}
const def=sealSvg();assert.ok(def.fit);assert.match(def.svg,/S1a/);assert.match(def.svg,/S1b/);assert.match(def.svg,/NOT validated/);
const a=sealDesign(),b=sealDesign({tail:50});assert.deepEqual(a.panels,b.panels);assert.ok(b.bounds.h>a.bounds.h);
assert.throws(()=>sealDesign({n:2}));assert.throws(()=>sealDesign({radius:NaN}));
console.log(`PASS: ${cases} static reference nets, triangle-edge preservation, seam closure at reference pose, tail independence and marked validation limits. No actuation/end-membrane validation claimed.`);
