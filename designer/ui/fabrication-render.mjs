import {meshSceneSVG} from './mesh-scene.mjs';
import {esc} from './dom-utils.mjs';
import {cameraForFrame,frameFromPoints} from './camera.mjs';
import {viewPoint} from '../view-controls.mjs';
// Renderer consumes semantic kernel cues. No hinge equations or step order here.
export function fabricationSVG(pose,camera,view){
 const project=p=>viewPoint(camera.project(p),view),points=ps=>ps.map(p=>project(p).slice(0,2).join(',')).join(' ');
 let svg=meshSceneSVG(pose,camera,view);
 if(pose.action)svg=svg.replace('<svg ',`<svg data-operation="${esc(pose.action.kind)}" data-phase="${esc(pose.action.phase)}" `);
 let overlay=pose.cues.map(c=>{
  const [a,b]=c.pointsMm.map(project),active=c.active;
  return `<line class="fabrication-line ${c.role} ${active?'current':''} ${c.sealed?'sealed':''}" data-guide-line="${c.id}" x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}"/>`;
 }).join('');
 if(pose.inlet.markerVisible){const p=project(pose.inlet.pointMm);overlay+=`<circle class="guide-inlet" cx="${p[0]}" cy="${p[1]}" r="3"/>`;}
 for(const detail of pose.details??[]){
  const meshes=(pose.meshes??[]).filter(m=>detail.meshIds.includes(m.id)),framePoints=detail.framePointsMm??meshes.flatMap(m=>m.verticesMm),detailCamera=cameraForFrame(frameFromPoints(framePoints),-25,25),detailView={zoom:1,panX:0,panY:0};
  const detailProject=p=>viewPoint(detailCamera.project(p),detailView),bounds=framePoints.map(detailProject);
  const minX=Math.min(...bounds.map(p=>p[0])),minY=Math.min(...bounds.map(p=>p[1])),w=Math.max(1,Math.max(...bounds.map(p=>p[0]))-minX),h=Math.max(1,Math.max(...bounds.map(p=>p[1]))-minY),pad=Math.max(w,h)*.1;
  const body=meshSceneSVG({meshes},detailCamera,detailView).replace(/^<svg[^>]*>/,'').replace(/<\/svg>$/,'');
  const target=detailProject(detail.targetMm);
  overlay+=`<g class="scene-detail"><rect x="280" y="8" width="160" height="142" rx="7"/><text x="360" y="25" text-anchor="middle">${esc(detail.label)}</text><svg x="286" y="32" width="148" height="110" viewBox="${minX-pad} ${minY-pad} ${w+2*pad} ${h+2*pad}"><circle cx="${target[0]}" cy="${target[1]}" r="2" fill="none" stroke="#b98552" stroke-width=".8"/>${body}</svg></g>`;
 }
 return svg.replace('</svg>',`<g class="fabrication-cues" pointer-events="none">${overlay}</g></svg>`);
}
