import {panelStyle} from '../adapters/presentation.mjs';
import {viewPoint} from '../view-controls.mjs';
// Generic polygon/mesh renderer. Object shapes and paths arrive already computed.
const palette={tool:'#9ba9b0',accessory:'#628b9b',bond:'#e7a557',film:'#c3dce3'};
function shade(color,points){
 const a=points[0],b=points[1],c=points[2],u=b.map((v,i)=>v-a[i]),v=c.map((x,i)=>x-a[i]),n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],length=Math.hypot(...n);
 const light=length?Math.abs((n[0]*.3-n[1]*.4+n[2]*.85)/length)/Math.hypot(.3,.4,.85):1,factor=.68+.32*light;
 return '#'+color.slice(1).match(/../g).map(x=>Math.round(parseInt(x,16)*factor).toString(16).padStart(2,'0')).join('');
}
export function meshSceneSVG({panels=[],meshes=[],film=[]},camera,view){
 const supplied=new Set(meshes.filter(m=>m.role==='panel').map(m=>m.panelId??m.id));
 const polygons=[...film.map(p=>({...p,role:'film'})),...panels.filter(p=>!supplied.has(p.id)).map(p=>({...p,role:'panel'})),...meshes.flatMap(mesh=>mesh.faces.map((face,i)=>({id:mesh.panelId??mesh.id,face:i,role:mesh.role,solid:mesh.role==='panel',pointsMm:face.map(index=>mesh.verticesMm[index])})))];
 const faces=polygons.map(p=>({...p,points:p.pointsMm.map(v=>viewPoint(camera.project(v),view))}));
 faces.sort((a,b)=>a.points.reduce((s,p)=>s+p[2],0)/a.points.length-b.points.reduce((s,p)=>s+p[2],0)/b.points.length);
 return `<svg viewBox="0 0 720 330" xmlns="http://www.w3.org/2000/svg">${faces.map(p=>{
  const film=p.role==='film',panel=p.role==='panel',base=palette[p.role]??(panel?panelStyle(p.id).color:'#a9b5ac');
  return `<polygon data-scene-role="${p.role}" data-entity="${p.id}" points="${p.points.map(q=>q.slice(0,2).join(',')).join(' ')}" fill="${film||panel&&!p.solid?base:shade(base,p.pointsMm)}" fill-opacity="${film ? .22 : panel&&!p.solid ? .9 : 1}" stroke="${film?'#9ab9be':panel?'#476661':'#44565e'}" stroke-opacity="${film ? .7 : p.role==='accessory' ? .25 : 1}" stroke-width="${panel ? 1.2 : film ? .65 : .35}" stroke-linejoin="round"/>`;
 }).join('')}</svg>`;
}
