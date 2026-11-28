import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {defaultSpec} from '../kernel/spec.mjs';
import {wallTuckProgram,studyWallTuck} from '../kernel/wall-tuck-study.mjs';
import {wallTuckThickContext,wallTuckThicknessAudit,wallTuckPhysicalStoryboard,wallTuckPhysicalPose,wallTuckClosedState,wallTuckStackSection} from '../kernel/wall-tuck-thickness.mjs';
import {thickFoldState,thickPanelContacts} from '../kernel/thick-folds.mjs';
import {sheetStudyHTML,sheetStudySVG} from '../ui/sheet-study-document.mjs';
const destination=resolve(process.argv[2]??'designer/verification/wall-tuck');await mkdir(destination,{recursive:true});
const spec=defaultSpec();spec.footprint.frontWidth=80;spec.footprint.rearWidthRatio=.8;spec.rise.front=30;
const options={marginMm:8,heatWidthMm:1,foldSigns:[-1,1,1],samples:201},context=wallTuckProgram(spec,options),c=wallTuckThickContext(context,{samples:201}),audit=wallTuckThicknessAudit(c,{samples:201}),ideal=studyWallTuck(spec,options);
const rawCollisionPairs=thickPanelContacts(context.program.steps[2].panels.map(p=>({...p,thicknessMm:spec.fabrication.panelThickness})));
const firstSection=wallTuckStackSection(c,thickFoldState(c.program,{step:3})),inwardSection=wallTuckStackSection(c,wallTuckClosedState(c,0,true),'left');
const heater=wallTuckPhysicalPose(c,{phase:'seal',progress:1}).heater,cases=[];
for(const [name,w,h,side] of [['rectangle',1,1,1],['taper',.8,1,1],['wedge',1,.6,1],['combined',.8,.6,1],['lateral',1,1,.8]]){
 const s=structuredClone(spec);s.footprint.rearWidthRatio=w;s.rise.rearRatio=h;if(side!==1)s.rise.rightToLeftRatio=side;
 const t=wallTuckThickContext(wallTuckProgram(s,options),{samples:151});cases.push({name,audit:wallTuckThicknessAudit(t,{samples:151}),radiiMm:t.program.steps.map(p=>p.radiusMm)});
}
await writeFile(join(destination,'report.json'),JSON.stringify({schema:'origami-box/finite-wall-tuck-report/1',spec,options,program:c.program,audit,idealAudit:ideal,rawCollisionPairs,firstSection,inwardSection,heater,cases,manufacturingReady:false},null,2));
const palette={bottom:'#668fa9',top:'#85a6c4','right-lower':'#d59b55','right-upper':'#edc17a','left-lower':'#64aaa0','left-upper':'#9acbc2'};
const style=p=>({...p,cues:p.cues.map(q=>({...q,...(q.label==='A'?{labelOffsetPx:[-10,23]}:{})})),meshes:p.meshes.map(m=>({...m,color:m.role==='panel'?palette[m.panelId]:m.role==='seam-film'?m.region==='end-0'?'#df536b':'#d68d19':'#a4bdcb'}))});
const stages=wallTuckPhysicalStoryboard(c).map(s=>({...s,frames:s.frames.map(style)})),vs=stages.flatMap(s=>s.frames.flatMap(p=>p.meshes.flatMap(m=>m.verticesMm)));
const az=-Math.PI/6,el=28*Math.PI/180,right=[Math.cos(az),-Math.sin(az),0],down=[Math.sin(az)*Math.sin(el),Math.cos(az)*Math.sin(el),-Math.cos(el)],dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
function bounds(vertices){const xs=vertices.map(p=>dot(p,right)),ys=vertices.map(p=>dot(p,down));return {x0:Math.min(...xs),x1:Math.max(...xs),y0:Math.min(...ys),y1:Math.max(...ys)};}
const full=bounds(vs),cx=(full.x0+full.x1)/2,cy=(full.y0+full.y1)/2,frame={center:right.map((v,i)=>v*cx+down[i]*cy),scale:Math.min(850/(full.x1-full.x0),400/(full.y1-full.y0))};
const verification=[`Panel thickness ${c.thicknessMm} mm, one-sided on the original film. Film itself remains idealized as thin flexible strips.`,`Requested signed folds: DOWN, UP, UP. First long seal; open; opposite wall INWARD; end-seal references.`,`Clearance accommodation radii (computed examples): ${c.program.steps.map(p=>p.radiusMm.toFixed(5)).join(', ')} mm. The flexible gap keeps its material width ${c.program.gapMm} mm.`,`Finite plate path: ${audit.finitePanelPathPass?'passed':'FAILED'}; ${audit.samplesPerBranch} samples per post-seal branch plus sampled prefolds and endpoint refinements.`,`Naively extruding the old coincident surfaces gives intersecting plastic: ${JSON.stringify(rawCollisionPairs)}.`,`Five checked shape cases: ${cases.filter(c=>c.audit.finitePanelPathPass).length}/5 passed.`,`Max rigid distance error ${audit.maxRigidErrorMm.toExponential(3)} mm; max required hinge/seam chord ${audit.maxChordMm.toFixed(8)} mm.`,`First seal local modeled margins: required outward heater offset ${heater.outwardOffsetMm.toFixed(5)} mm; available margin ${heater.marginMm} mm.`,`Gap reachability is necessary, not proof of a collision-free complete membrane. The local strips conserve width; full loose end-film/gussets, real minimum bend radius, film thickness, hardware and pneumatic behavior are unverified.`,`The last two stages show end-seal reference locations only. Manufacturing readiness remains false.`].join('\n');
await writeFile(join(destination,'viewer.html'),sheetStudyHTML({title:'Wall tuck · finite plastic panels',subtitle:'DOWN → UP → UP · long seal → open → opposite wall inward → end references',stages,frame,verification}));
await writeFile(join(destination,'frames.json'),JSON.stringify({stages,frame}));
const selected=[stages[0].frames[0],stages[1].frames[30],stages[2].frames[30],stages[3].frames[30],stages[4].frames.at(-1),stages[5].frames[30],stages[5].frames.at(-1),stages[6].frames[30],stages[6].frames.at(-1)];
const titles=['0  Plastic on one film side','1  A: fold DOWN','2  B: swing the pair UP','3  C: same upward half-fold','4  Join the long free margins','5a  Open the sealed pouch','5b  Opposite wall straight','6a  Opposite wall goes IN','6b  Both walls folded inward'];
const caps=['Plastic is a solid volume, not a mid-surface.','Last small panel travels below its mate.','The doubled pair travels upward together.','Flexible gaps accommodate the plastic stack.','Only the modeled local seam strips are shown.','First long joint remains connected.','Pass through the straight-wall configuration.','Teal pair is the wall used by the large fold.','Only now proceed to the end-seal references.'];
const boxes=selected.map(p=>bounds(p.meshes.flatMap(m=>m.verticesMm))),staticScale=Math.min(420/Math.max(...boxes.map(b=>b.x1-b.x0)),215/Math.max(...boxes.map(b=>b.y1-b.y0)));
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;'),text=(x,y,t,size=17)=>`<text x="${x}" y="${y}" font-family="Arial" font-size="${size}" fill="#263e50">${esc(t)}</text>`;
let svg='<svg xmlns="http://www.w3.org/2000/svg" width="1500" height="1200"><rect width="1500" height="1200" fill="#f4f8fa"/>'+text(25,40,'Corrected directions, finite panels, then the opposite wall inward',29)+text(25,73,`Actual plastic thickness ${c.thicknessMm} mm • rigid volumes • flexible hinge strips • end membrane not certified`,17);
for(let i=0;i<9;i++){const x=20+i%3*493,y=100+Math.floor(i/3)*355,b=boxes[i],cx=(b.x0+b.x1)/2,cy=(b.y0+b.y1)/2,camera={center:right.map((v,j)=>v*cx+down[j]*cy),scale:staticScale};svg+=`<rect x="${x}" y="${y}" width="480" height="339" rx="9" fill="white" stroke="#d2dce3"/>`+text(x+14,y+31,titles[i],22)+`<g transform="translate(${x+10} ${y+47})">${sheetStudySVG(selected[i],{az:-30,el:28,zoom:1,x:0,y:0},camera,460,235)}</g>`+text(x+14,y+316,caps[i],15);}
svg+=text(25,1180,'Plastic clearance is checked; full loose-film end sealing and pressure-driven behavior remain unverified.',17)+'</svg>';
await writeFile(join(destination,'wall-tuck.svg'),svg);
let section='<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="470"><rect width="1200" height="470" fill="#f7fafb"/>'+text(25,35,'Local plastic cross-sections: real thickness and layer order',26);
for(const [i,data] of [firstSection,inwardSection].entries()){
 const x=30+i*590,base=370,scale=200;section+=text(x,78,i?'After the opposite wall is tucked inward':'After the first three folds',20);
 for(const p of data.layers){const y=base-p.maxZMm*scale,h=(p.maxZMm-p.minZMm)*scale;section+=`<rect x="${x+10}" y="${y}" width="255" height="${h}" fill="${palette[p.panelId]}" stroke="#425e70"/>`+text(x+282,y+h/2+6,p.panelId,18);}
 section+=text(x+10,405,'Uniform scale: 200 px/mm; cropped section window.',15);
}
section+=text(25,448,'Each plastic layer is 0.30 mm. No artificial explosion or thickness magnification is applied.',17)+'</svg>';
await writeFile(join(destination,'stack-sections.svg'),section);
console.log(JSON.stringify({destination,finitePanelPass:audit.finitePanelPathPass,cases:cases.map(c=>({name:c.name,pass:c.audit.finitePanelPathPass})),radiiMm:c.program.steps.map(p=>p.radiusMm),rawCollisionPairs,heater,firstLayers:firstSection.layers.map(p=>p.panelId),inwardLayers:inwardSection.layers.map(p=>p.panelId)},null,2));
