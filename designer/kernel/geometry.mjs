// Experimental panel-net geometry. Units: mm. No pressure/material simulation.
import {wedgeVertices,hingeVertices,proofConditions} from './mechanism.mjs';
import {cuttingLayout,cuttingSegments} from './cutting-layout.mjs';
import {combinedVertices} from './combined.mjs';
import {rearApexRelief} from './fabrication.mjs';
import {taperedHingeVertices} from './tapered-hinge.mjs';
import {obliqueVertices} from './oblique.mjs';
export const defaults={kind:'rectangle',length:75,width0:48,width1:36,l0:24,l1:12,gap:4,clearance:4,opening:.75,thickness:.3};
const add=(a,b)=>a.map((x,i)=>x+b[i]), sub=(a,b)=>a.map((x,i)=>x-b[i]);
const mul=(a,s)=>a.map(x=>x*s), dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const norm=a=>Math.hypot(...a), unit=a=>mul(a,1/norm(a));
export const distance=(a,b)=>norm(sub(a,b));
const center=ps=>mul(ps.reduce((s,p)=>add(s,p),ps[0].map(()=>0)),1/ps.length);
const cross2=(a,b)=>a[0]*b[1]-a[1]*b[0];
const eps=1e-7;
export function parameters(input={}){
 const p={...defaults,...input};
 for(const k of ['length','width0','width1','l0','l1','gap','clearance','opening'])if(!Number.isFinite(p[k]))throw Error('Dimensions must be finite numbers.');
 if(!['rectangle','taper','wedge','hinge','combined','tapered-hinge','oblique'].includes(p.kind))throw Error('Unknown geometry construction.');
 if(p.kind==='oblique'&&(!Number.isFinite(p.rollDeg)||p.rollDeg===0||Math.abs(p.rollDeg)>=90))throw Error('Compound tilt requires a finite, non-zero lateral inclination within ±90°.');
 if(!Number.isFinite(p.thickness)||p.thickness<0||p.thickness>2)throw Error('Panel thickness must be between 0 and 2 mm.');
 if(p.length<10||p.width0<10||p.width1<10||p.l0<2||p.l1<0||p.gap<1||p.clearance<1)throw Error('Check the minimum length, width, folding depth and clearances.');
 if(['rectangle','hinge'].includes(p.kind)) {p.width1=p.width0;p.l1=p.l0;}
 if(p.kind==='taper')p.l1=p.l0;
 if(p.kind==='wedge')p.width1=p.width0;
 const proof=proofConditions(p);
 if(proof.widthMarginMm < -eps)throw Error(`Required minimum hinge-axis width: ${proof.requiredWidthMm.toFixed(3)} mm.`);
 p.opening=Math.min(1,Math.max(0,p.opening));
 return p;
}
export function model(input={}){
 const p=parameters(input), H=p.length,w0=p.width0,w1=p.width1;
 if(['hinge','tapered-hinge'].includes(p.kind))return {p,v:p.kind==='hinge'?hingeVertices(p,1):taperedHingeVertices(p,1),faces:[
 {id:'bottom',ids:['A','B','C','D']},
 {id:'right-lower',ids:['B','C','N','M']},
 {id:'right-upper',ids:['M','N','G','F']},
 {id:'top',ids:['A','D','G','F']}],
 hinges:[['B','C'],['M','N'],['F','G']],seam:['A','D'],solidHingeIndices:[2],
 insetEdges:[[ ['A','D'],['B','C'] ],[ ['B','C'],['M','N'] ],[ ['M','N'],['F','G'] ],[ ['A','D'],['F','G'] ]],
 ends:[{face:0,edges:[['A','B'],['D','C']]},{face:3,edges:[['A','F'],['D','G']]}]};
 // Reference assembled pose; inclined-family vertices are replaced below to preserve congruent plates.
 const v={A:[-w0/2,0,0],B:[w0/2,0,0],C:[w1/2,H,0],D:[-w1/2,H,0],
 E:[-w0/2,0,2*p.l0],F:[w0/2,0,2*p.l0],G:[w1/2,H,2*p.l1],J:[-w1/2,H,2*p.l1],
 K:[-w0/2,0,p.l0],L:[-w1/2,H,p.l1],M:[w0/2,0,p.l0],N:[w1/2,H,p.l1]};
 if(p.kind==='wedge'){const w=wedgeVertices(p,1);if(w)Object.assign(v,w);}
 if(p.kind==='combined'){const w=combinedVertices(p,1);if(w)Object.assign(v,w);}
 if(p.kind==='oblique')Object.assign(v,obliqueVertices(p,1));
 const faces=[{id:'bottom',ids:['A','B','C','D']},
 {id:'left-lower',ids:['A','D','L','K']},
 {id:'left-upper',ids:['K','L','J','E']},
 {id:'top',ids:['E','J','G','F']},
 {id:'right-upper',ids:['F','G','N','M']},
 {id:'right-lower',ids:['M','N','C','B']}];
 const hinges=[['A','D'],['K','L'],['E','J'],['F','G'],['M','N']];
 const endDepths=p.kind==='oblique'?[Math.max(distance(v.A,v.K),distance(v.B,v.M)),Math.max(distance(v.D,v.L),distance(v.C,v.N))]:[p.l0,p.l1];
 return {p,v,faces,hinges,endDepths,seam:['B','C'],solidHingeIndices:[2,3,5],
 insetEdges:[[['A','D'],['B','C']],[['A','D'],['K','L']],[['K','L'],['E','J']],[['E','J'],['F','G']],[['F','G'],['M','N']],[['M','N'],['B','C']]],
 ends:[{face:0,edges:[['A','B'],['D','C']]},{face:3,edges:[['E','F'],['J','G']]}]};
}
function flatFace(v,ids,edge,ends,side){
 const [a,b]=edge, o=v[a],u=unit(sub(v[b],o));
 const off=ids.map(id=>sub(v[id],o)).find(d=>norm(sub(d,mul(u,dot(d,u))))>eps);
 if(!off)throw Error('A panel has collapsed to a line.');
 const vv=unit(sub(off,mul(u,dot(off,u)))), eu=unit(sub(ends[1],ends[0])), ev=mul([-eu[1],eu[0]],side);
 const flat={};
 for(const id of ids){const d=sub(v[id],o);if(Math.abs(dot(d,d)-dot(d,u)**2-dot(d,vv)**2)>1e-4)throw Error('A panel is not planar.');
 flat[id]=add(ends[0],add(mul(eu,dot(d,u)),mul(ev,dot(d,vv))));}
 return flat;
}
function offsetEdge(face,edge,amount){
 const [a,b]=edge.map(id=>face.flat[id]),u=unit(sub(b,a));let n=[-u[1],u[0]];
 if(dot(n,sub(center(Object.values(face.flat)),a))>0)n=mul(n,-1);
 return [add(a,mul(n,amount)),add(b,mul(n,amount))];
}
export function unfold(input={},folding=true,{stockSizeMm=[281,186]}={}){
 const m=model(input),{p,v,hinges}=m,faces=m.faces.map(f=>({...f}));
 faces[0].flat=Object.fromEntries(faces[0].ids.map(id=>[id,[-v[id][0],v[id][1]]]));
 // Unfold virtual hinge skeleton with NO gaps. Physical panels are inset below.
 const gap=0,folds=[],seals=[];
 for(let i=1;i<faces.length;i++){
 const edge=hinges[i-1],ends=offsetEdge(faces[i-1],edge,gap),d=sub(ends[1],ends[0]);
 const previousSide=Math.sign(cross2(d,sub(center(Object.values(faces[i-1].flat)),ends[0])))||1;
 faces[i].flat=flatFace(v,faces[i].ids,edge,ends,-previousSide);
 if(folding&&m.solidHingeIndices.includes(i))folds.push({a:mul(add(faces[i-1].flat[edge[0]],ends[0]),.5),b:mul(add(faces[i-1].flat[edge[1]],ends[1]),.5)});
 }
 if(folding){
 for(const fi of [0,faces.length-1]){const [a,b]=offsetEdge(faces[fi],m.seam,0);seals.push({a,b,role:'seam'});}
 for(const {face:fi,edges:pairs} of m.ends){
 pairs.forEach((edge,j)=>{const [a,b]=offsetEdge(faces[fi],edge,(m.endDepths?.[j]??(j?p.l1:p.l0))+p.clearance);seals.push({a,b,role:'end'});});
 }
 }
 const boundaryEdges=m.insetEdges;
 faces.forEach((f,i)=>{
   f.panel=f.ids.map(id=>f.flat[id]);
   for(const edge of boundaryEdges[i])f.panel=clipInset(f.panel,edge.map(id=>f.flat[id]),p.gap/2);
   // At the zero-height rear apex, solid top/bottom sheets would intersect
   // for every positive thickness. Leave a film-only relief of g/2 at that end.
   if(['wedge','combined'].includes(p.kind)&&p.l1===0&&[0,3].includes(i)){
     const edge=i===0?['D','C']:['J','G'];f.panel=clipInset(f.panel,edge.map(id=>f.flat[id]),rearApexRelief(p));
   }
   if(f.panel.length<3||Math.abs(area(f.panel))<1e-5)throw Error('The hinge gap leaves no panel area. Reduce the gap or increase the panel dimensions.');
 });
 let cuttingComponents=null;
 if(!folding){const layout=cuttingLayout(faces,stockSizeMm);layout.faces.forEach((f,i)=>{faces[i].panel=f.panel;});cuttingComponents=layout.components;}
 const top=faces[3];const end=offsetEdge(top,m.ends[1].edges[1],((m.endDepths?.[1]??p.l1)+p.clearance)/2);const inlet=folding?center(end):null;
 const all=faces.flatMap(f=>f.panel).concat(seals.flatMap(s=>[s.a,s.b]),folds.flatMap(s=>[s.a,s.b]));
 const bounds={minX:Math.min(...all.map(p=>p[0])),minY:Math.min(...all.map(p=>p[1])),maxX:Math.max(...all.map(p=>p[0])),maxY:Math.max(...all.map(p=>p[1]))};
 const net={...m,faces,folds,seals,inlet,bounds,folding,cuttingComponents};
 if(!folding)net.cuts=cuttingSegments(faces);
 net.collisions=[];
 for(let i=0;i<faces.length;i++)for(let j=i+1;j<faces.length;j++)if(overlap(faces[i].panel,faces[j].panel))net.collisions.push([faces[i].id,faces[j].id]);
 return net;
}
function area(poly){return poly.reduce((s,p,i)=>s+cross2(p,poly[(i+1)%poly.length]),0)/2;}
function clipInset(poly,[a,b],offset){
 const u=unit(sub(b,a)),n=[-u[1],u[0]],sign=dot(n,sub(center(poly),a))>=0?1:-1;
 const level=p=>sign*dot(n,sub(p,a))-offset;
 const out=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],da=level(a),db=level(b);if(da>=-eps)out.push(a);if((da>eps&&db < -eps)||(da < -eps&&db>eps))out.push(add(a,mul(sub(b,a),da/(da-db))));}
 return out.filter((p,i)=>i===0||distance(p,out[i-1])>eps).filter((p,i,ps)=>i!==ps.length-1||distance(p,ps[0])>eps);
}
export function panelWorld(net,f,vertices){
 const origin=f.ids.find(id=>true),b=f.ids.find(id=>distance(f.flat[id],f.flat[origin])>eps);
 const c=f.ids.find(id=>Math.abs(cross2(sub(f.flat[b],f.flat[origin]),sub(f.flat[id],f.flat[origin])))>eps);
 const o=f.flat[origin],u2=unit(sub(f.flat[b],o)),v2=[-u2[1],u2[0]],o3=vertices[origin],u3=unit(sub(vertices[b],o3));
 const cv=sub(vertices[c],o3),perp=sub(cv,mul(u3,dot(cv,u3))),sgn=Math.sign(dot(v2,sub(f.flat[c],o)));
 const v3=mul(unit(perp),sgn);
 return f.panel.map(p=>{const q=sub(p,o);return add(o3,add(mul(u3,dot(q,u2)),mul(v3,dot(q,v2))));});
}
// Convex separating-axis test; touching edges are not intersections.
function overlap(a,b){
 for(const poly of [a,b])for(let i=0;i<poly.length;i++){
 const e=sub(poly[(i+1)%poly.length],poly[i]);if(norm(e)<eps)continue;
 const axis=unit([-e[1],e[0]]),aa=a.map(p=>dot(p,axis)),bb=b.map(p=>dot(p,axis));
 if(Math.max(...aa)<=Math.min(...bb)+eps||Math.max(...bb)<=Math.min(...aa)+eps)return false;
 }return true;
}
export function lengthError(net){
 return Math.max(...net.faces.flatMap(f=>f.ids.map((a,i)=>{const b=f.ids[(i+1)%f.ids.length];return Math.abs(distance(net.v[a],net.v[b])-distance(f.flat[a],f.flat[b]));})));
}
export function pose(input={}){
 const m=model(input),{p}=m;
 if(p.kind==='oblique'){m.v=obliqueVertices(p,p.opening);return m;}
 if(p.kind==='hinge'){m.v=hingeVertices(p,p.opening);return m;}
 if(p.kind==='tapered-hinge'){m.v=taperedHingeVertices(p,p.opening);return m;}
 if(p.kind==='wedge'){const w=wedgeVertices(p,p.opening);if(w){m.v=w;return m;}}
 if(p.kind==='combined'){const w=combinedVertices(p,p.opening);if(w){m.v=w;return m;}}
 const h=2*p.l0*p.opening,ins=p.l0*Math.sqrt(1-p.opening**2);
 for(const id of ['E','F','G','J'])m.v[id][2]=h;
 for(const [ids,edge] of [[['K','L'],['A','D']],[['M','N'],['B','C']]]){
 const a=m.v[edge[0]],b=m.v[edge[1]],along=unit(sub(b,a));let n=[-along[1],along[0],0];
 if(dot(n,sub([0,p.length/2,0],a))<0)n=mul(n,-1);
 ids.forEach((id,i)=>m.v[id]=add(m.v[edge[i]],add(mul(n,ins),[0,0,h/2])));
 }return m;
}
