import {panelStyle} from '../adapters/presentation.mjs';
import {viewPoint} from '../view-controls.mjs';
function shade(color,points){
 const [a,b,c]=points,u=b.map((v,k)=>v-a[k]),v=c.map((v,k)=>v-a[k]),n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],L=Math.hypot(...n),f=.65+.35*Math.abs((n[0]*.3-n[1]*.4+n[2]*.85)/(L||1))/Math.hypot(.3,.4,.85);
 return /^#[0-9a-f]{6}$/i.test(color)?'#'+color.slice(1).match(/../g).map(x=>Math.round(parseInt(x,16)*f).toString(16).padStart(2,'0')).join(''):color;
}
export function sceneSVG(pose,camera,view,selection={}){
 const bad=new Set(pose.contacts.flat()),selected=new Set(selection.panelIds??[]);
 // All physical facets arrive from the kernel; the GUI never extrudes panels.
 const faces=pose.meshes?.length?pose.meshes.filter(m=>m.role==='panel').flatMap(m=>m.faces.map((f,i)=>({id:m.panelId,facet:i,pointsMm:f.map(k=>m.verticesMm[k]),solid:m.thicknessMm>0}))):pose.panels.map(p=>({...p,facet:0,solid:false}));
 const projected=faces.map(p=>({...p,points:p.pointsMm.map(v=>viewPoint(camera.project(v),view))}));
 projected.sort((a,b)=>a.points.reduce((s,p)=>s+p[2],0)/a.points.length-b.points.reduce((s,p)=>s+p[2],0)/b.points.length);
 const body=projected.map(p=>{const color=bad.has(p.id)?'#F09883':selected.has(p.id)?selection.color??panelStyle(p.id).color:panelStyle(p.id).color,accessible=!p.solid||p.facet===1;return `<polygon data-face="${p.id}" data-facet="${p.facet}" ${accessible?'role="button" tabindex="0" aria-label="Select '+p.id.replaceAll('-',' ')+' panel"':'aria-hidden="true"'} ${selected.has(p.id)?'data-highlighted="true" ':''}points="${p.points.map(q=>q.slice(0,2).join(',')).join(' ')}" fill="${p.solid?shade(color,p.pointsMm):color}" fill-opacity="1" stroke="${selected.has(p.id)?selection.color:'#476661'}" stroke-width="${selected.has(p.id)?'2.4':p.solid?'.65':'1.3'}" stroke-linejoin="round"/>`;}).join('');
 return `<svg viewBox="0 0 720 330" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
}
