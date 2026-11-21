import assert from 'node:assert/strict';
import {twoLinkRange,twoLinkJoint,concurrentAxisRange,concurrentMiddleAxis} from './folding-constraints.mjs';
import {record} from './geometry.mjs';
const dist=(a,b)=>Math.hypot(...a.map((x,i)=>x-b[i]));
const near=(a,b)=>assert(Math.abs(a-b)<1e-8,`${a} != ${b}`);
assert.deepEqual(twoLinkRange(20,28),{minimum:8,maximum:48,coincidentEndpointsPossible:false});
assert.equal(twoLinkJoint([0,0],[0,7],20,28),null);
let count=0;
for(const [a,b] of [[24,24],[20,28],[10,30]]){
 const r=twoLinkRange(a,b);
 for(let i=1;i<=100;i++)for(const theta of [.1,.6,1.4])for(const branch of [-1,1]){
  const d=r.minimum+(r.maximum-r.minimum)*i/100,A=[3,-7],B=[A[0]+d*Math.cos(theta),A[1]+d*Math.sin(theta)],M=twoLinkJoint(A,B,a,b,branch);
  near(dist(A,M),a);near(dist(B,M),b);count++;
 }
}
const rad=x=>x*Math.PI/180;
for(const [a,b] of [[10,10],[7,13],[20,30]]){
 const alpha=rad(a),beta=rad(b),r=concurrentAxisRange(alpha,beta);
 if(r.minimum>0)assert.equal(concurrentMiddleAxis(alpha,beta,r.minimum/2),null);
 for(let i=1;i<=100;i++){
  const phi=r.minimum+(r.maximum-r.minimum)*i/100,u=concurrentMiddleAxis(alpha,beta,phi);
  near(Math.hypot(...u),1);near(u[1],Math.cos(alpha));near(u[1]*Math.cos(phi)+u[2]*Math.sin(phi),Math.cos(beta));count++;
 }
}
// Two distinct inward-folding configurations of the SAME box linkage,
// at the SAME height: pure translation is not imposed by the six hinges.
const alternatives=[];
for(const shift of [0,5]){
 const A=[0,0],B=[60,0],E=[shift,30],F=[60+shift,30],L=twoLinkJoint(A,E,24,24,-1),R=twoLinkJoint(B,F,24,24,1);
 for(const [a,b,len] of [[A,B,60],[B,R,24],[R,F,24],[F,E,60],[E,L,24],[L,A,24]])near(dist(a,b),len);
 assert(L[0]<R[0]);assert(L[0]>0&&R[0]<65);
 alternatives.push({shiftMm:shift,heightMm:30,vertices:{A,B,E,F,L,R}});
}
const r=record();assert.equal(r.designRules.sideFoldDirection,'inward');assert.equal(r.futureExtensions[0].status,'deferred');
console.log(JSON.stringify({checks:count,unequalSpansExample:twoLinkRange(20,28),unequalSectorMinimumDeg:concurrentAxisRange(rad(7),rad(13)).minimum*180/Math.PI,sameDesignAlternativePoses:alternatives,scope:'Ideal local reachability and explicit non-unique poses; not full film or pressure simulation.'},null,2));
