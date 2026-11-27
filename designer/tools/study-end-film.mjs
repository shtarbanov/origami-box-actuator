import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {defaultSpec} from '../kernel/spec.mjs';
import {wallTuckProgram} from '../kernel/wall-tuck-study.mjs';
import {wallTuckThickContext} from '../kernel/wall-tuck-thickness.mjs';
import {compileEndFilmStudy} from '../kernel/end-film-study.mjs';
import {endFilmOverlayProblem,endLongSeamCoverage} from '../kernel/end-film.mjs';
import {endFilmPressFrame} from '../kernel/end-film-closure.mjs';
import {planEndFilmBlank,withEndBlankPlan} from '../kernel/end-film-blank.mjs';
import {endFilmLayerAudit,validateEndFilm,endFilmSection} from '../kernel/end-film-validation.mjs';
import {sheetStudyHTML,sheetStudySVG} from '../ui/sheet-study-document.mjs';
const destination=resolve(process.argv[2]??'designer/verification/end-film');await mkdir(destination,{recursive:true});
function context(w=.8,h=1,side=1,marginMm=25){const s=defaultSpec();s.footprint.frontWidth=80;s.footprint.rearWidthRatio=w;s.rise.front=30;s.rise.rearRatio=h;if(side!==1)s.rise.rightToLeftRatio=side;return wallTuckThickContext(wallTuckProgram(s,{marginMm,heatWidthMm:1,foldSigns:[-1,1,1],samples:101}),{samples:101});}
const combined=process.argv.includes('--combined'),c=context(.8,combined?.6:1),study=compileEndFilmStudy(c,{framesPerPress:combined?61:21}),cases=[];
for(const [name,w,h,side] of [['rectangle',1,1,1],['taper',.8,1,1],['wedge',1,.6,1],['combined',.8,.6,1],['lateral',1,1,.8]]){
 try{const source=context(w,h,side),blankPlan=planEndFilmBlank(source),other=withEndBlankPlan(source,blankPlan),ends=[];for(const end of ['front','rear']){const p=endFilmOverlayProblem(other,{end}),frames=Array.from({length:21},(_,i)=>endFilmPressFrame(p,i/20)),a=validateEndFilm(p,{frames}),layers=frames.map(f=>endFilmLayerAudit(p,f));ends.push({end,pass:a.allLayerGeometryPass&&a.allPriorWeldPass&&layers.every(x=>x.pass),maxPrincipalStrain:Math.max(...a.frames.map(f=>f.maxPrincipalStrain)),atlas:p.atlasChecks});}cases.push({name,status:ends.every(e=>e.pass)?'sampled-geometry-pass':'failed',blankPlan,ends});}
 catch(error){cases.push({name,status:'blocked',reason:error.message});}
}
const report={...study.report,exampleSpec:c.context.spec??c.context.net.p,exampleBlankMarginMm:study.report.blankPlan.selectedMarginMm,oldBlankMargin8Coverage:endLongSeamCoverage(context(.8,combined?.6:1,1,8)).covered,cases};
const palette={bottom:'#668fa9',top:'#85a6c4','right-lower':'#d59b55','right-upper':'#edc17a','left-lower':'#64aaa0','left-upper':'#9acbc2'};
const stages=study.stages.map(s=>({...s,frames:s.frames.map(p=>({...p,meshes:p.meshes.map(m=>({...m,color:m.role==='panel'?palette[m.panelId]:m.role==='tool'?'#c39a67':m.role==='completed-weld'?'#16956e':m.sourceId?.startsWith('long-fin')?'#d58b3b':m.sourceId?.startsWith('carrier')?'#77b9be':'#88a9d4'}))}))}));
const vertices=stages.flatMap(s=>s.frames.flatMap(p=>p.meshes.flatMap(m=>m.verticesMm))),min=[0,1,2].map(k=>vertices.reduce((a,v)=>Math.min(a,v[k]),Infinity)),max=[0,1,2].map(k=>vertices.reduce((a,v)=>Math.max(a,v[k]),-Infinity)),frame={center:min.map((v,i)=>(v+max[i])/2),scale:Math.min(800/(max[0]-min[0]),370/(max[1]-min[1]))};
const verification=[`Research example: width 80 → 64 mm, length 75 mm, nominal rise 30 mm, plastic thickness ${c.thicknessMm} mm, hinge gap 4 mm.`,
 `Example parameters, not measured fabrication values: heat band 1 mm; blank margin ${report.exampleBlankMarginMm} mm; retained long fin 2 mm; end tail 2 mm beyond heat band.`,
 `Blank plan: ${report.blankPlan.operation}; original boundary error ${report.blankPlan.originalContinuityErrorMm} mm; planned boundary error ${report.blankPlan.plannedContinuityErrorMm} mm. Plastic is unchanged.`,
 `Finite panel path: ${report.finitePanelAudit.finitePanelPathPass?'passed':'FAILED'}. Panels remain rigid and frozen during both end presses.`,
 `End-film geometry: ${report.geometryPass?'passed at sampled frames':'FAILED'}; ${report.sampleCountPerEnd} frames per end. Every displayed material triangle is checked for crossing.`,
 'Shared overlay: projected cells do not fold or overlap, and ordered layers do not swap at any corner. The certificate covers complete linear triangles at each sampled frame, not continuous time.',
 `Maximum required principal film strain: ${(report.maxPrincipalStrain*100).toFixed(4)}%. Allowable film strain and film thickness are UNKNOWN. This is not an inextensible-film solution.`,
 `Old blank margin 8 mm covers the extended long weld: ${report.oldBlankMargin8Coverage}. Calculated minimum in this geometry: ${report.minimumBlankMargin.minimumMarginMm.toFixed(5)} mm.`,
 `End band layers: central skins 2, gussets 4. The old front printed segment needs ${report.registries[0].guideExtensionRequired.toFixed(4)} mm extension at its limiting end; heat across the entire folded-film width.`,
 `Prior long weld preserved; full band coverage: ${report.coverage.covered}.`,
 `Centreline avoids all finite plastic solids: ${report.plasticAirway.clearOfPlastic}. Unbonded inlet-to-body corridor: ${report.airway.connected}. Piecewise-linear rear cap centreline gap: ${report.inletPath.minimumGapMm.toFixed(6)} mm minimum (plastic ends before this cap).`,
 `Inlet hole diameter: unconfirmed. Reference centre to nearest end-band edge: ${report.inlet.distanceToEndSealMm.toFixed(3)} mm; geometric band-exclusion diameter bound ${report.inlet.maximumDiameterToAvoidEndBandsMm.toFixed(3)} mm. This is not a hardware-clearance or flow rating.`,
 'Full loose-film history during the earlier three folds, finite film thickness, calibrated heater/hardware access, real material strain capacity, airtightness and pneumatic flow remain unverified.',
 `Other sampled cases: ${cases.map(x=>x.name+': '+x.status).join('; ')}. A source-blank trimming operation is generated when distant crease extensions conflict; failed original material maps remain rejected.`].join('\n');
