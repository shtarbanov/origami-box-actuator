// Generic convex-surface/prism contacts. No actuator topology or solver imports.
const sub=(a,b)=>a.map((x,i)=>x-b[i]),add=(a,b)=>a.map((x,i)=>x+b[i]),mul=(a,s)=>a.map(x=>x*s);
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=a=>Math.hypot(...a),unit=a=>mul(a,1/norm(a)),eps=1e-7;
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
export function panelsCoplanar(a,b,tolerance=1e-6){
 const first=a[0];let n;
 for(let i=1;i<a.length-1;i++){const q=cross(sub(a[i],first),sub(a[i+1],first));if(norm(q)>1e-10){n=unit(q);break;}}
 return !!n&&b.every(v=>Math.abs(dot(sub(v,first),n))<=tolerance);
}
