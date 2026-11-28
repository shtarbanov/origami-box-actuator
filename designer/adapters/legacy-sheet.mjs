import {unfold as coreUnfold,parameters} from '../kernel/geometry.mjs';
import {decorateNet} from './presentation.mjs';
import {papers} from './svg.mjs';
const unfold=(input,folding)=>{const paper=input.paper??'A4';if(!papers[paper])throw Error('Unsupported paper size.');const p={...parameters(input),paper},[w,h]=papers[paper];return decorateNet(coreUnfold(p,folding,{stockSizeMm:[w-16,h-24]}));};
const center=ps=>ps.reduce((a,p)=>[a[0]+p[0]/ps.length,a[1]+p[1]/ps.length],[0,0]);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const num=x=>Number(x.toFixed(4));
export function legacySheet(input={},folding=true,{labels=true}={}){
 const net=unfold(input,folding),{p,bounds:b}=net,[pw,ph]=papers[p.paper];
 const size=[b.maxX-b.minX,b.maxY-b.minY];
 const tx=(pw-size[0])/2-b.minX,ty=(ph-size[1])/2-b.minY;
 const fit=size[0]<=pw-16&&size[1]<=ph-24;
 const pt=p=>`${num(p[0]+tx)},${num(p[1]+ty)}`;
 const experimental=p.kind!=='rectangle';
 let body=`<rect width="${pw}" height="${ph}" fill="white"/><text x="8" y="8" font-size="3.2" fill="#344054">${esc(folding?'Folding stencil':'Cutting stencil')} · ${esc(p.kind)} · mm · Print at 100% / Actual size</text>`;
 body+=`<text x="8" y="13" font-size="2.6" fill="#344054">Revision 0.2: hinge-axis dimensions; rigid panel outlines inset g/2. End seals are unverified study guides.</text>`;
 if(experimental)body+=`<text x="8" y="${ph-7}" font-size="3.1" fill="#A24C13">EXPERIMENTAL — end seals and collapse require physical validation.</text>`;
 for(const f of net.faces){
 const poly=f.panel;
 body+=`<polygon data-panel="${f.id}" points="${poly.map(pt).join(' ')}" fill="${f.color}" fill-opacity="0.38" stroke="${folding?'#263D48':'none'}" stroke-width="0.15"/>`;
 if(labels){const c=center(poly);body+=`<text x="${num(c[0]+tx)}" y="${num(c[1]+ty)}" text-anchor="middle" dominant-baseline="middle" font-size="2.8" fill="#344054">${esc(f.name)}</text>`;}
 }
 for(const s of net.cuts||[])body+=`<polyline data-cut="true" points="${pt(s.a)} ${pt(s.b)}" fill="none" stroke="#263D48" stroke-width="0.15"/>`;
 for(const f of net.folds)body+=`<polyline points="${pt(f.a)} ${pt(f.b)}" fill="none" stroke="#465761" stroke-width="0.1"/>`;
 for(const s of net.seals)body+=`<polyline points="${pt(s.a)} ${pt(s.b)}" fill="none" stroke="#B25620" stroke-width="0.18" stroke-dasharray="1.5 1"/>`;
 if(net.inlet)body+=`<circle cx="${num(net.inlet[0]+tx)}" cy="${num(net.inlet[1]+ty)}" r="1.5" fill="none" stroke="#263D48" stroke-width="0.15"/>`;
 return {net,fit,size,svg:`<svg xmlns="http://www.w3.org/2000/svg" width="${pw}mm" height="${ph}mm" viewBox="0 0 ${pw} ${ph}" font-family="Arial,sans-serif">${body}</svg>`};
}
