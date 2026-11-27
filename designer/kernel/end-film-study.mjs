// Research orchestration stays in the kernel. The GUI consumes complete poses,
// operation descriptions and explicit verification limits, without solving.
import {endFilmOverlayProblem,endFilmBodyMeshes,endSealLayerRegistry,endLongSeamCoverage,endFilmAirwayTopology,endFilmInletClearance,minimumEndBlankMargin} from './end-film.mjs';
import {endFilmPressFrame} from './end-film-closure.mjs';
import {validateEndFilm,endFilmLayerAudit,endFilmMeshes,endFilmInletPath,endFilmPlasticPath} from './end-film-validation.mjs';
import {wallTuckPhysicalStoryboard,wallTuckThicknessAudit} from './wall-tuck-thickness.mjs';
import {planEndFilmBlank,withEndBlankPlan} from './end-film-blank.mjs';

function box(id,x0,x1,y0,y1,z0,z1){return {id,role:'tool',verticesMm:[[x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0],[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]],faces:[[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]]};}
export function compileEndFilmStudy(c,{framesPerPress=21,includePrefolds=true}={}){
 if(!Number.isInteger(framesPerPress)||framesPerPress<3||framesPerPress>101)throw Error('Use 3..101 frames per press.');
 const blankPlan=planEndFilmBlank(c);c=withEndBlankPlan(c,blankPlan);
 const problems=['front','rear'].map(end=>endFilmOverlayProblem(c,{end})),frames=problems.map(p=>Array.from({length:framesPerPress},(_,i)=>endFilmPressFrame(p,i/(framesPerPress-1))));
 const validations=problems.map((p,i)=>validateEndFilm(p,{frames:frames[i]})),layerAudits=problems.map((p,i)=>frames[i].map(f=>endFilmLayerAudit(p,f))),registries=['front','rear'].map(e=>endSealLayerRegistry(c,e)),coverage=endLongSeamCoverage(c),airway=endFilmAirwayTopology(c),inlet=endFilmInletClearance(c),inletPath=endFilmInletPath(problems[1],frames[1].at(-1),inlet.inletReferenceMm);
 const body=endFilmBodyMeshes(c,...problems),plastic=problems[0].plasticMeshes,stages=includePrefolds?wallTuckPhysicalStoryboard(c,{framesPerFold:31}).slice(0,7):[];
 const plasticAirway=endFilmPlasticPath(problems[1],inletPath,{bodyTargetMm:[0,c.context.net.p.length/2,problems[1].sealPlaneZMm]});
 // Earlier operations show the previously checked rigid skeleton/local strips.
 // We do not invent a full-blank history before the both-inward state.
 for(const s of stages){s.status='research';s.result='Rigid panels and local hinge strips. Complete loose end-film motion during these earlier folds is not modeled.';}
 if(includePrefolds&&blankPlan.operation!=='keep-blank'){
  const original=blankPlan.sourceOutlineUvMm.map(v=>[...v,0]),retained=blankPlan.cutOutlineUvMm.map(v=>[...v,0]),start=stages[0].frames[0];
  stages[0].frames=[{...start,meshes:[{id:'source-blank',role:'source-film',verticesMm:original,faces:[[0,1,2,3]]},...start.meshes]}];
  const cues=retained.map((p,i)=>({role:'cut',active:true,pointsMm:[p,retained[(i+1)%retained.length]]}));
  stages.splice(1,0,{id:'trim-blank',title:'Trim distant waste while flat',instruction:`Cut the film to the marked ${blankPlan.retainedReferenceYRange?'profile':'rectangle'} before folding. ${blankPlan.retainedReferenceYRange?'Retain the full long margins; remove only the mapped end tails.':'Blank margin: '+blankPlan.requestedMarginMm+' → '+blankPlan.selectedMarginMm+' mm.'} Use the supplied cut contour; keep every panel, end heat band and long-weld junction inside. The excess film would make extended hinge creases intersect.`,status:'research',result:'The original mismatch is reported, not merged away. The retained material has independently checked continuous boundaries.',frames:[{...start,meshes:[{id:'retained-blank',role:'source-film',verticesMm:retained,faces:[retained.map((_,i)=>i)]},...start.meshes],cues}]});
 }
 const pose=(front,rear,active=null,heatProgress=null,frontSealed=false,rearSealed=false)=>{
  const meshes=[...plastic,...body,...endFilmMeshes(problems[0],front),...endFilmMeshes(problems[1],rear)],cues=[];let bandMm;
  for(const i of [0,1])if(i===0?frontSealed:rearSealed){const p=problems[i],r=registries[i],y=p.sealY,w=p.bandWidthMm,z=p.sealPlaneZMm;meshes.push({id:'completed-'+p.end+'-weld',role:'completed-weld',verticesMm:[[r.minX,y-w/2,z],[r.maxX,y-w/2,z],[r.maxX,y+w/2,z],[r.minX,y+w/2,z]],faces:[[0,1,2,3]]});}
  if(active!==null){const p=problems[active],r=registries[active],z=p.sealPlaneZMm,y=p.sealY,w=p.bandWidthMm;
   cues.push({role:'seal',active:true,pointsMm:[[r.minX,y,z],[r.maxX,y,z]],label:heatProgress===null?'End seal line':undefined});
   if(heatProgress!==null){const gap=2.5*Math.abs(2*heatProgress-1),x0=r.minX-.5,x1=r.maxX+.5,y0=y-w/2,y1=y+w/2;
    meshes.push(box('upper-heater',x0,x1,y0,y1,z+gap,z+gap+1),box('lower-heater',x0,x1,y0,y1,z-gap-1,z-gap));
    if(heatProgress>=.25&&heatProgress<=.75)bandMm=[[r.minX,y0,z],[r.maxX,y0,z],[r.maxX,y1,z],[r.minX,y1,z]];
   }
  }
  return {meshes,panels:[],film:[],cues,bandMm,physicalThicknessMm:c.thicknessMm,manufacturingReady:false,wallDirections:{left:'inward',right:'inward'},angleLabel:'',scope:'Finite rigid plastic and deformable zero-thickness end film. Tool bars illustrate normal access, not calibrated heater hardware.'};
 };
 const maxPrincipalStrain=Math.max(...validations.flatMap(v=>v.frames.map(f=>f.maxPrincipalStrain))),geometryPass=validations.every(v=>v.allLayerGeometryPass&&v.allPriorWeldPass)&&layerAudits.flat().every(a=>a.pass)&&validations.every(v=>v.frames.every(f=>f.maxRootErrorMm<1e-6&&f.plasticAxialClearanceMm>0)),conditional='Geometry checked at sampled frames; film strain limit is unconfirmed. This is a research path.';
 stages.push({title:'Keep the loose end film',instruction:'Both side walls are inward. Keep material beyond both end seal lines. The existing long seal must extend through both end seal bands. The full end-film model starts here.',status:'research',result:conditional,frames:[pose(frames[0][0],frames[1][0])]},
 {title:'Bring the front end layers together',instruction:'Flatten the front overhang outside the rigid panels. Two central skin layers and four gusset layers approach one plane; the previous long weld remains joined.',status:'research',result:conditional,durationMs:1800,frames:frames[0].map(f=>({...pose(f,frames[1][0],0),angleLabel:Math.round(f.progress*100)+'%'}))},
 {title:'Seal the full front end',instruction:'Seal across the full folded-film width, including the gussets and the long-seam junction. The tool approaches normal to the stack, beyond all plastic.',status:'research',result:conditional,durationMs:1400,frames:Array.from({length:17},(_,i)=>pose(frames[0].at(-1),frames[1][0],0,i/16,i>=8))},
 {title:'Bring the rear end layers together',instruction:'Keep the front end closed. Flatten the other overhang without adding an internal weld between the inlet and the body.',status:'research',result:conditional,durationMs:1800,frames:frames[1].map(f=>({...pose(frames[0].at(-1),f,1,null,true),angleLabel:Math.round(f.progress*100)+'%'}))},
 {title:'Seal the full rear end',instruction:'Seal the full rear width, then trim excess beyond the completed seals. The inlet remains inside the unbonded cavity. Its actual hole diameter is still unconfirmed.',status:'research',result:conditional,durationMs:1400,frames:Array.from({length:17},(_,i)=>pose(frames[0].at(-1),frames[1].at(-1),1,i/16,true,i>=8))});
 return {schema:'origami-box/end-film-study/1',stages,problems,frames,report:{blankPlan,geometryPass,validations,layerAudits,registries,coverage,minimumBlankMargin:minimumEndBlankMargin(c),airway,inlet,inletPath,plasticAirway,maxPrincipalStrain,finitePanelAudit:wallTuckThicknessAudit(c,{samples:101}),sampleCountPerEnd:framesPerPress,plasticThicknessMm:c.thicknessMm,retainedLongFinMm:2,endTrimAllowanceMm:2,materialStrainLimit:null,filmThicknessMm:null,continuousTimeCertified:false,fullEarlierMembraneHistoryModeled:false,manufacturingReady:false}};
}
