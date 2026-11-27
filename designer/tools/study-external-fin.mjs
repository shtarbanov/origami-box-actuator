// Reproduce local film-seal research without a GUI or third-party dependencies.
// Usage: node designer/tools/study-external-fin.mjs [output-directory]
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {defaultSpec} from '../kernel/spec.mjs';
import {studyExternalFin} from '../kernel/film-seal-study.mjs';
const destination=resolve(process.argv[2]??'designer/verification/external-fin');
await mkdir(destination,{recursive:true});
const spec=defaultSpec();spec.footprint.frontWidth=80;spec.rise.front=30;spec.footprint.rearWidthRatio=.8;
const options={marginMm:8,heatWidthMm:1,setbackMm:2,samples:201};
const study=studyExternalFin(spec,options),wrongDirection=studyExternalFin(spec,{...options,secondFoldDirection:'up'}),lateMargins=studyExternalFin(spec,{...options,marginTiming:'after-close'});
const grid=[];
for(const width of [.8,1,1.2])for(const height of [.6,1,1.2])for(const side of [.8,1,1.2]){
 const s=structuredClone(spec);s.footprint.rearWidthRatio=width;s.rise.rearRatio=height;s.rise.rightToLeftRatio=side;
 try{const r=studyExternalFin(s,{...options,samples:101});grid.push({width,height,side,...r.checks});}
 catch(e){grid.push({width,height,side,rejected:e.code??e.message});}
}
await writeFile(join(destination,'report.json'),JSON.stringify({timestamp:new Date().toISOString(),spec,study,wrongDirection,lateMargins,grid},null,2));
const esc=t=>String(t).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const text=(x,y,s,size=18,color='#334155',weight=400)=>`<text x="${x}" y="${y}" font-size="${size}" fill="${color}" font-weight="${weight}">${esc(s)}</text>`;
const polygon=(ps,style)=>`<polygon points="${ps.map(p=>p.slice(0,2).join(',')).join(' ')}" ${style}/>`;
const line=(x,y,xx,yy,style='')=>`<path d="M${x} ${y}L${xx} ${yy}" fill="none" ${style}/>`;
const colors={'end-0':'#dc5266','end-5':'#d6921b',body:'#98aebc'};
const transform=([x,y,z])=>[x*.82-y*.57,(x*.57+y*.82)*.40-z*.92,(x*.57+y*.82)*.92+z*.40];
const ids=['first-side-up','first-margin-down','last-margin-up','second-side-down-mid','second-side-down'];
const states=ids.map(id=>study.steps.find(s=>s.id===id));
const all=states.flatMap(s=>[...s.film,...s.panels].flatMap(p=>p.pointsMm.map(transform)));
const lo=[0,1].map(i=>Math.min(...all.map(p=>p[i]))),hi=[0,1].map(i=>Math.max(...all.map(p=>p[i]))),scale=Math.min(420/(hi[0]-lo[0]),220/(hi[1]-lo[1]));
function scene(state,x,y){
 const project=p=>{const v=transform(p);return [x+230+(v[0]-(lo[0]+hi[0])/2)*scale,y+188+(v[1]-(lo[1]+hi[1])/2)*scale,v[2]];};
 const shapes=[...state.film.map(p=>({...p,film:true})),...state.panels.map(p=>({...p,film:false}))].map(p=>({...p,projected:p.pointsMm.map(project)}));
 shapes.sort((a,b)=>a.projected.reduce((s,p)=>s+p[2],0)/a.projected.length-b.projected.reduce((s,p)=>s+p[2],0)/b.projected.length);
 return shapes.map(p=>polygon(p.projected,p.film?`fill="${colors[p.region]}" fill-opacity=".28" stroke="${colors[p.region]}" stroke-width="1.3"`:'fill="#dce8ed" fill-opacity=".88" stroke="#486779" stroke-width="1.4"')).join('');
}
const headings=['1  First pair folded up','2  First free margin down','3  Far free margin up','4  Second pair closes DOWN','5  Margins meet below body'];
const captions=[['Extra film remains attached.','No pre-cut tabs are assumed.'],['Prepare it before the last panel closes.','This avoids extracting a buried layer later.'],['Pre-fold the far margin while accessible.','Only flexible film bends at this crease.'],['Shown halfway through the second fold.','The pre-folded margin travels with it.'],['Body film remains in the z = 0 plane.','The red and gold margins form a fin.']];
let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1500" height="1080" viewBox="0 0 1500 1080"><rect width="1500" height="1080" fill="#f6f8fa"/><g font-family="Arial, sans-serif">`;
svg+=text(35,45,'External-fin sealing: a local research candidate',30,'#172b3a',700);
svg+=text(35,78,'Actual kernel coordinates • fixed orthographic scale • zero-thickness film • not a complete fabrication guide',18);
svg+=`<rect x="35" y="100" width="18" height="12" fill="${colors['end-0']}"/>`+text(62,112,'first free margin',16)+`<rect x="240" y="100" width="18" height="12" fill="${colors['end-5']}"/>`+text(267,112,'far free margin',16)+`<rect x="443" y="100" width="18" height="12" fill="#dce8ed" stroke="#486779"/>`+text(470,112,'rigid panels',16)+text(700,112,'No change to panel lengths or areas.',16);
for(let i=0;i<5;i++){
 const x=25+(i%3)*490,y=135+Math.floor(i/3)*395;
 svg+=`<rect x="${x}" y="${y}" width="475" height="380" rx="12" fill="white" stroke="#d4dde3"/>`+text(x+18,y+34,headings[i],22,'#172b3a',700)+scene(states[i],x,y);
 svg+=text(x+18,y+337,captions[i][0],16)+text(x+18,y+361,captions[i][1],16);
}
// Magnified physical section of the final fin, not an exploded layer view.
const x=1005,y=530;
svg+=`<rect x="${x}" y="${y}" width="475" height="380" rx="12" fill="white" stroke="#d4dde3"/>`+text(x+18,y+34,'6  Heat outside the body',22,'#172b3a',700);
svg+=text(x+18,y+62,'Magnified section normal to the seam',16);
const px=x+235,root=y+112,k=19;
svg+=line(x+35,root,x+435,root,'stroke="#78909c" stroke-width="7"')+text(x+22,root-15,'body film / panels',15);
// The two material surfaces coincide: dashed overprint shows both, no fake gap.
svg+=line(px,root,px,root+8*k,`stroke="${colors['end-0']}" stroke-width="6"`)+line(px,root,px,root+8*k,`stroke="${colors['end-5']}" stroke-width="6" stroke-dasharray="7 7"`);
const bandTop=root+2*k,bandHeight=1*k;
svg+=`<rect x="${px-66}" y="${bandTop}" width="62" height="${bandHeight}" rx="2" fill="#6b7785"/><rect x="${px+4}" y="${bandTop}" width="62" height="${bandHeight}" rx="2" fill="#6b7785"/>`;
svg+=line(px-105,bandTop+bandHeight/2,px-70,bandTop+bandHeight/2,'stroke="#b75133" stroke-width="2.5" marker-end="url(#arrow)"')+line(px+105,bandTop+bandHeight/2,px+70,bandTop+bandHeight/2,'stroke="#b75133" stroke-width="2.5" marker-end="url(#arrow)"');
svg+=line(px+125,root,px+125,bandTop,'stroke="#334155" stroke-width="1"')+text(px+134,root+25,'s',18);
svg+=line(px+125,bandTop,px+125,bandTop+bandHeight,'stroke="#b75133" stroke-width="3"')+text(px+134,bandTop+16,'b',18,'#b75133');
svg+=text(x+18,y+286,'Two coincident margins; no layer gap drawn.',15)+text(x+18,y+310,'Required free depth: at least s + b.',17,'#172b3a',700)+text(x+18,y+334,'Seal first; trim beyond the weld afterward.',16)+text(x+18,y+355,'Setback permits root separation up to 2s.',15,'#923b2e')+text(x+18,y+374,'Jaw bodies are illustrative, not collision-checked.',13);
svg+=`<rect x="25" y="935" width="1455" height="117" rx="10" fill="#fff1db"/>`;
svg+=text(45,963,'What this establishes',19,'#6b4313',700)+text(45,989,'The example has no sampled film crossing, no stack-order violation, and exactly two film layers cover the local heated band.',17);
svg+=text(45,1014,'Example inputs only: front/rear width 80/64 mm; length 75 mm; rise 30 mm; blank expansion m = 8 mm; s = 2 mm; b = 1 mm.',16);
svg+=text(45,1039,'Not established: end-seal junctions, complete jaw clearance, finite thickness, airtightness or inflation after sealing.',17,'#923b2e',700);
svg+='</g><defs><marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto-start-reverse"><path d="M0 0L6 3L0 6Z" fill="#b75133"/></marker></defs></svg>';
await writeFile(join(destination,'external-fin.svg'),svg);
console.log(JSON.stringify({destination,examplePass:study.checks.candidatePass,wrongUpCrossings:wrongDirection.checks.intersections.length,lateStackViolations:lateMargins.checks.stackViolations.length,gridCases:grid.length,gridPass:grid.filter(r=>r.candidatePass).length,gridFailed:grid.filter(r=>r.candidatePass===false).map(r=>({width:r.width,height:r.height,side:r.side,failures:r.failures})),gridRejected:grid.filter(r=>r.rejected)},null,2));
