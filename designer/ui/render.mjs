import {panelStyle} from '../adapters/presentation.mjs';
import {viewPoint} from '../view-controls.mjs';
export function sceneSVG(pose,camera,view,selection={}){
 const bad=new Set(pose.contacts.flat());
 const selected=new Set(selection.panelIds??[]);
 const panels=pose.panels.map(p=>({...p,points:p.pointsMm.map(v=>viewPoint(camera.project(v),view))}));
 panels.sort((a,b)=>a.points.reduce((s,p)=>s+p[2],0)/a.points.length-b.points.reduce((s,p)=>s+p[2],0)/b.points.length);
 const body=panels.map(p=>`<polygon data-face="${p.id}" role="button" tabindex="0" aria-label="Select ${p.id.replaceAll('-',' ')} panel" ${selected.has(p.id)?'data-highlighted="true" ':''}points="${p.points.map(q=>q.slice(0,2).join(',')).join(' ')}" fill="${bad.has(p.id)?'#F09883':selected.has(p.id)?selection.color:panelStyle(p.id).color}" fill-opacity="${selected.has(p.id)?'.3':'.88'}" stroke="${selected.has(p.id)?selection.color:'#476661'}" stroke-width="${selected.has(p.id)?'2.4':'1.3'}" stroke-linejoin="round"/>`).join('');
 return `<svg viewBox="0 0 720 330" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
}
