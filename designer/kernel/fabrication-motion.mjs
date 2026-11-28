// Exact rigid-tail prefolds and the outward branch of the closed six-panel box.
import {pose,distance} from './geometry.mjs';
const add=(a,b)=>a.map((x,i)=>x+b[i]),sub=(a,b)=>a.map((x,i)=>x-b[i]),mul=(a,s)=>a.map(x=>x*s);
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=v=>Math.hypot(...v),unit=v=>mul(v,1/norm(v));
const rotate=(v,a,u,angle)=>{const q=sub(v,a),c=Math.cos(angle),s=Math.sin(angle);return add(a,add(add(mul(q,c),mul(cross(u,q),s)),mul(u,dot(u,q)*(1-c))));};
export function prefoldMaps(net,left=1,right=1){
 const maps=net.faces.map(f=>Object.fromEntries(f.ids.map(id=>[id,[-f.flat[id][0],f.flat[id][1],0]])));
 for(const [j,progress] of [[1,left],[4,right]]){
  if(progress===0)continue;
  const edge=net.hinges[j],[a,b]=edge.map(id=>maps[j][id]),u=unit(sub(b,a));
  const radial=maps[j+1][net.faces[j+1].ids.find(id=>!edge.includes(id))];
  const sign=Math.sign(cross(u,sub(radial,a))[2])||1;
  for(let f=j+1;f<maps.length;f++)for(const id of Object.keys(maps[f]))maps[f][id]=rotate(maps[f][id],a,u,Math.PI*sign*progress);
 }
 return maps;
}
export function outwardMaps(p,net,progress){
 const v=pose({...p,opening:progress}).v;
 // At the straight-wall tangency both branches are the same pose. Reuse its
 // vertex map exactly rather than reflecting square-root roundoff at tangency.
 if(progress===1)return net.faces.map(f=>Object.fromEntries(f.ids.map(id=>[id,v[id]])));
 for(const [bottom,top,middle] of [[['A','D'],['E','J'],['K','L']],[['B','C'],['F','G'],['M','N']]]){
  const a=v[bottom[0]],axis=sub(v[bottom[1]],a),rise=progress===0?[0,0,1]:sub(v[top[0]],a),normal=unit(cross(axis,rise));
  // Reflect only the middle hinge across the plane of its two outer hinges.
  // The outer lines are fixed by this reflection; both side facets stay rigid.
  for(const id of middle)v[id]=sub(v[id],mul(normal,2*dot(sub(v[id],a),normal)));
 }
 return net.faces.map(f=>Object.fromEntries(f.ids.map(id=>[id,v[id]])));
}
export {panelsCoplanar} from './surface-contacts.mjs';
export function pairError(a,b){return Math.min(Math.max(distance(a[0],b[0]),distance(a[1],b[1])),Math.max(distance(a[0],b[1]),distance(a[1],b[0])));}
