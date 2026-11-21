// Common-edge cutting layout of convex physical panels. No scaling or reflection.
// Greedy edge matching, not a globally optimal nesting/guillotine-cut solver.
const EPS=1e-7;
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1]];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1];
const cross=(a,b)=>a[0]*b[1]-a[1]*b[0];
const length=a=>Math.hypot(...a);
const edges=poly=>poly.map((a,i)=>[a,poly[(i+1)%poly.length]]);
const signedArea=p=>edges(p).reduce((s,[a,b])=>s+cross(a,b),0)/2;
function bounds(group){
 const pts=group.flatMap(f=>f.panel),xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]);
 const x=Math.min(...xs),y=Math.min(...ys);
 return {x,y,w:Math.max(...xs)-x,h:Math.max(...ys)-y};
}
function transform(group,fn){return group.map(f=>({...f,panel:f.panel.map(fn)}));}
function rotate(group,angle){const c=Math.cos(angle),s=Math.sin(angle);return transform(group,([x,y])=>[c*x-s*y,s*x+c*y]);}
function overlaps(a,b){
 for(const p of [a,b])for(const [u,v] of edges(p)){
  const e=sub(v,u),len=length(e);if(len<EPS)continue;
  const n=[-e[1]/len,e[0]/len],aa=a.map(q=>dot(q,n)),bb=b.map(q=>dot(q,n));
  if(Math.max(...aa)<=Math.min(...bb)+EPS||Math.max(...bb)<=Math.min(...aa)+EPS)return false;
 }return true;
}
function sameEdge(a,b,c,d){return length(sub(a,d))<EPS&&length(sub(b,c))<EPS;}
function sharedLength(a,b){let sum=0;for(const f of a)for(const h of b)for(const [u,v] of edges(f.panel))for(const [x,y] of edges(h.panel))if(sameEdge(u,v,x,y))sum+=length(sub(v,u));return sum;}
function orient(group,page){
 const a=bounds(group),turned=rotate(group,Math.PI/2),b=bounds(turned);
 const score=q=>Math.max(q.w/page[0],q.h/page[1]);
 return score(b)<score(a)-EPS?turned:group;
}
export function cuttingLayout(faces,page=[281,186]){
 let groups=faces.map(f=>{
  // Uniform winding lets reversed edge endpoints place interiors on opposite sides.
  const panel=signedArea(f.panel)<0?[...f.panel].reverse():f.panel.map(p=>[...p]);
  const [a,b]=edges(panel).sort((a,b)=>length(sub(b[1],b[0]))-length(sub(a[1],a[0])))[0];
  const d=sub(b,a);return rotate([{...f,panel}],Math.PI/2-Math.atan2(d[1],d[0]));
 });
 while(groups.length>1){
  let best=null;
  for(let i=0;i<groups.length;i++)for(let j=i+1;j<groups.length;j++){
   const A=groups[i],B=groups[j];
   for(const f of A)for(const h of B)for(const [a,b] of edges(f.panel))for(const [c,d] of edges(h.panel)){
    const v=sub(b,a),u=sub(c,d);if(Math.abs(length(v)-length(u))>EPS)continue;
    const angle=Math.atan2(v[1],v[0])-Math.atan2(u[1],u[0]),co=Math.cos(angle),si=Math.sin(angle);
    const moved=transform(B,p=>{const q=sub(p,d);return [a[0]+co*q[0]-si*q[1],a[1]+si*q[0]+co*q[1]];});
    if(A.some(f=>moved.some(h=>overlaps(f.panel,h.panel))))continue;
    const joined=orient([...A,...moved],page),box=bounds(joined),shared=sharedLength(A,moved);
    const overflow=Math.max(1,box.w/page[0],box.h/page[1]);
    // First prefer printable clusters, then longer shared cuts, then compact bounds.
    const score=[overflow,-shared,box.w*box.h,box.w+box.h];
    const better=!best||score.some((v,k)=>v<best.score[k]-EPS&&score.slice(0,k).every((x,n)=>Math.abs(x-best.score[n])<=EPS));
    if(better)best={i,j,joined,score};
   }
  }
  if(!best)break;
  groups[best.i]=best.joined;groups.splice(best.j,1);
 }
 // Only unmatched components need spacing; never introduce gaps within a cluster.
 let x=0,y=0,row=0;const packed=[];
 for(let g of groups){g=orient(g,page);const b=bounds(g);if(x&&x+b.w>page[0]){x=0;y+=row+4;row=0;}
  packed.push(...transform(g,p=>[p[0]-b.x+x,p[1]-b.y+y]));x+=b.w+4;row=Math.max(row,b.h);
 }
 return {faces:faces.map(f=>packed.find(p=>p.id===f.id)),components:groups.length};
}

// Union of collinear boundary intervals: a shared cut is emitted only once,
// including incidental partial matches and adjoining segments on the same line.
export function cuttingSegments(faces){
 const lines=[];
 for(const f of faces)for(const [a,b] of edges(f.panel)){
  let u=sub(b,a),n=length(u);if(n<EPS)continue;u=u.map(v=>v/n);
  if(u[0]<-EPS||(Math.abs(u[0])<EPS&&u[1]<0))u=u.map(v=>-v);
  const normal=[-u[1],u[0]],offset=dot(normal,a);
  let line=lines.find(l=>Math.abs(cross(l.u,u))<1e-9&&Math.abs(l.offset-offset)<EPS);
  if(!line){line={u,normal,offset,intervals:[]};lines.push(line);}
  line.intervals.push([dot(line.u,a),dot(line.u,b)].sort((a,b)=>a-b));
 }
 const result=[];
 for(const l of lines){const merged=[];for(const interval of l.intervals.sort((a,b)=>a[0]-b[0])){
  const last=merged.at(-1);if(last&&interval[0]<=last[1]+EPS)last[1]=Math.max(last[1],interval[1]);else merged.push([...interval]);
 }for(const [a,b] of merged){const point=t=>[l.u[0]*t+l.normal[0]*l.offset,l.u[1]*t+l.normal[1]*l.offset];result.push({a:point(a),b:point(b)});}}
 return result;
}
