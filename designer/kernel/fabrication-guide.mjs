// Manufacturing sequence, independent of presentation and of the old assembly animation.
// Virtual hinge axes are ideal: flat stacking is intentional, not a thickness certificate.
import {resolveSpec,DesignError} from './spec.mjs';
import {parameters,unfold,pose,panelWorld,distance} from './geometry.mjs';
import {panelFrame} from './panel-frame.mjs';
import {contacts} from './validate.mjs';
import {fabricationVisuals} from './fabrication-visuals.mjs';
import {prefoldMaps,outwardMaps,panelsCoplanar,pairError} from './fabrication-motion.mjs';

const stages=[
 {id:'layout',operation:'prepare',title:'Start with the flat layout',instruction:'Attach the panels to the film using the folding template. Trace the solid fold lines, dashed sealing lines and inlet circle.'},
 {id:'half-fold',operation:'fold',title:'Fold in half',instruction:'Fold along the second solid line, between the left upper wall and the top panel. Bring the two outer dashed lines together.'},
 {id:'long-seal',operation:'seal',title:'Seal the long edge',instruction:'Seal the overlapping outer dashed lines. Keep an allowance when trimming. Roll over the seal 10 times.'},
 {id:'inlet',operation:'inlet',title:'Attach the inlet',instruction:'Tape the inlet base at the marked circle. Press the film against it from inside, then puncture the air hole from inside before closing the ends.'},
 {id:'open-pouch',operation:'fold',title:'Open the pouch into a box',instruction:'Lift the top panel to form the rectangular cross-section. Keep the first seal closed; the top shifts sideways as the straight side walls rise.'},
 {id:'inward-fold',operation:'fold',title:'Fold the side walls inward',instruction:'Push both marked side creases inward into a >< profile, then flatten the box so the top and bottom end-sealing lines overlap.'},
 {id:'front-seal',operation:'seal',title:'Seal the front end',instruction:'Seal the overlapping front dashed lines. Keep the inlet and its air passage clear of the heated area; trim the excess film.'},
 {id:'rear-seal',operation:'seal',title:'Seal the rear end',instruction:'Seal the overlapping rear dashed lines, keeping the inlet and its air passage clear. Trim the excess film. The actuator is ready for an inflation test.'}
].map(stage=>({...stage,transition:{durationMs:stage.operation==='seal'?1700:stage.operation==='fold'||stage.operation==='inlet'?1100:240}}));
const sub=(a,b)=>a.map((x,i)=>x-b[i]);
function programFor(p){
 // The generalized program is retained only for geometry-only regression audits.
 // Public guide/pose requests reject it until a complete film sealing route exists.
 const result=stages.map(s=>({...s,transition:{...s.transition}}));
 if(p.kind!=='rectangle'){
  Object.assign(result[1],{title:'Fold the first side pair',instruction:'Fold the two left side panels onto each other along their middle solid crease. Carry the rest of the strip with this fold; the top panel comes over the bottom.'});
  result.splice(2,0,{id:'align-seam',operation:'fold',title:'Fold the other side pair',instruction:'Fold the outermost small panel back along the other side pair’s middle solid crease. The two long dashed sealing lines now coincide.',transition:{durationMs:1100}});
  Object.assign(result.find(s=>s.id==='open-pouch'),{instruction:'Open the sealed pouch by unfolding both outward-folded side pairs. Keep the long seal closed while the top reaches the designed raised pose.'});
 }
 return result;
}
function context(spec){
 const r=resolveSpec(spec),supported=r.spec.walls.left&&r.spec.walls.right;
 if(!supported)return {p:r.parameters,supported:false,net:null,stages:[]};
 try{const p=parameters(r.parameters);return {p,supported:true,net:unfold(p),stages:programFor(p),prefold:p.kind!=='rectangle'};}
 catch(e){throw new DesignError('OUTSIDE_SOLVER_DOMAIN','/spec',e.message);}
}
function requireSupport(c){if(!c.supported)throw new DesignError('FABRICATION_GUIDE_UNSUPPORTED','/spec','This manufacturing guide requires both folding side walls; the direct-hinge sequence is separate.');}
function stateValues(state,program){
 if(!state||typeof state!=='object'||Array.isArray(state))throw new DesignError('INVALID_STATE','/state','Supply stageId and optional progress.');
 for(const k of Object.keys(state))if(!['stageId','progress'].includes(k))throw new DesignError('UNKNOWN_FIELD',`/state/${k}`,'Unknown fabrication state field.');
 const index=program.findIndex(s=>s.id===state.stageId),progress=state.progress??1;
 if(index<0)throw new DesignError('INVALID_STATE','/state/stageId','Unknown fabrication stage.');
 if(!Number.isFinite(progress)||progress<0||progress>1)throw new DesignError('INVALID_STATE','/state/progress','Expected a finite number from 0 to 1.');
 return {index,progress};
}
function mapsAt(c,index,t){
 const {p,net}=c,id=c.stages[index].id;
 if(c.prefold){
  if(id==='layout')return prefoldMaps(net,0,0);
  if(id==='half-fold')return prefoldMaps(net,t,0);
  if(id==='align-seam')return prefoldMaps(net,1,t);
  if(id==='long-seal'||id==='inlet')return prefoldMaps(net,1,1);
  if(id==='open-pouch')return outwardMaps(p,net,t);
  const v=pose({...p,opening:id==='inward-fold'?1-t:0}).v;
  return net.faces.map(f=>Object.fromEntries(f.ids.map(id=>[id,v[id]])));
 }
 if(index<=3){
  const angle=index===0?0:index===1?Math.PI*t:Math.PI,c=Math.cos(angle),s=Math.sin(angle);
  const hinge=-net.faces[3].flat.E[0];
  return net.faces.map((f,i)=>Object.fromEntries(f.ids.map(id=>{
   const [x,y]=f.flat[id],dx=-x-hinge;
   return [id,i<3?[-x,y,0]:[hinge+dx*c,y,-dx*s]];
  })));
 }
 let v;
 if(index===4){
  // Open a sealed flat parallelogram, keeping each two-panel wall straight.
  // Its top translates along a radius-2l arc; every closed-loop edge stays fixed.
  const theta=t*Math.PI/2,dx=-2*p.l0*Math.cos(theta),h=2*p.l0*Math.sin(theta),a=-p.width0/2,b=p.width0/2,L=p.length;
  v={A:[a,0,0],B:[b,0,0],C:[b,L,0],D:[a,L,0],E:[a+dx,0,h],F:[b+dx,0,h],G:[b+dx,L,h],J:[a+dx,L,h],K:[a+dx/2,0,h/2],L:[a+dx/2,L,h/2],M:[b+dx/2,0,h/2],N:[b+dx/2,L,h/2]};
 }else{
  // The upright endpoint joins the inward-folding branch at its straight-wall singularity.
  v=pose({...p,opening:index===5?1-t:0}).v;
 }
 return net.faces.map(f=>Object.fromEntries(f.ids.map(id=>[id,v[id]])));
}
function geometry(c,index,t){
 const {net}=c,maps=mapsAt(c,index,t),map=(fi,points)=>panelWorld(net,{...net.faces[fi],panel:points},maps[fi]);
 const panels=net.faces.map((f,i)=>({id:f.id,pointsMm:map(i,f.panel)}));
 const seals=net.seals.map((s,i)=>({id:i<2?'long':i%2===0?'front':'rear',panelId:net.faces[i<2?(i===0?0:5):i<4?0:3].id,pointsMm:map(i<2?(i===0?0:5):i<4?0:3,[s.a,s.b])}));
 const folds=net.folds.map((s,i)=>({id:['left-crease','half-fold','right-crease'][i],role:'fold',pointsMm:map([1,2,4][i],[s.a,s.b])}));
 // Top/bottom film allowance guides follow their parent plate until the final
 // flat stack. These strips are illustrative; side gussets are not a membrane solve.
 const film=[];
 for(const [fi,start] of [[0,2],[3,4]])for(let j=0;j<2;j++){
  const edge=net.ends[fi===0?0:1].edges[j],s=net.seals[start+j],f=net.faces[fi];
  film.push({id:`${f.id}-${j}`,pointsMm:map(fi,[f.flat[edge[0]],f.flat[edge[1]],s.b,s.a])});
 }
 const inlet=map(3,[net.inlet])[0];
 return {panels,maps,seals,folds,film,inlet};
}
function poseValue(c,state){
 const {index,progress:t}=state,program=c.stages,stage=program[index],g=geometry(c,index,t),id=stage.id;
 const sealId=id==='long-seal'?'long':id==='front-seal'?'front':id==='rear-seal'?'rear':null;
 const completed=index-(t<1?1:0),sealedIds=program.slice(0,completed+1).filter(s=>s.operation==='seal').map(s=>s.id==='long-seal'?'long':s.id==='front-seal'?'front':'rear');
 const activeFolds=id==='half-fold'?[c.prefold?'left-crease':'half-fold']:id==='align-seam'?['right-crease']:id==='inward-fold'?['left-crease','right-crease']:[];
 const inletIndex=program.findIndex(s=>s.id==='inlet'),inlet={pointMm:g.inlet,active:index===inletIndex,installed:completed>=inletIndex,markerVisible:index<inletIndex};
 const cues=[...g.folds.map(s=>({...s,active:activeFolds.includes(s.id)})),...g.seals.map(s=>({...s,role:'seal',active:s.id===sealId,sealed:sealedIds.includes(s.id)}))];
 return {schema:'origami-box/fabrication-pose/1',state:{stageId:id,progress:t},stage:{...stage,transition:{...stage.transition}},panels:g.panels,
  placements:g.panels.map(p=>({id:p.id,...panelFrame(p.pointsMm)})),contacts:[],cues,
  film:g.film,inlet,sealedIds,
  ...fabricationVisuals({p:c.p,g,progress:t,inletVisible:index>=inletIndex,attachProgress:index===inletIndex?t:1,inletActive:inlet.active,activeSeal:sealId}),
  activeSeal:sealId?{id:sealId,pairedLinesMm:g.seals.filter(s=>s.id===sealId).map(s=>s.pointsMm),status:'coincident-ideal-guides'}:null,
  evidence:{panelModel:'rigid zero-thickness mid-surfaces',filmModel:'illustrative top/bottom allowance strips; flexible side gussets not solved',finiteThickness:'not certified; flat stack requires real hinge and film compliance'}};
}
function generalEnvelope(c){
 const points=[];
 for(let index=0;index<c.stages.length;index++)for(let k=0;k<=24;k++){
  const g=geometry(c,index,k/24);points.push(...g.panels.flatMap(p=>p.pointsMm),...g.film.flatMap(p=>p.pointsMm),g.inlet);
 }
 const pad=Math.max(4,c.p.gap+2),lo=[0,1,2].map(i=>Math.min(...points.map(p=>p[i]))-pad),hi=[0,1,2].map(i=>Math.max(...points.map(p=>p[i]))+pad);
 return [0,1].flatMap(x=>[0,1].flatMap(y=>[0,1].map(z=>[x?hi[0]:lo[0],y?hi[1]:lo[1],z?hi[2]:lo[2]])));
}
export function fabricationGuide(spec){
 const c=context(spec);
 if(!c.supported)return {schema:'origami-box/fabrication-guide/1',supported:false,stages:[],diagnostics:[{code:'FABRICATION_GUIDE_UNSUPPORTED',severity:'info',message:'The fabrication guide requires both folding side walls. The direct-hinge design needs a separate sequence.'}]};
 if(c.prefold)return {schema:'origami-box/fabrication-guide/1',supported:false,stages:[],diagnostics:[{code:'SEAL_LAYER_ACCESS_UNVERIFIED',severity:'warning',message:'The previous prefold route has been withdrawn: coincident seam guides did not establish that only the intended film layers reach the sealer.'}]};
 const {p}=c,w=Math.min(p.gap*.8,3),margin=w*.7,lo=[-1.5*p.width0-4*p.l0-margin,-p.l0-p.clearance-margin,-w*.8-.25],hi=[p.width0/2+margin,p.length+p.l0+p.clearance+margin,p.width0+2*p.l0];
 const framePointsMm=c.prefold?generalEnvelope(c):[0,1].flatMap(x=>[0,1].flatMap(y=>[0,1].map(z=>[x?hi[0]:lo[0],y?hi[1]:lo[1],z?hi[2]:lo[2]])));
 return {schema:'origami-box/fabrication-guide/1',supported:true,stages:c.stages.map(s=>({...s,transition:{...s.transition}})),framePointsMm,
  diagnostics:[{code:'IDEAL_FABRICATION_PATH',severity:'info',message:'Rigid-panel sequence; flat stacking uses ideal mid-surfaces. Film pleats and finite-thickness clearance require physical validation.'}]};
}
export function fabricationPose(spec,state){const c=context(spec);requireSupport(c);if(c.prefold)throw new DesignError('SEAL_LAYER_ACCESS_UNVERIFIED','/spec','The generalized route is withdrawn pending film-layer and sealer-access verification.');return poseValue(c,stateValues(state,c.stages));}

