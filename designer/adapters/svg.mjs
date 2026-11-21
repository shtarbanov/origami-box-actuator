// Neutral template geometry -> SVG. Page size, text and colors are adapter choices.
import {panelStyle} from './presentation.mjs';
export const papers={A4:[297,210],A3:[420,297],Letter:[279.4,215.9]};
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const num=x=>Number(x.toFixed(4));
export function renderTemplate(template,{paper='A4',type='folding',labels=true}={}){
 if(!papers[paper])throw Error('Unsupported paper size.');
 const [pw,ph]=papers[paper],b=template.boundsMm,size=[b.maxX-b.minX,b.maxY-b.minY];
 const tx=(pw-size[0])/2-b.minX,ty=(ph-size[1])/2-b.minY,pt=p=>`${num(p[0]+tx)},${num(p[1]+ty)}`;
 const fit=size[0]<=pw-16&&size[1]<=ph-24;
 let body=`<rect width="${pw}" height="${ph}" fill="white"/><text x="8" y="8" font-size="3.2" fill="#344054">${type==='folding'?'Folding':'Cutting'} template · mm · Print at 100% / Actual size</text>`;
 body+=`<text x="8" y="13" font-size="2.6" fill="#344054">Hinge-axis design · Physical panels inset by half the hinge gap.</text>`;
 if(type==='folding')body+=`<text x="8" y="${ph-7}" font-size="2.6" fill="#A24C13">Experimental sealing guides — film and sealing require physical validation.</text>`;
 for(const panel of template.panels){const {name,color}=panelStyle(panel.id);
  body+=`<polygon data-panel="${esc(panel.id)}" points="${panel.pointsMm.map(pt).join(' ')}" fill="${color}" fill-opacity=".38" stroke="${type==='folding'?'#263D48':'none'}" stroke-width=".15"/>`;
  if(labels){const c=panel.pointsMm.reduce((s,p)=>[s[0]+p[0]/panel.pointsMm.length,s[1]+p[1]/panel.pointsMm.length],[0,0]);body+=`<text x="${num(c[0]+tx)}" y="${num(c[1]+ty)}" text-anchor="middle" dominant-baseline="middle" font-size="2.8" fill="#344054">${esc(name)}</text>`;}
 }
 for(const s of template.cuts)body+=`<polyline data-cut="true" points="${pt(s.from)} ${pt(s.to)}" fill="none" stroke="#263D48" stroke-width=".15"/>`;
 for(const s of template.folds)body+=`<polyline points="${pt(s.from)} ${pt(s.to)}" fill="none" stroke="#465761" stroke-width=".1"/>`;
 for(const s of template.seals)body+=`<polyline points="${pt(s.from)} ${pt(s.to)}" fill="none" stroke="#B25620" stroke-width=".18" stroke-dasharray="1.5 1"/>`;
 if(template.inlet)body+=`<circle cx="${num(template.inlet.center[0]+tx)}" cy="${num(template.inlet.center[1]+ty)}" r="${template.inlet.radius}" fill="none" stroke="#263D48" stroke-width=".15"/>`;
 return {fit,size,svg:`<svg xmlns="http://www.w3.org/2000/svg" width="${pw}mm" height="${ph}mm" viewBox="0 0 ${pw} ${ph}" font-family="Arial,sans-serif">${body}</svg>`};
}
