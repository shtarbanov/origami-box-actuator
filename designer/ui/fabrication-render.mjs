import {sceneSVG} from './render.mjs';
import {viewPoint} from '../view-controls.mjs';
// Renderer consumes semantic kernel cues. No hinge equations or step order here.
export function fabricationSVG(pose,camera,view){
 const project=p=>viewPoint(camera.project(p),view),points=ps=>ps.map(p=>project(p).slice(0,2).join(',')).join(' ');
 let svg=sceneSVG(pose,camera,view).replaceAll(/ role="button" tabindex="0" aria-label="[^"]*"/g,'');
 const film=pose.film.map(p=>`<polygon class="guide-film" points="${points(p.pointsMm)}"/>`).join('');
 svg=svg.replace(/(<svg[^>]*>)/,`$1${film}`);
 let overlay=pose.cues.map(c=>{
  const [a,b]=c.pointsMm.map(project),active=c.active;
  return `<line class="fabrication-line ${c.role} ${active?'current':''} ${c.sealed?'sealed':''}" data-guide-line="${c.id}" x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}"/>`;
 }).join('');
 const p=project(pose.inlet.pointMm);overlay+=`<circle class="guide-inlet ${pose.inlet.active?'current':''}" cx="${p[0]}" cy="${p[1]}" r="${pose.inlet.active?6:3}"/>`;
 if(pose.activeSeal){
  const a=pose.activeSeal.pairedLinesMm[0].map(project),x=(a[0][0]+a[1][0])/2,y=(a[0][1]+a[1][1])/2;
  overlay+=`<g class="seal-caption" transform="translate(${x},${y-12})"><rect x="-34" y="-16" width="68" height="22" rx="5"/><text text-anchor="middle" y="-1">Seal here</text></g>`;
 }
 return svg.replace('</svg>',`<g class="fabrication-cues" pointer-events="none">${overlay}</g></svg>`);
}
