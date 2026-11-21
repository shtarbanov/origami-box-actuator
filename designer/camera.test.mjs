import assert from 'node:assert/strict';
import {cameraFrame,fixedCamera} from './camera.mjs';
import {defaultView,viewPoint,zoomAt} from './view-controls.mjs';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
let checks=0;
for(const p of [{kind:'rectangle'},{kind:'taper',width0:64,width1:48,l0:20},{kind:'wedge',width0:60,l0:24,l1:0},{kind:'hinge'}])for(const mode of ['actuation','assembly']){
 const frame=cameraFrame(p,mode),other=cameraFrame({...p,opening:.13},mode);
 assert.deepEqual(frame,other);
 for(let az=-180;az<=180;az+=30)for(let el=-80;el<=80;el+=20){
  const cam=fixedCamera(p,mode,az,el,frame),o=cam.project(frame.center);
  near(o[0],360);near(o[1],155);near(cam.scale,frame.scale);
  // Orthographic projection of three unit axes must retain total squared
  // screen length 2*s^2, independent of viewing direction (no orbit zoom).
  const axes=[0,1,2].map(k=>cam.project(frame.center.map((v,i)=>v+(i===k?1:0))));
  near(axes.reduce((s,q)=>s+(q[0]-o[0])**2+(q[1]-o[1])**2,0),2*frame.scale**2);
  const v={...defaultView(),panX:31,panY:-17};
  const pivot=viewPoint(o,v);near(pivot[0],391);near(pivot[1],138);
  const zoom=zoomAt(v,2,pivot[0],pivot[1]);
  const a=viewPoint(axes[0],v),b=viewPoint(axes[0],zoom);
  near(Math.hypot(b[0]-pivot[0],b[1]-pivot[1]),2*Math.hypot(a[0]-pivot[0],a[1]-pivot[1]));
  checks++;
 }
}
console.log(`PASS: ${checks} camera orientations; fixed scale/pivot across orbit and folding; explicit zoom still works.`);
