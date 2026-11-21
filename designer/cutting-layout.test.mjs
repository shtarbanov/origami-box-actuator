import assert from 'node:assert/strict';
import {sheet,unfold,distance} from './geometry.mjs';
import {cuttingLayout,cuttingSegments} from './cutting-layout.mjs';
const area=p=>Math.abs(p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-a[1]*b[0];},0)/2);
const distances=p=>p.flatMap((a,i)=>p.slice(i+1).map(b=>distance(a,b))).sort((a,b)=>a-b);
let cases=0;
for(const kind of ['rectangle','taper','wedge','hinge'])for(const gap of [1,4,7])for(const length of [40,75,120]){
 const p={kind,length,gap,width0:64,width1:48,l0:16,l1:8};
 const original=unfold(p,true),cut=sheet(p,false),net=cut.net;
 assert.equal(net.cuttingComponents,1,JSON.stringify(p));
 assert.equal(net.collisions.length,0);
 assert.equal(net.faces.length,original.faces.length);
 for(const f of net.faces){const source=original.faces.find(s=>s.id===f.id);
  assert.ok(Math.abs(area(source.panel)-area(f.panel))<1e-7);
  const a=distances(source.panel),b=distances(f.panel);assert.equal(a.length,b.length);
  a.forEach((v,i)=>assert.ok(Math.abs(v-b[i])<1e-7));
 }
 const perimeter=net.faces.reduce((s,f)=>s+f.panel.reduce((t,a,i)=>t+distance(a,f.panel[(i+1)%f.panel.length]),0),0);
 const cuts=net.cuts.reduce((s,e)=>s+distance(e.a,e.b),0);
 assert.ok(cuts<perimeter-1,'Shared boundaries must be drawn only once');
 assert.equal((cut.svg.match(/data-cut="true"/g)||[]).length,net.cuts.length);
 cases++;
}
const rectangle=sheet({kind:'rectangle'},false);
assert.equal(rectangle.net.cuts.length,9); // 7 vertical cuts + 2 uninterrupted horizontal cuts.
assert.ok(Math.abs(rectangle.size[0]-168)<1e-7); // 2*44 + 4*20, with no added cutting gaps.
assert.ok(Math.abs(rectangle.size[1]-75)<1e-7);
const apex=sheet({kind:'wedge',width0:60,l0:24,l1:0},false);
assert.equal(apex.net.collisions.length,0);assert.ok(apex.fit);
// Apex relief shortens the large panels; do not stretch them to force an edge match.
assert.equal(apex.net.cuttingComponents,2);
const tooLarge=sheet({kind:'rectangle',length:300,width0:200,l0:60},false);
assert.equal(tooLarge.fit,false);
assert.ok(Math.max(...tooLarge.size)>=300-1e-7,'Never shrink physical dimensions to fit paper');
const poly=panel=>({id:String(panel),panel});
const triangles=cuttingLayout([poly([[0,0],[20,0],[5,10]]),poly([[0,0],[20,0],[5,10]])]);
assert.equal(triangles.components,1);
// Partially overlapping collinear boundaries also emit a single interval.
const segments=cuttingSegments([poly([[0,0],[10,0],[0,4]]),poly([[5,0],[15,0],[15,-3]])]);
const horizontal=segments.filter(s=>Math.abs(s.a[1])<1e-7&&Math.abs(s.b[1])<1e-7);
assert.equal(horizontal.length,1);assert.ok(Math.abs(distance(horizontal[0].a,horizontal[0].b)-15)<1e-7);
console.log(`PASS: ${cases} common-edge layouts; rigid dimensions/areas; no overlap; single cut lines; apex relief; oversized paper; triangle matching.`);
