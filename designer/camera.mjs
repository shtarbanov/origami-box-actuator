import {pose,unfold,panelWorld} from './geometry.mjs';
import {assembly} from './validate.mjs';
import {frameFromPoints,cameraForFrame} from './ui/camera.mjs';
export function polygonArea3D(poly){
 const o=poly[0];let area=0;
 for(let i=1;i<poly.length-1;i++){
 const a=poly[i].map((v,k)=>v-o[k]),b=poly[i+1].map((v,k)=>v-o[k]);
 area+=Math.hypot(a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0])/2;
 }return area;
}
// Fit once in WORLD space. A sphere has the same projected extent at every
// viewing angle, so orbiting never changes scale or moves the rotation pivot.
export function cameraFrame(p,mode){
 const net=unfold(p,true),points=[];
 for(let i=0;i<=20;i++){
 const opening=i/20,m=pose({...p,opening});
 const panels=mode==='assembly'?assembly(p,opening).panels:net.faces.map(f=>panelWorld(net,f,m.v));
 points.push(...panels.flat());
 }
 return frameFromPoints(points);
}
export function fixedCamera(p,mode,azimuth=-38,elevation=28,frame=cameraFrame(p,mode)){
 return cameraForFrame(frame,azimuth,elevation);
}