await writeFile(join(destination,'viewer.html'),sheetStudyHTML({title:combined?'Taper + tilt · end-film folding and sealing':'End-film folding and sealing',subtitle:'Rigid plastic · inward gussets · complete material layers · conditional deformable-film path',stages,frame,verification,scope:'Research viewer. End-film geometry is checked at sampled frames; actual material and heater performance remain unverified. Earlier folds show the verified rigid skeleton and local strips, not a complete loose-membrane history.'}));
await writeFile(join(destination,'report.json'),JSON.stringify(report,null,2));
await writeFile(join(destination,'frames.json'),JSON.stringify({stages,frame}));
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;'),txt=(x,y,t,size=18)=>`<text x="${x}" y="${y}" font-family="Arial" font-size="${size}" fill="#243f52">${esc(t)}</text>`;
let svg='<svg xmlns="http://www.w3.org/2000/svg" width="1500" height="1080"><rect width="1500" height="1080" fill="#f4f8fa"/>'+txt(25,38,'End-film closure: finite rigid panels, deformable film',28)+txt(25,70,'Research path: no layer crossings at checked frames; material strain limit remains unknown.',18);
const endStages=stages.slice(-5),final=stages.at(-1).frames.at(-1),selected=[endStages[0].frames[0],endStages[1].frames[Math.floor(endStages[1].frames.length/2)],endStages[1].frames.at(-1),endStages[2].frames[8],endStages[3].frames[Math.floor(endStages[3].frames.length/2)],final],titles=['Both walls inward; keep end overhangs','Front film: halfway to contact','Front end: all required layers meet','Front seal: outside every plastic panel','Rear film: flatten the other end','Rear seal; unbonded inlet corridor'];
const localFrame={center:[0,37.5,0],scale:3.8};
for(let i=0;i<6;i++){const x=20+(i%3)*493,y=100+Math.floor(i/3)*330;svg+=`<rect x="${x}" y="${y}" width="480" height="312" rx="8" fill="white" stroke="#d2dde5"/>`+txt(x+12,y+28,titles[i],18)+`<g transform="translate(${x+5} ${y+40})">${sheetStudySVG(selected[i],{az:-18,el:36,zoom:1,x:0,y:0,panels:true},localFrame,470,260)}</g>`;}
svg+=txt(28,797,'Layer registry across the front heat band (material identity; schematic)',22);
const registry=report.registries[0],row=registry.sections[1],sx=x=>80+(x-registry.minX)/(registry.maxX-registry.minX)*1330;
for(const cell of row.cells){const x=sx(cell.minX),w=sx(cell.maxX)-x;svg+=`<rect x="${x}" y="830" width="${w}" height="65" fill="${cell.count===4?'#f4c287':'#9ec9d7'}" stroke="white"/>`;if(w>40)svg+=txt(x+w/2-5,869,cell.count,23);}
svg+=txt(80,925,'2 = central skins / seam fin; 4 = intended gusset layers. No internal cross-weld.',19)+txt(28,985,`Maximum principal film strain: ${(report.maxPrincipalStrain*100).toFixed(3)}% (allowable unknown). Rear centreline gap ≥ ${report.inletPath.minimumGapMm.toFixed(3)} mm.`,20)+txt(28,1023,'Plastic thickness 0.30 mm; actual film thickness and inlet diameter unknown. Not a pneumatic/airtightness certificate.',18)+txt(28,1055,'Use the interactive viewer to rotate, hide panels, zoom and reverse each individual operation.',17)+'</svg>';
await writeFile(join(destination,'end-film.svg'),svg);
console.log(JSON.stringify({destination,geometryPass:report.geometryPass,maxPrincipalStrain:report.maxPrincipalStrain,airwayConnected:report.airway.connected,inletGapMm:report.inletPath.minimumGapMm,minimumBlankMarginMm:report.minimumBlankMargin.minimumMarginMm,cases:cases.map(x=>({name:x.name,status:x.status,reason:x.reason}))},null,2));

