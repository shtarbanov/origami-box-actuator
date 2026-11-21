import {model,pose,unfold,panelWorld,distance} from './geometry.mjs';
import {proofConditions} from './mechanism.mjs';
const sub=(a,b)=>a.map((x,i)=>x-b[i]),add=(a,b)=>a.map((x,i)=>x+b[i]),mul=(a,s)=>a.map(x=>x*s);
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=a=>Math.hypot(...a),unit=a=>mul(a,1/norm(a)),eps=1e-7;
const center=ps=>mul(ps.reduce((a,b)=>add(a,b),[0,0,0]),1/ps.length);
function normal(poly){for(let i=1;i<poly.length-1;i++){const n=cross(sub(poly[i],poly[0]),sub(poly[i+1],poly[0]));if(norm(n)>eps)return unit(n);}throw Error('Degenerate panel');}
function interior(pt,poly,n){let sign=0;for(let i=0;i<poly.length;i++){const d=dot(n,cross(sub(poly[(i+1)%poly.length],poly[i]),sub(pt,poly[i])));if(Math.abs(d)<eps)return false;const s=Math.sign(d);if(sign&&s!==sign)return false;sign=s;}return true;}
function surfaceCross(a,b){
 const na=normal(a),nb=normal(b);
 if(norm(cross(na,nb))<eps&&Math.abs(dot(na,sub(b[0],a[0])))<eps){
  for(const poly of [a,b])for(let i=0;i<poly.length;i++){const axis=cross(na,sub(poly[(i+1)%poly.length],poly[i]));if(norm(axis)<eps)continue;const aa=a.map(p=>dot(p,axis)),bb=b.map(p=>dot(p,axis));if(Math.max(...aa)<=Math.min(...bb)+eps||Math.max(...bb)<=Math.min(...aa)+eps)return false;}return true;
 }
 for(const [p,q,n] of [[a,b,nb],[b,a,na]])for(let i=0;i<p.length;i++){
  const v=p[i],w=p[(i+1)%p.length],dv=dot(n,sub(v,q[0])),dw=dot(n,sub(w,q[0]));
  if((dv>eps&&dw < -eps)||(dv < -eps&&dw>eps)){const hit=add(v,mul(sub(w,v),dv/(dv-dw)));if(interior(hit,q,n))return true;}
 }return false;
}
function prism(poly,t){const n=normal(poly),v=poly.flatMap(p=>[add(p,mul(n,t/2)),add(p,mul(n,-t/2))]);const edges=poly.map((p,i)=>sub(poly[(i+1)%poly.length],p));return {v,edges:[...edges,n],normals:[n,...edges.map(e=>cross(e,n))]};}
export function collide(a,b,thickness=0){
 if(thickness===0)return surfaceCross(a,b);
 const A=prism(a,thickness),B=prism(b,thickness),axes=[...A.normals,...B.normals];
 for(const u of A.edges)for(const v of B.edges)axes.push(cross(u,v));
 for(const axis0 of axes){if(norm(axis0)<eps)continue;const axis=unit(axis0),aa=A.v.map(p=>dot(p,axis)),bb=B.v.map(p=>dot(p,axis));if(Math.max(...aa)<=Math.min(...bb)+eps||Math.max(...bb)<=Math.min(...aa)+eps)return false;}return true;
}
export function contacts(panels,thickness=0){const result=[];for(let i=0;i<panels.length;i++)for(let j=i+1;j<panels.length;j++)if(collide(panels[i],panels[j],thickness))result.push([i,j]);return result;}
export function worldPanels(input,opening){const net=unfold(input,true),m=pose({...input,opening});return net.faces.map(f=>panelWorld(net,f,m.v));}
export function audit(input,{samples=181,thickness=.3}={}){
 const net=unfold(input,true),reference=model(input),p=reference.p,collisions=[],thickCollisions=[];
 let maxRigidError=0,maxSeamError=0;
 for(let k=0;k<samples;k++){
  const opening=k/(samples-1),m=pose({...p,opening}),panels=net.faces.map(f=>panelWorld(net,f,m.v));
  for(const f of reference.faces)for(const a of f.ids)for(const b of f.ids)maxRigidError=Math.max(maxRigidError,Math.abs(distance(reference.v[a],reference.v[b])-distance(m.v[a],m.v[b])));
  // Independent rigid maps of first/last face must reconstruct BOTH ends of the closing seam.
  const a=net.faces[0],b=net.faces.at(-1),aa=panelWorld(net,{...a,panel:net.seam.map(id=>a.flat[id])},m.v),bb=panelWorld(net,{...b,panel:net.seam.map(id=>b.flat[id])},m.v);
  maxSeamError=Math.max(maxSeamError,distance(aa[0],bb[0]),distance(aa[1],bb[1]));
  if(k!==0){const pairs=contacts(panels,0);if(pairs.length)collisions.push({opening,pairs});}
  const tp=contacts(panels,thickness);if(tp.length)thickCollisions.push({opening,pairs:tp});
 }
 // Safe connected sample interval beginning at the fully open state.
 const lastCollision=thickCollisions.at(-1)?.opening;
 const minimumSampledSafeOpening=lastCollision===undefined?0:lastCollision>=1?null:Math.min(1,lastCollision+1/(samples-1));
 return {version:'kinematics/0.2',parameters:p,dimensionBasis:'hinge-axis dimensions; physical panel edges inset g/2',
 analytic:proofConditions(p),samples,thicknessMm:thickness,maxRigidErrorMm:maxRigidError,maxSeamErrorMm:maxSeamError,
 flatPanelOverlaps:net.collisions,zeroThicknessCrossings:collisions,finiteThicknessCollisions:thickCollisions,minimumSampledSafeOpening,
 numericalPass:maxRigidError<1e-6&&maxSeamError<1e-6&&net.collisions.length===0&&collisions.length===0,
 interpretation:'Analytic ideal closed-chain path plus sampled geometric checks. Positive thickness has a sampled safe range, not a continuous clearance certificate. Film end walls and seals remain unverified.'};
}
function rotate(p,a,u,angle){const q=sub(p,a),c=Math.cos(angle),s=Math.sin(angle);return add(a,add(add(mul(q,c),mul(cross(u,q),s)),mul(u,dot(u,q)*(1-c))));}
function relativeAngle(vertices1,vertices2,ids1,ids2,edge){
 const a=vertices1[edge[0]],u=unit(sub(vertices1[edge[1]],a));
 const radial=(vertices,ids)=>{const c=sub(center(ids.map(id=>vertices[id])),a);return unit(sub(c,mul(u,dot(c,u))));};
 const r=radial(vertices1,ids1),s=radial(vertices2,ids2);return Math.atan2(dot(u,cross(r,s)),dot(r,s));
}
export function assembly(input,progress=1,opening=.75){
 const net=unfold(input,true),target=pose({...input,opening});
 const maps=net.faces.map(f=>Object.fromEntries(f.ids.map(id=>[id,[-f.flat[id][0],f.flat[id][1],0]])));
 const panels=net.faces.map(f=>f.panel.map(([x,y])=>[-x,y,0]));
 const angles=[];
 for(let i=1;i<net.faces.length;i++){
  const edge=net.hinges[i-1],angle=relativeAngle(target.v,target.v,net.faces[i-1].ids,net.faces[i].ids,edge)-relativeAngle(maps[i-1],maps[i],net.faces[i-1].ids,net.faces[i].ids,edge);
  angles.push(Math.atan2(Math.sin(angle),Math.cos(angle)));
 }
 // All hinge angles advance synchronously. Checked separately from closed-chain actuation.
 for(let i=1;i<net.faces.length;i++){
  const edge=net.hinges[i-1],a=maps[i-1][edge[0]],u=unit(sub(maps[i-1][edge[1]],a));
  for(let j=i;j<net.faces.length;j++){for(const id of Object.keys(maps[j]))maps[j][id]=rotate(maps[j][id],a,u,angles[i-1]*progress);panels[j]=panels[j].map(p=>rotate(p,a,u,angles[i-1]*progress));}
 }
 return {panels,maps,angles};
}
export function assemblyAudit(input,{samples=91,thickness=.3,opening=.75}={}){
 const hits=[],thickHits=[];for(let k=0;k<samples;k++){const progress=k/(samples-1),a=assembly(input,progress,opening),c=contacts(a.panels,0),t=contacts(a.panels,thickness);if(c.length)hits.push({progress,pairs:c});if(t.length)thickHits.push({progress,pairs:t});}
 const a=assembly(input,1,opening),m=pose({...input,opening});let error=0;for(let i=0;i<a.maps.length;i++)for(const id of Object.keys(a.maps[i]))error=Math.max(error,distance(a.maps[i][id],m.v[id]));
 return {samples,opening,method:'synchronous hinge-angle interpolation from open net',maximumTargetPoseErrorMm:error,zeroThicknessCrossings:hits,finiteThicknessCollisions:thickHits,sampledPass:hits.length===0&&thickHits.length===0&&error<1e-6};
}
