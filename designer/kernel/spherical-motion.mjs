// Alternative rigid paths in the coincident-apex 6R subfamily.
// This is a kinematic exploration; independent pneumatic control is not implied.
import {model,pose,unfold,panelWorld,distance} from './geometry.mjs';
import {contacts} from './validate.mjs';
import {DesignError} from './spec.mjs';
const sub=(a,b)=>a.map((x,i)=>x-b[i]),add=(a,b)=>a.map((x,i)=>x+b[i]),mul=(a,s)=>a.map(x=>x*s);
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=a=>Math.hypot(...a),unit=a=>mul(a,1/norm(a));
export function sphericalPose(p,progress,yawDeg){
 if(p.kind!=='combined'||Math.abs(p.width1/p.width0-p.l1/p.l0)>1e-9)throw new DesignError('NOT_CONCURRENT','/spec','Yaw exploration requires matching non-unit width and rise ratios.');
 if(!Number.isFinite(progress)||progress<0||progress>1||!Number.isFinite(yawDeg)||Math.abs(yawDeg)>90)throw new DesignError('INVALID_STATE','/state','Progress must be 0–1 and yaw within ±90 degrees.');
 const P=[0,p.width0*p.length/(p.width0-p.width1),0],m=model(p),reference=m.v,baseline=pose({...p,opening:progress}).v,v={...baseline};
 const delta=Math.asin(2*(p.l1-p.l0)/p.length),theta=delta*progress,yaw=yawDeg*Math.PI/180;
 const rotate=q=>{const [x,y,z]=sub(q,P),yy=y*Math.cos(theta)-z*Math.sin(theta),zz=y*Math.sin(theta)+z*Math.cos(theta);return add(P,[x*Math.cos(yaw)-yy*Math.sin(yaw),x*Math.sin(yaw)+yy*Math.cos(yaw),zz]);};
 for(const [a,b] of [['A','E'],['B','F'],['C','G'],['D','J']])v[b]=rotate(reference[a]);
 for(const [bottom,top,middle] of [[['A','D'],['E','J'],['K','L']],[['B','C'],['F','G'],['M','N']]]){
  const u=unit(sub(reference[bottom[0]],P)),w=unit(sub(v[top[0]],P)),refMiddle=unit(sub(reference[middle[0]],P)),cb=dot(u,refMiddle),c=dot(u,w);
  const radial=1-2*cb*cb/(1+c);
  if(radial<-1e-10)throw new DesignError('ORIENTATION_OUTSIDE_CONES','/state/yawDeg','This yaw exceeds the fixed side-panel angular reach.');
  let direction;
  if(norm(cross(u,w))<1e-10){if(Math.abs(yawDeg)>1e-8)throw new DesignError('SINGULAR_ORIENTATION','/state','Ambiguous axis intersection.');direction=unit(sub(baseline[middle[0]],P));}
  else{
   const n=unit(cross(u,w)),base=mul(add(u,w),cb/(1+c)),d=Math.sqrt(Math.max(0,radial));
   const options=[add(base,mul(n,d)),add(base,mul(n,-d))],preferred=unit(sub(baseline[middle[0]],P));
   direction=options.sort((a,b)=>dot(b,preferred)-dot(a,preferred))[0];
  }
  middle.forEach((id,i)=>{v[id]=add(P,mul(direction,distance(reference[bottom[i]],P)));});
 }
 const net=unfold(p),panels=net.faces.map(f=>({id:f.id,pointsMm:panelWorld(net,f,v)}));
 let error=0;for(const f of m.faces)for(const a of f.ids)for(const b of f.ids)error=Math.max(error,Math.abs(distance(reference[a],reference[b])-distance(v[a],v[b])));
 if(error>1e-7)throw new DesignError('ORIENTATION_PRECISION_FAILURE','/state','The requested orientation does not preserve the panel geometry within tolerance.');
 const pairs=contacts(panels.map(f=>f.pointsMm),p.thickness);
 return {schema:'origami-box/orientation-study/1',state:{mode:'orientation-study',progress,yawDeg},panels,contacts:pairs.map(pair=>pair.map(i=>panels[i].id)),maxRigidErrorMm:error,
  minimumHingeVertexHeightMm:Math.min(...Object.values(v).map(q=>q[2])),
  interpretation:'Alternative admissible path of a spherical 6R linkage. Passive pneumatic realization and end films are unverified.'};
}
