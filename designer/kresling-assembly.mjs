import {sealDesign} from './seal-study.mjs';
import {contacts} from './validate.mjs';
const sub=(a,b)=>a.map((x,i)=>x-b[i]),add=(a,b)=>a.map((x,i)=>x+b[i]),mul=(a,s)=>a.map(x=>x*s),dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],norm=a=>Math.hypot(...a),unit=a=>mul(a,1/norm(a));
const normal=p=>unit(cross(sub(p[1],p[0]),sub(p[2],p[0])));
function rotate(p,a,u,t){const q=sub(p,a);return add(a,add(add(mul(q,Math.cos(t)),mul(cross(u,q),Math.sin(t))),mul(u,dot(u,q)*(1-Math.cos(t)))));}
export function assembly(input={},progress=1){
 const d=sealDesign(input),maps=d.triangles.map(t=>Object.fromEntries(t.ids.map((id,i)=>[id,[...t.points[i],0]]))),panels=d.panels.map(t=>t.points.map(p=>[...p,0])),angles=[];
 for(let i=1;i<maps.length;i++){
  const a=d.triangles[i-1],b=d.triangles[i],ids=a.ids.filter(id=>b.ids.includes(id)),u=unit(sub(d.vertices[ids[1]],d.vertices[ids[0]])),na=normal(a.ids.map(id=>d.vertices[id])),nb=normal(b.ids.map(id=>d.vertices[id]));
  const angle=Math.atan2(dot(u,cross(na,nb)),dot(na,nb));angles.push(angle);
  const origin=maps[i-1][ids[0]],axis=unit(sub(maps[i-1][ids[1]],origin));
  for(let j=i;j<maps.length;j++){for(const id of Object.keys(maps[j]))maps[j][id]=rotate(maps[j][id],origin,axis,angle*progress);panels[j]=panels[j].map(p=>rotate(p,origin,axis,angle*progress));}
 }
 const first=maps[0],last=maps.at(-1),seamError=Math.max(...['B0','T0'].map(id=>norm(sub(first[id],last[id]))));
 return {d,maps,panels,angles,seamError};
}
export function auditAssembly(input={},samples=1001,thickness=.3){
 const reference=assembly(input,0);let maxRigidError=0;const hits=[],thickHits=[];
 for(let k=0;k<samples;k++){
  const s=assembly(input,k/(samples-1));
  for(let i=0;i<s.panels.length;i++)for(let j=0;j<3;j++)for(let l=j+1;l<3;l++)maxRigidError=Math.max(maxRigidError,Math.abs(norm(sub(s.panels[i][j],s.panels[i][l]))-norm(sub(reference.panels[i][j],reference.panels[i][l]))));
  const a=contacts(s.panels,0),b=contacts(s.panels,thickness);if(a.length)hits.push({progress:k/(samples-1),pairs:a});if(b.length)thickHits.push({progress:k/(samples-1),pairs:b});
 }
 const end=assembly(input,1),d=end.d;let targetDistanceError=0;
 const occurrences=end.maps.flatMap(m=>Object.entries(m));
 for(const [id,a]of occurrences)for(const [jd,b]of occurrences)targetDistanceError=Math.max(targetDistanceError,Math.abs(norm(sub(a,b))-norm(sub(d.vertices[id],d.vertices[jd]))));
 return {parameters:d.p,samples,thicknessMm:thickness,maxRigidErrorMm:maxRigidError,finalSeamErrorMm:end.seamError,maxTargetPairDistanceErrorMm:targetDistanceError,zeroThicknessCrossings:hits,finiteThicknessCollisions:thickHits,scope:'Open rigid triangle strip only; film, tails, flanges and seal operations are not simulated. Sampled checks are not a continuous collision certificate.'};
}
// Fixed regular congruent end polygons, coaxial, parallel, fixed circumradius.
export function constraint(input={},height=20){
 const d=sealDesign(input),R=d.p.radius,delta=2*Math.PI/d.p.n,phi=d.p.twist*Math.PI/180,c2=d.p.height**2+2*R**2*(1-Math.cos(phi)),b2=d.p.height**2+2*R**2*(1-Math.cos(phi-delta));
 // b²-c²=-4R² sin(phi-delta/2) sin(delta/2): fixed lengths isolate phi.
 const s=(c2-b2)/(4*R**2*Math.sin(delta/2)),a=Math.asin(Math.max(-1,Math.min(1,s))),roots=[delta/2+a,delta/2+Math.PI-a];
 const exactPoses=roots.map(t=>({twistDeg:t*180/Math.PI,heightSquared:c2-2*R**2*(1-Math.cos(t))})).filter(x=>x.heightSquared>=-1e-8).map(x=>({...x,height:Math.sqrt(Math.max(0,x.heightSquared))}));
 let best={maxEdgeMismatchMm:Infinity};
 for(let i=0;i<=36000;i++){const t=i*Math.PI/18000,c=Math.sqrt(height**2+2*R**2*(1-Math.cos(t))),b=Math.sqrt(height**2+2*R**2*(1-Math.cos(t-delta))),e=Math.max(Math.abs(c-Math.sqrt(c2)),Math.abs(b-Math.sqrt(b2)));if(e<best.maxEdgeMismatchMm)best={height,twistDeg:t*180/Math.PI,maxEdgeMismatchMm:e};}
 return {exactPoses,bestSampledForcedHeight:best,assumptions:'Regular congruent fixed-radius end polygons, coaxial and parallel; ideal triangle edges and revolute hinges. Does not rule out compliant finite-width film hinges or distorted end rings.'};
}
