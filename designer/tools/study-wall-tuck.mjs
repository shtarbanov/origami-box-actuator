// Generate a portable, offline step viewer, fixed-scale figure and audit JSON.
// node designer/tools/study-wall-tuck.mjs [output-directory]
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {defaultSpec} from '../kernel/spec.mjs';
import {wallTuckProgram,wallTuckPose,wallTuckStoryboard,studyWallTuck} from '../kernel/wall-tuck-study.mjs';
import {sheetStudySVG,sheetStudyHTML} from '../ui/sheet-study-document.mjs';
const destination=resolve(process.argv[2]??'designer/verification/wall-tuck');
await mkdir(destination,{recursive:true});
const spec=defaultSpec();spec.footprint.frontWidth=80;spec.footprint.rearWidthRatio=.8;spec.rise.front=30;
const options={marginMm:8,heatWidthMm:1,sealOffsetMm:0,samples:201};
const context=wallTuckProgram(spec,options),report=studyWallTuck(spec,options),stages=wallTuckStoryboard(context,report);
const wrongAxis=studyWallTuck(spec,{...options,wholeFoldHinge:2}),wrongDirection=studyWallTuck(spec,{...options,foldSigns:[1,1,1]});
const apexSpec=structuredClone(spec);apexSpec.footprint.rearWidthRatio=1;apexSpec.rise.rearRatio=0;
const apex=studyWallTuck(apexSpec,options),grid=[];
for(const width of [.8,1,1.2])for(const height of [.6,1,1.2])for(const side of [.8,1,1.2]){
 const s=structuredClone(spec);s.footprint.rearWidthRatio=width;s.rise.rearRatio=height;s.rise.rightToLeftRatio=side;
 const r=studyWallTuck(s,{...options,samples:151});grid.push({width,height,side,candidatePass:r.candidatePass,audit:r.audit,seam:r.seam,heater:r.heater});
}
await writeFile(join(destination,'report.json'),JSON.stringify({timestamp:new Date().toISOString(),spec,report,wrongAxis,wrongDirection,apex,grid},null,2));
// Presentation styling is outside the kernel. All positions/axes/stages above
// come from it; the generic UI below only projects this serialized transport.
function style(pose){return {...pose,film:pose.film.map(p=>({...p,color:{'end-0':'#df536b','end-5':'#d68d19',body:'#9db8c8'}[p.region]})),cues:pose.cues.map(c=>({...c,...(c.label==='A'?{labelOffsetPx:[-12,24]}:{})}))};}
for(const stage of stages)stage.frames=stage.frames.map(style);
const vertices=stages.flatMap(s=>s.frames.flatMap(p=>[...p.film,...p.panels].flatMap(p=>p.pointsMm))),lo=[0,1,2].map(i=>Math.min(...vertices.map(p=>p[i]))),hi=[0,1,2].map(i=>Math.max(...vertices.map(p=>p[i]))),center=lo.map((v,i)=>(v+hi[i])/2);
const baseView={az:-30,el:28,zoom:1,x:0,y:0};
const az=baseView.az*Math.PI/180,el=baseView.el*Math.PI/180;
const projected=vertices.map(p=>{const q=p.map((v,i)=>v-center[i]),xx=q[0]*Math.cos(az)-q[1]*Math.sin(az),yy=q[0]*Math.sin(az)+q[1]*Math.cos(az);return [xx,yy*Math.sin(el)-q[2]*Math.cos(el)];});
const spans=[0,1].map(i=>Math.max(...projected.map(p=>p[i]))-Math.min(...projected.map(p=>p[i]))),frame={center,scale:Math.min(880/spans[0],430/spans[1])};
const worst=key=>Math.max(...grid.map(r=>r.audit[key]));
const verification=[
 'First-long-seal study only; complete fabrication is not certified.',
 `Example: front/rear width 80/64 mm; length 75 mm; rise 30 mm.`,
 'Study inputs: rectangular blank expansion 8 mm; heated width 1 mm; zero outward offset. These are examples, not hardware defaults.',
 `27-case ratio grid: ${grid.filter(r=>r.candidatePass).length} passed, 151 samples/fold.`,
 `Worst panel distance error: ${worst('maxRigidDistanceErrorMm').toExponential(3)} mm`,
 `Worst film boundary continuity error: ${worst('maxFilmContinuityErrorMm').toExponential(3)} mm`,
 `Worst seam mismatch: ${Math.max(...grid.map(r=>r.seam.errorMm)).toExponential(3)} mm`,
 'No sampled panel/film crossings or stack-order violations in the passing grid.',
 `Wrong central final axis: seam mismatch ${wrongAxis.seam.errorMm.toFixed(3)} mm.`,
 `Wrong pair swing direction: ${wrongDirection.audit.stackViolations.length} stack-order violation(s), despite matching final guides.`,
 `Zero-rear-rise example: rejected; extra-film continuity error ${apex.audit.maxFilmContinuityErrorMm.toFixed(3)} mm.`,
 'Heated footprint: exactly two opposing target layers; normal approach clear in the zero-thickness model.',
 'Placement matters: the guide is the INNER EDGE of the outward heated band. A band on the body side sees four body-film layers in this example; centering it on the guide includes unwanted layers.',
 'Physical jaw housing, finite-thickness folding, full end-seal junctions and pressure-driven motion remain unverified.'
].join('\n');
await writeFile(join(destination,'viewer.html'),sheetStudyHTML({title:'Fold the doubled side wall inward',subtitle:'First long-seal study · Use ‹ / ›, then drag Fold to inspect a stage.',stages,frame,verification}));
const selected=[stages[0].frames[0],stages[1].frames[30],stages[1].frames[60],stages[2].frames[30],stages[2].frames[60],stages[3].frames[30],stages[4].frames[0]];
const wrongContext=wallTuckProgram(spec,{...options,wholeFoldHinge:2});
const wrongPose=style(wallTuckPose(wrongContext,{step:3,progress:1}));
const right=[Math.cos(az),-Math.sin(az),0],down=[Math.sin(az)*Math.sin(el),Math.cos(az)*Math.sin(el),-Math.cos(el)],dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
function staticBounds(pose){const ps=[...pose.film,...pose.panels].flatMap(p=>p.pointsMm),xs=ps.map(p=>dot(p,right)),ys=ps.map(p=>dot(p,down));return {x0:Math.min(...xs),x1:Math.max(...xs),y0:Math.min(...ys),y1:Math.max(...ys)};}
const staticBoxes=[...selected,wrongPose].map(staticBounds),staticScale=Math.min(420/Math.max(...staticBoxes.map(b=>b.x1-b.x0)),210/Math.max(...staticBoxes.map(b=>b.y1-b.y0)));
const headings=['0  Flat template: A → B → C','1a  Fold at A: halfway','1b  Small panels are doubled','2a  Swing the pair at B','2b  Doubled pair lies inward','3a  Fold the whole strip at C','3b  Large panels overlap','4  Exposed sealing area','Comparison: wrong final axis'];
const captions=[
 ['A: second wall middle; B: its root.','C: opposite wall middle.'],
 ['Only the last small panel folds onto its mate.','The free film margin follows that panel.'],
 ['The two small panels coincide geometrically.','Their material layers remain distinct.'],
 ['The doubled panels move down together.','Their loose end-film margin swings up.'],
 ['The wall pair is now tucked onto the top.','Its free film margin points outward.'],
 ['Use C, the opposite wall middle.','Carry the prepared top and tucked pair.'],
 ['The seam endpoints coincide.','Full film blank retained; no fin-flap folds.'],
 ['Green band is OUTSIDE the matched guide.','Outward: 2 layers. Body side: 4 layers here.'],
 [`Original central line: ${wrongAxis.seam.errorMm.toFixed(1)} mm mismatch.`,'The last fold needs axis C for this route.']
];
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const txt=(x,y,s,size=17,color='#33495b',weight=400)=>`<text x="${x}" y="${y}" font-family="Arial,sans-serif" font-size="${size}" fill="${color}" font-weight="${weight}">${esc(s)}</text>`;
let svg='<svg xmlns="http://www.w3.org/2000/svg" width="1500" height="1280" viewBox="0 0 1500 1280"><rect width="1500" height="1280" fill="#f5f8fa"/>';
svg+=txt(28,42,'Double the side wall → swing it inward → fold the whole strip',28,'#172c3d',700);
svg+=txt(28,74,'Actual kernel poses · shared orthographic scale; each 3D view recentered · material-layer and rigid-panel checks',17);
svg+=txt(28,103,'Blue line: active hinge     Green dashed lines: seal guides     Pink / gold film: the two free margins',16);
for(let i=0;i<9;i++){
 const x=20+(i%3)*493,y=125+Math.floor(i/3)*361;
 svg+=`<rect x="${x}" y="${y}" width="480" height="346" rx="10" fill="white" stroke="#d5dfe6"/>`+txt(x+16,y+31,headings[i],21,'#172c3d',700);
 let pose=i<7?selected[i]:i===7?selected[6]:wrongPose,view=baseView;const box=staticBounds(pose),cx=(box.x0+box.x1)/2,cy=(box.y0+box.y1)/2;let camera={center:right.map((v,j)=>v*cx+down[j]*cy),scale:staticScale};
 if(i===7){const band=report.heater.bandMm,mid=[0,1,2].map(j=>band.reduce((s,p)=>s+p[j],0)/band.length);camera={center:mid,scale:13};view={...baseView,az:0,el:90};}
 svg+=`<g transform="translate(${x+10} ${y+45})">${sheetStudySVG(pose,view,camera,460,235)}</g>`;
 svg+=txt(x+16,y+303,captions[i][0],15)+txt(x+16,y+327,captions[i][1],15);
}
svg+=txt(28,1240,'Passed local first-seal checks on 27 ratio combinations; this does not certify complete end sealing or real pneumatic actuation.',17,'#8c4d26',700)+'</svg>';
await writeFile(join(destination,'wall-tuck.svg'),svg);
await writeFile(join(destination,'frames.json'),JSON.stringify({stages,frame}));
console.log(JSON.stringify({destination,examplePass:report.candidatePass,gridPassed:grid.filter(r=>r.candidatePass).length,gridTotal:grid.length,wrongFinalAxisMm:wrongAxis.seam.errorMm,wrongDirectionStackViolations:wrongDirection.audit.stackViolations.length,apexContinuityErrorMm:apex.audit.maxFilmContinuityErrorMm,verification},null,2));
