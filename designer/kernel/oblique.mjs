// A congruent top rotates about a fixed horizontal axis in the bottom plane.
// Each side is an equal-angle 3R chain through the intersection of that axis
// with the side line (or its parallel-axis limit). No deforming rigid panels.
const add=(a,b)=>a.map((x,i)=>x+b[i]),sub=(a,b)=>a.map((x,i)=>x-b[i]),mul=(a,s)=>a.map(x=>x*s);
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=a=>Math.hypot(...a),unit=a=>mul(a,1/norm(a));
const increment=(v,u,t)=>add(mul(cross(u,v),Math.sin(t)),mul(cross(u,cross(u,v)),2*Math.sin(t/2)**2));
export function obliqueData(p){
 const x=Math.sin(p.rollDeg*Math.PI/180),z0=2*p.l0-Math.abs(x)*p.width0/2;
 const y=(2*(p.l1-p.l0)-Math.abs(x)*(p.width1-p.width0)/2)/p.length,s=Math.hypot(x,y);
 if(s>=1-1e-9)throw Error('The requested front/rear and left/right slopes cannot belong to one rigid top: squared edge slopes must sum to less than 1.');
 if(z0-Math.abs(x)*p.width0/2<=1e-7||z0+y*p.length-Math.abs(x)*p.width1/2<=1e-7)throw Error('Both ends of each folding wall must have positive rise. Reduce left/right tilt or increase the lower end height.');
 const angle=Math.asin(s),axis=[y/s,-x/s,0],origin=mul([x,y,0],-z0/(s*s));
 const bottom={A:[-p.width0/2,0,0],B:[p.width0/2,0,0],C:[p.width1/2,p.length,0],D:[-p.width1/2,p.length,0]};
 const top=q=>add(q,increment(sub(q,origin),axis,angle));
 return {axis,origin,angle,bottom,top};
}
export function obliqueVertices(p,opening=1){
 const q=obliqueData(p),v={...q.bottom};
 for(const [b,t] of [['A','E'],['B','F'],['C','G'],['D','J']])v[t]=add(v[b],increment(sub(v[b],q.origin),q.axis,q.angle*opening));
 for(const [bottom,top,middle,sign] of [[['A','D'],['E','J'],['K','L'],1],[['B','C'],['F','G'],['M','N'],-1]]){
  const b=v[bottom[0]],d=unit(sub(v[bottom[1]],b)),gradient=cross(d,q.axis)[2];
  const inward=[sign,0,0];
  if(Math.abs(gradient)<1e-9){
   const half=norm(sub(q.top(b),b))/2,chord=sub(v[top[0]],b),depth=Math.sqrt(Math.max(0,half*half-dot(chord,chord)/4));
   let n=norm(chord)<1e-10?unit(cross(d,[0,0,1])):unit(cross(d,chord));if(dot(n,inward)<0)n=mul(n,-1);
   middle.forEach((id,i)=>v[id]=add(mul(add(v[bottom[i]],v[top[i]]),.5),mul(n,depth)));
  }else{
   // Intersection of b+t*d and origin+s*axis, both in z=0.
   const t=cross(sub(q.origin,b),q.axis)[2]/gradient;
   const k2=dot(cross(d,q.axis),cross(d,q.axis)),sf2=k2*Math.sin(q.angle/2)**2,sg2=k2*Math.sin(q.angle*opening/2)**2,cb=Math.sqrt(1-sf2);
   let offset;
   if(opening===0){let n=unit(cross(d,[0,0,1]));if(dot(mul(n,-t),inward)<0)n=mul(n,-1);offset=add(mul(d,-sf2/(1+cb)),mul(n,Math.sqrt(sf2)));}
   else{
    const dw=increment(d,q.axis,q.angle*opening),base=add(mul(d,(-sf2/(1+cb)+sg2)/(1-sg2)),mul(dw,cb/(2*(1-sg2)))),n=unit(cross(d,dw)),radial=(sf2-sg2)/(1-sg2);
    if(radial < -1e-9)throw Error('The requested orientation exceeds a side wall’s fixed angular reach.');
    const options=[add(base,mul(n,Math.sqrt(Math.max(0,radial)))),sub(base,mul(n,Math.sqrt(Math.max(0,radial))))];
    offset=options.sort((a,b)=>dot(mul(b,-t),inward)-dot(mul(a,-t),inward))[0];
   }
   middle.forEach((id,i)=>v[id]=add(v[bottom[i]],mul(offset,-t+i*norm(sub(v[bottom[1]],b)))));
  }
 }
 return v;
}
export function obliqueProof(p){
 const v=obliqueVertices(p,0),pairs=[['A','K'],['D','L'],['B','M'],['C','N']];
 const reach=Math.max(...pairs.map(([a,b])=>Math.abs(v[a][0]-v[b][0])));
 return {model:'6R with a horizontal stationary rotation axis and unequal side-wall profiles',continuous:true,
  requiredWidthMm:2*reach,availableWidthMm:Math.min(p.width0,p.width1),widthMarginMm:Math.min(p.width0,p.width1)-2*reach,
  conditions:['Top and bottom are congruent rigid plates.','Each side has a fixed apex or parallel axes; middle axes intersect fixed equal-angle cones.','Front/rear and left/right edge slopes satisfy sx² + sy² < 1.','Each panel preserves all pairwise vertex distances throughout the constructed path.'],
  limits:['Collision and assembly clearance require sampled checks.','End-film sealing geometry and pneumatic realization require physical validation.']};
}