export function validateFabrication(spec,options={}){
 if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(k=>k!=='samples'))throw new DesignError('INVALID_OPTIONS','/options','Supply only an optional samples count.');
 const {samples=41}=options;
 if(!Number.isInteger(samples)||samples<2||samples>1001)throw new DesignError('INVALID_OPTIONS','/options/samples','Expected an integer from 2 to 1001.');
 const c=context(spec);requireSupport(c);const {net}=c,ref=geometry(c,0,1).panels;
 let maxDistanceErrorMm=0,maxAreaErrorMm2=0,maxHingeErrorMm=0,maxClosureErrorMm=0,maxSealMismatchMm=0,maxTransitionErrorMm=0,maxPanelMapErrorMm=0,flatStackContactSamples=0;
 const area=ps=>{const sum=[0,0,0];for(let i=0;i<ps.length;i++){const a=ps[i],b=ps[(i+1)%ps.length];sum[0]+=a[1]*b[2]-a[2]*b[1];sum[1]+=a[2]*b[0]-a[0]*b[2];sum[2]+=a[0]*b[1]-a[1]*b[0];}return Math.hypot(...sum)/2;};
 const unexpectedSurfaceCrossings=[],longSealIndex=c.stages.findIndex(s=>s.id==='long-seal');
 for(let i=0;i<c.stages.length;i++)for(let k=0;k<samples;k++){
  const t=k/(samples-1),g=geometry(c,i,t),id=c.stages[i].id;
  for(let f=0;f<ref.length;f++){
   const a=ref[f].pointsMm,b=g.panels[f].pointsMm,face=net.faces[f],ids=face.ids;
   for(let j=0;j<a.length;j++)for(let h=j+1;h<a.length;h++)maxDistanceErrorMm=Math.max(maxDistanceErrorMm,Math.abs(distance(a[j],a[h])-distance(b[j],b[h])));
   for(let j=0;j<ids.length;j++)for(let h=j+1;h<ids.length;h++)maxDistanceErrorMm=Math.max(maxDistanceErrorMm,Math.abs(distance(face.flat[ids[j]],face.flat[ids[h]])-distance(g.maps[f][ids[j]],g.maps[f][ids[h]])));
   const embedded=panelWorld(net,{...face,panel:ids.map(id=>face.flat[id])},g.maps[f]);
   ids.forEach((id,j)=>{maxPanelMapErrorMm=Math.max(maxPanelMapErrorMm,distance(embedded[j],g.maps[f][id]));});
   maxAreaErrorMm2=Math.max(maxAreaErrorMm2,Math.abs(area(a)-area(b)));
  }
  net.hinges.forEach((edge,j)=>edge.forEach(id=>{maxHingeErrorMm=Math.max(maxHingeErrorMm,distance(g.maps[j][id],g.maps[j+1][id]));}));
  if(i>=longSealIndex)net.seam.forEach(id=>{maxClosureErrorMm=Math.max(maxClosureErrorMm,distance(g.maps[0][id],g.maps.at(-1)[id]));});
  const activeSeal=id==='long-seal'?'long':id==='front-seal'?'front':id==='rear-seal'?'rear':null;
  if(activeSeal){const [a,b]=g.seals.filter(s=>s.id===activeSeal).map(s=>s.pointsMm);maxSealMismatchMm=Math.max(maxSealMismatchMm,pairError(a,b));}
  const panels=g.panels.map(p=>p.pointsMm),pairs=contacts(panels,0),crossings=pairs.filter(([a,b])=>!panelsCoplanar(panels[a],panels[b]));
  if(pairs.length>crossings.length)flatStackContactSamples++;
  if(crossings.length)unexpectedSurfaceCrossings.push({stageId:id,progress:t,pairs:crossings});
  if(i>0&&k===0){const prev=geometry(c,i-1,1);g.panels.forEach((p,f)=>p.pointsMm.forEach((v,j)=>{maxTransitionErrorMm=Math.max(maxTransitionErrorMm,distance(v,prev.panels[f].pointsMm[j]));}));}
 }
 return {schema:'origami-box/fabrication-validation/1',validationScope:'sampled-rigid-panel-geometry',manufacturingReady:false,guideAvailable:!c.prefold,sealLayerAccess:'unverified',samplesPerStage:samples,maxDistanceErrorMm,maxAreaErrorMm2,maxHingeErrorMm,maxClosureErrorMm,maxSealMismatchMm,maxTransitionErrorMm,maxPanelMapErrorMm,flatStackContactSamples,unexpectedSurfaceCrossings,
  numericalPass:Math.max(maxDistanceErrorMm,maxAreaErrorMm2,maxHingeErrorMm,maxClosureErrorMm,maxSealMismatchMm,maxTransitionErrorMm,maxPanelMapErrorMm)<1e-6&&unexpectedSurfaceCrossings.length===0,
  evidence:{rigidity:'physical and virtual panel vertex-pair distances, areas and rigid-map embedding, sampled',hinges:'both endpoints, sampled',longitudinalClosure:'both endpoints after first sealing, sampled',seals:'paired ideal guide endpoints at sealing poses',collision:'noncoplanar zero-thickness surface crossings, sampled; coplanar stacking counted separately',finiteThickness:'unverified',film:'full membrane and gusset folding unverified'}};
}
