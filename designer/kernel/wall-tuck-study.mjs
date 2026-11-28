// Box adapter for a generic hinge program: double the last wall, swing that
// doubled pair inward, then fold the remaining strip over. No fin-flap folds.
import {resolveSpec,DesignError} from './spec.mjs';
import {parameters,unfold,distance} from './geometry.mjs';
import {pairError} from './fabrication-motion.mjs';
import {heatedFilmLayers} from './film-seal-study.mjs';
import {add,sub,mul,dot,cross,unit,identity,point,area,clipUV,compileSheetFolds,sampleSheetFolds,auditSheetFolds} from './sheet-folds.mjs';
export function wallTuckProgram(spec,options){
 if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(k=>!['marginMm','heatWidthMm','sealOffsetMm','foldSigns','wholeFoldHinge','samples'].includes(k)))throw new DesignError('INVALID_OPTIONS','/options','Unknown or missing wall-tuck study options.');
 const {marginMm,heatWidthMm,sealOffsetMm=0,foldSigns=[-1,1,1],wholeFoldHinge=1,samples=101}=options??{};
 if(!Number.isFinite(marginMm)||marginMm<=0||!Number.isFinite(heatWidthMm)||heatWidthMm<=0||!Number.isFinite(sealOffsetMm)||sealOffsetMm<0||!Array.isArray(foldSigns)||foldSigns.length!==3||foldSigns.some(n=>![-1,1].includes(n))||![1,2].includes(wholeFoldHinge))throw new DesignError('INVALID_OPTIONS','/options','Provide explicit positive marginMm and heatWidthMm, optional nonnegative sealOffsetMm, three +/-1 foldSigns and wholeFoldHinge 1 or 2.');
 if(!Number.isInteger(samples)||samples<3||samples>501)throw new DesignError('INVALID_OPTIONS','/options/samples','Use 3..501 samples.');
 const resolved=resolveSpec(spec);if(!resolved.spec.walls.left||!resolved.spec.walls.right)throw new DesignError('UNSUPPORTED_STUDY','/spec','This study requires both folding walls.');
 const net=unfold(parameters(resolved.parameters)),flat=p=>[-p[0],p[1]],panels=net.faces.map(f=>({id:f.id,uvMm:f.panel.map(flat),anchorsUvMm:Object.fromEntries(f.ids.map(id=>[id,flat(f.flat[id])])),transform:identity()}));
 const bounds={minX:-net.bounds.maxX-marginMm,maxX:-net.bounds.minX+marginMm,minY:net.bounds.minY-marginMm,maxY:net.bounds.maxY+marginMm};
 const blank={id:'film',region:'body',stackLevel:0,uvMm:[[bounds.minX,bounds.minY],[bounds.maxX,bounds.minY],[bounds.maxX,bounds.maxY],[bounds.minX,bounds.maxY]],transform:identity()};
 const edgeAt=i=>net.seam.map(id=>flat(net.faces[i].flat[id]));
 function marginNormal(i){const edge=edgeAt(i),d=unit(sub(edge[1],edge[0])),n=[-d[1],d[0]],center=mul(panels[i].uvMm.reduce(add,[0,0]),1/panels[i].uvMm.length);return dot(sub(center,edge[0]),n)>0?mul(n,-1):n;}
 const edge0=edgeAt(0),edge5=edgeAt(5),normal0=marginNormal(0),normal5=marginNormal(5);
 const end0=clipUV(blank,edge0[0],normal0,1),end5=clipUV(blank,edge5[0],normal5,1),body=clipUV(clipUV(blank,edge0[0],normal0,-1),edge5[0],normal5,-1);
 if(!end0||!end5||!body)throw new DesignError('INVALID_FILM_BLANK','/spec','Blank cannot be partitioned into the two free margins and body.');
 end0.id='free-0';end0.region='end-0';end5.id='free-5';end5.region='end-5';body.id='body';
 const hingeIds=['left-root','left-middle','top-left','top-right','right-middle'];
 const hinges=net.hinges.map((ids,j)=>{
  const axisUvMm=ids.map(id=>flat(net.faces[j].flat[id])),d=sub(axisUvMm[1],axisUvMm[0]),n=[-d[1],d[0]],next=panels[j+1].uvMm;
  return {id:hingeIds[j],axisUvMm,parentPanelId:panels[j].id,movingPanelIds:panels.slice(j+1).map(p=>p.id),movingSide:Math.sign(dot(sub(mul(next.reduce(add,[0,0]),1/next.length),axisUvMm[0]),n))||1};
 });
 const model={film:[end0,body,end5],panels,hinges};
 const operations=[
  {id:'double-wall',hingeId:'right-middle',title:'Fold the two small panels onto each other',instruction:'Fold at A, the middle of the second small-panel pair. Carry the free film margin with the last panel.'},
  {id:'swing-pair',hingeId:'top-right',title:'Swing the doubled side wall inward',instruction:'Fold the doubled pair together about B, the boundary beside the top panel. Bring the pair down while its loose film margin travels up, clear of the body film.'},
  {id:'whole-fold',hingeId:hingeIds[wholeFoldHinge],title:wholeFoldHinge===1?'Fold the remaining strip at the opposite wall middle':'Fold at the original central line (comparison)',instruction:wholeFoldHinge===1?'Fold the remaining strip at C, the middle of the opposite small-panel pair, to overlap the large panels and the two outer seam guides.':'Comparison: use the former central half-fold line and inspect the seam mismatch.'}
 ].map((p,i)=>({...p,angleRad:foldSigns[i]*Math.PI,durationMs:1500}));
 const blankPartitionErrorMm2=Math.abs(model.film.reduce((sum,p)=>sum+area(p.uvMm),0)-area(blank.uvMm));
 const program=compileSheetFolds(model,operations),mid=sampleSheetFolds(program,{step:2,progress:.5}),panelZ=mid.panels[4].pointsMm.reduce((s,p)=>s+p[2],0),marginZ=mid.film.filter(p=>p.region==='end-5').flatMap(p=>p.pointsMm).reduce((s,p)=>s+p[2],0);
 program.steps[1].instruction=`Swing the doubled pair together about B, the boundary beside the top panel. The panels travel ${panelZ>=0?'upward':'downward'} while the loose film margin travels ${marginZ>=0?'upward':'downward'}.`;
 return {program,net,bounds,options:{marginMm,heatWidthMm,sealOffsetMm,foldSigns:[...foldSigns],wholeFoldHinge,samples},normal0,edge0,blankPartitionErrorMm2};
}
export function wallTuckPose(context,state){
 const result=sampleSheetFolds(context.program,state),hingeIds=['left-root','left-middle','top-left','top-right','right-middle'];
 const labels={'right-middle':'A','top-right':'B','left-middle':'C'};
 const cues=context.net.hinges.map((ids,i)=>({id:hingeIds[i],role:'fold',pointsMm:ids.map(id=>result.panels[i].anchorsMm[id]),active:result.operation?.hingeId===hingeIds[i],...(result.state.step===0||result.operation?.hingeId===hingeIds[i]?{label:labels[hingeIds[i]]}:{})}));
 for(const i of [0,5])cues.push({id:'long-seal-'+i,role:'seal',pointsMm:context.net.seam.map(id=>result.panels[i].anchorsMm[id]),active:result.state.step===3&&result.state.progress===1});
 return {...result,cues};
}
export function wallTuckStoryboard(context,report,{framesPerFold=61}={}){
 if(!Number.isInteger(framesPerFold)||framesPerFold<3||framesPerFold>181)throw new DesignError('INVALID_OPTIONS','/framesPerFold','Use 3..181 frames per fold.');
 const stages=[{title:'Start with the flat folding template',instruction:'A: second wall middle. B: boundary between that wall and the top panel. C: opposite wall middle. All extra film remains attached.',frames:[wallTuckPose(context,{step:0,progress:1})],durationMs:0}];
 for(let i=0;i<context.program.steps.length;i++){
  const operation=context.program.steps[i],frames=[];
  for(let k=0;k<framesPerFold;k++){const progress=k/(framesPerFold-1);frames.push({...wallTuckPose(context,{step:i+1,progress}),angleLabel:Math.round(Math.abs(operation.angleRad)*progress*180/Math.PI)+'°'});}
  stages.push({title:operation.title,instruction:operation.instruction,durationMs:operation.durationMs,frames});
 }
 const final=wallTuckPose(context,{step:3,progress:1});
 stages.push({title:'Inspect the first long seal',instruction:'The green heated footprint starts at the matched guide and extends outward into the two free film margins. Keep all excess film until after sealing.',result:report.candidatePass?'Two target film layers occupy the heated footprint; no rigid panel enters it.':'This candidate failed its checks; inspect the verification details.',durationMs:0,frames:[{...final,operation:null,cues:final.cues.map(c=>({...c,active:c.role==='seal',label:undefined})),bandMm:report.heater.bandMm}]});
 return stages;
}
export function studyWallTuck(spec,options){
 const c=wallTuckProgram(spec,options),{program,net,edge0,normal0}=c,final=program.steps.at(-1),state=wallTuckPose(c,{step:program.steps.length,progress:1});
 const audit=auditSheetFolds(program,{samples:c.options.samples});
 const guides=[0,5].map(fi=>net.seam.map(id=>state.panels[fi].anchorsMm[id])),seamErrorMm=pairError(...guides);
 const pairFolded=wallTuckPose(c,{step:1,progress:1}),pairCollapseErrorMm=pairError(net.seam.map(id=>pairFolded.panels[5].anchorsMm[id]),['F','G'].map(id=>pairFolded.panels[3].anchorsMm[id]));
 const topOverlayErrorMm=Math.max(...[['A','E'],['B','F'],['C','G'],['D','J']].map(([a,b])=>distance(state.panels[0].anchorsMm[a],state.panels[3].anchorsMm[b])));
 const base=[...edge0[0],0],u=unit(sub([...edge0[1],0],base)),n=[...normal0,0],L=distance(...edge0),{sealOffsetMm:s,heatWidthMm:b}=c.options;
 const band=[[0,s],[L,s],[L,s+b],[0,s+b]].map(([x,y])=>add(base,add(mul(u,x),mul(n,y))));
 const thermal=heatedFilmLayers(state.film,band),panelHits=heatedFilmLayers(state.panels,band);
 const shiftedBand=offset=>band.map(p=>add(p,mul(n,offset-s)));
 const centeredGuideComparison=heatedFilmLayers(state.film,shiftedBand(-b/2)),inwardGuideComparison=heatedFilmLayers(state.film,shiftedBand(-b));
 const regionOf=id=>state.film.find(p=>p.id===id)?.region,regions=thermal.fullyCoveringPatchIds.map(regionOf);
 const normals=thermal.fullyCoveringPatchIds.map(id=>{const p=final.endFilm.find(p=>p.id===id);return unit(cross(p.transform.x,p.transform.y));}),opposedMaterialFaces=normals.length===2&&dot(...normals)<-1+1e-6;
 const flatStack=state.film.every(p=>p.pointsMm.every(v=>Math.abs(v[2])<1e-6)),normalApproachClear=flatStack&&thermal.touchingPatchIds.length===2&&!panelHits.touchingPatchIds.length;
 const localSealPass=seamErrorMm<1e-6&&normalApproachClear&&opposedMaterialFaces&&regions.includes('end-0')&&regions.includes('end-5');
 return {schema:'origami-box/wall-tuck-study/1',options:c.options,program,blankMm:c.bounds,blankPartitionErrorMm2:c.blankPartitionErrorMm2,audit,
  construction:{pairCollapseErrorMm,topOverlayErrorMm},seam:{pairedLinesMm:guides,errorMm:seamErrorMm},heater:{bandMm:band,placement:'guide-is-inner-edge-of-outward-heated-band',approachAxis:[0,0,1],...thermal,panelIdsInFootprint:panelHits.touchingPatchIds,targetRegions:regions,opposedMaterialFaces,normalApproachClear,centeredGuideComparison,inwardGuideComparison,localSealPass},
  candidatePass:audit.sampledPass&&localSealPass&&c.blankPartitionErrorMm2<1e-6&&pairCollapseErrorMm<1e-6&&topOverlayErrorMm<1e-6,manufacturingReady:false,
  limitations:['Zero-thickness geometric and material-layer study, not a finite-thickness clearance certificate.','Only the first long sealing operation is audited; end-seal junctions and pneumatic motion remain unverified.']};
}