let section='<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="810"><rect width="1400" height="810" fill="white"/>'+txt(25,35,'Actual end-film cross-sections during the front press',27)+txt(25,67,'Axes have different scales to resolve the thin stack. The 3D viewer uses one uniform spatial scale.',18);
for(const [col,x] of [[0,0],[1,-35]])for(const [row,idx] of [[0,0],[1,Math.floor(study.frames[0].length/2)],[2,study.frames[0].length-1]]){const ox=70+col*690,oy=115+row*225,p=study.problems[0],f=study.frames[0][idx],data=endFilmSection(p,f,{x}),sx=y=>ox+(y-p.sealY+2.5)/(p.rootY-p.sealY+2.5)*560,sy=z=>oy+155-z/1.4*140;
 section+=txt(ox,oy-10,(col?'Gusset section (4 layers)':'Centre section (2 layers)')+' · '+Math.round(f.progress*100)+'%',18);
 for(const z of [0,.3,.6,.9,1.2])section+='<path d="M'+ox+' '+sy(z)+'h560" stroke="#e0e7eb"/>'+txt(ox-40,sy(z)+5,z.toFixed(1),13);
 for(const line of data.segments){const color=line.sourceId==='carrier-0'?'#315b96':line.sourceId==='carrier-3'?'#b8435d':line.sourceId.startsWith('carrier')?'#c38429':'#7197a8',a=line.pointsMm[0],b=line.pointsMm[1];section+='<path d="M'+sx(a[1])+' '+sy(a[2])+'L'+sx(b[1])+' '+sy(b[2])+'" stroke="'+color+'" stroke-width="2"/>';}
 section+='<path d="M'+sx(p.sealY)+' '+oy+'v160" stroke="#16956e" stroke-dasharray="4 4"/>'+txt(sx(p.sealY)-15,oy+180,'seal',13)+txt(ox+290,oy+180,'Y (mm) → '+p.rootY.toFixed(2)+' at body root',13);
}
section+=txt(25,799,'Z (mm): blue bottom film, red top film, ochre gusset films. Contact at the seal is intentional; film thickness is not modeled.',17)+'</svg>';
await writeFile(join(destination,'end-sections.svg'),section);

const bp=report.blankPlan,b=bp.sourceBoundsUvMm,scale=Math.min(900/(b.maxX-b.minX),580/(b.maxY-b.minY)),px=p=>[50+(p[0]-b.minX)*scale,100+(p[1]-b.minY)*scale],poly=(vs,fill,stroke,dash='')=>'<polygon points="'+vs.map(px).map(p=>p.join(',')).join(' ')+'" fill="'+fill+'" stroke="'+stroke+'" stroke-width="2" '+(dash?'stroke-dasharray="'+dash+'"':'')+'/>';
let blank='<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="800"><rect width="1000" height="800" fill="white"/>'+txt(30,35,'Plan the film blank before folding',25)+txt(30,70,'Only distant waste is removed. Plastic dimensions and positions are unchanged.',18)+poly(bp.sourceOutlineUvMm,'#eceff2','#aeb8c0')+poly(bp.cutOutlineUvMm,'white','#dc862b','7 5');
for(const p of c.program.initial.panels)blank+=poly(p.uvMm,'#c2d6e0','#345467');
for(const conflict of bp.conflicts){const q=px(conflict.uvMm);blank+='<circle cx="'+q[0]+'" cy="'+q[1]+'" r="5" fill="#c64545"/>'+txt(q[0]+12,q[1]-5,'Discarded crease junction',15);}
blank+=txt(30,710,'Requested margin '+bp.requestedMarginMm+' mm → retained margin '+bp.selectedMarginMm+' mm',20)+txt(30,745,'Boundary mismatch: '+bp.originalContinuityErrorMm.toExponential(3)+' → '+bp.plannedContinuityErrorMm.toExponential(3)+' mm',18)+txt(30,780,'Orange: explicit cut boundary. Full longitudinal and end weld regions are retained.',18)+'</svg>';
await writeFile(join(destination,'blank-plan.svg'),blank);
