// Pure entry points: deterministic JSON-compatible values; no I/O or rendering.
import {parameters,model,unfold,pose,panelWorld} from './geometry.mjs';
import {audit,assemblyAudit,assembly,contacts} from './validate.mjs';
import {resolveSpec,DesignError} from './spec.mjs';
import {designRules,futureExtensions} from './design-rules.mjs';
import {panelFrame} from './panel-frame.mjs';
import {panelPrismMesh} from './panel-solid.mjs';
import {mobilityProfile} from './mobility.mjs';
import {postureAt,solvePosture,synthesizeLongitudinalGoal} from './posture.mjs';
import {rearApexRelief,ASSEMBLY_TARGET} from './fabrication.mjs';
import {sphericalPose} from './spherical-motion.mjs';
import {ENGINE_VERSION} from './version.mjs';
export {defaultSpec,legacyToSpec} from './spec.mjs';
export {fabricationGuide,fabricationPose,validateFabrication} from './fabrication-guide.mjs';
const VERSION='origami-box/kernel/1';
const capabilities={rigidGeometry:true,constructedFoldingPath:true,passiveMotionPrediction:false,pressureModel:false,airtightFilmModel:false,continuousCollisionCertificate:false};
function resolve(spec){
 const r=resolveSpec(spec);
 try{r.parameters=parameters(r.parameters);return r;}
 catch(e){throw new DesignError('OUTSIDE_SOLVER_DOMAIN','',e.message);}
}
function geometryError(operation){try{return operation();}catch(e){if(e instanceof DesignError)throw e;throw new DesignError('GEOMETRY_FAILURE','',e.message);}}
const point=(p,mirror)=>mirror?[-p[0],p[1],p[2]]:[...p];
const idFor=(id,mirror)=>mirror?id.replace(/^right/,'left'):id;
function panelsData(faces,points,mirror){return faces.map((f,i)=>({id:idFor(f.id,mirror),pointsMm:points[i].map(p=>point(p,mirror))}));}
export function buildDesign(spec){return geometryError(()=>{
 const r=resolve(spec),m=model(r.parameters),net=unfold(r.parameters);
 const connected=[...m.hinges,m.seam];
 const hinges=connected.map((edge,i)=>({id:i===connected.length-1?'closure':`hinge-${i+1}`,panelIds:[idFor(m.faces[i].id,r.mirror),idFor(m.faces[(i+1)%m.faces.length].id,r.mirror)],axisMm:edge.map(id=>point(m.v[id],r.mirror))}));
 const reference=panelsData(net.faces,net.faces.map(f=>panelWorld(net,f,m.v)),r.mirror);
 return {schema:'origami-box/design/1',kernelVersion:VERSION,engineVersion:ENGINE_VERSION,spec:r.spec,
  frame:{origin:'centre of the front bottom hinge-axis edge',axes:{x:'width',y:'front to rear',z:'above bottom'},units:'mm'},
  topology:{panels:m.faces.map(f=>({id:idFor(f.id,r.mirror),vertexIds:[...f.ids]})),hinges},
  reference,localPanels:reference.map(p=>({id:p.id,shapeMm:panelFrame(p.pointsMm).shapeMm})),
  rules:designRules,futureExtensions,capabilities:{...capabilities},
  derivedFabrication:{rearApexReliefMm:rearApexRelief(r.parameters),nominalAssemblyTarget:ASSEMBLY_TARGET,thicknessModel:'symmetric panel prisms'},
  parameterRelations:!r.spec.walls.left||!r.spec.walls.right?[{code:'HINGE_RISE_RATIO',paths:['/rise/rearRatio','/footprint/rearWidthRatio'],relation:'equal',reason:'Rigid rotation about one side fixes the ratio of free-edge rises.'}]:[],
  diagnostics:[{code:'CONSTRUCTED_PATH_ONLY',severity:'info',message:'The selected rigid folding path is admissible; unique passive motion and pneumatic behavior are not established.'},{code:'FILM_UNVERIFIED',severity:'warning',message:'End film, sealing guides and manufacturing require physical validation.'}]};
});}
function stateValues(state){
 if(!state||typeof state!=='object'||Array.isArray(state))throw new DesignError('INVALID_STATE','/state','Expected a state object.');
 for(const key of Object.keys(state))if(!['mode','progress','targetOpening'].includes(key))throw new DesignError('UNKNOWN_FIELD',`/state/${key}`,'Unknown state field.');
 const {mode='actuation',progress,targetOpening=.75}=state;
 if(!['actuation','assembly'].includes(mode))throw new DesignError('INVALID_STATE','/state/mode','Expected actuation or assembly.');
 for(const [key,value] of Object.entries({progress,targetOpening}))if(!Number.isFinite(value)||value<0||value>1)throw new DesignError('INVALID_STATE',`/state/${key}`,'Expected a finite number from 0 to 1.');
 if(mode==='actuation'&&Object.hasOwn(state,'targetOpening'))throw new DesignError('INVALID_STATE','/state/targetOpening','targetOpening is only meaningful for assembly.');
 return {mode,progress,...(mode==='assembly'?{targetOpening}:{})};
}
export function evaluatePose(spec,state){return geometryError(()=>{
 const r=resolve(spec),s=stateValues(state),p=r.parameters,net=unfold(p),m=pose({...p,opening:s.mode==='actuation'?s.progress:s.targetOpening});
 const points=s.mode==='assembly'?assembly(p,s.progress,s.targetOpening).panels:net.faces.map(f=>panelWorld(net,f,m.v));
 const pairs=s.mode==='actuation'&&s.progress===0&&p.thickness===0?[]:contacts(points,p.thickness);
 const panels=panelsData(net.faces,points,r.mirror);
 return {schema:'origami-box/pose/1',state:s,panels,meshes:panels.map(panel=>panelPrismMesh(panel,p.thickness)),
  placements:panels.map(p=>{const {originMm,rotationRowMajor}=panelFrame(p.pointsMm);return {id:p.id,originMm,rotationRowMajor};}),
  contacts:pairs.map(pair=>pair.map(i=>idFor(net.faces[i].id,r.mirror))),
  interpretation:'Constructed rigid geometry; progress is not pressure, time or predicted physical posture.'};
});}
function sampleCount(value,path){if(!Number.isInteger(value)||value<2||value>10001)throw new DesignError('INVALID_OPTIONS',path,'Sample count must be an integer between 2 and 10001.');return value;}
export function validateDesign(spec,options={}){return geometryError(()=>{
 const r=resolve(spec),p=r.parameters;
 for(const key of Object.keys(options))if(!['samples','assemblySamples'].includes(key))throw new DesignError('UNKNOWN_FIELD',`/options/${key}`,'Unknown validation option.');
 const a=audit(p,{samples:sampleCount(options.samples??181,'/options/samples'),thickness:p.thickness});
 const b=assemblyAudit(p,{samples:sampleCount(options.assemblySamples??91,'/options/assemblySamples'),thickness:p.thickness});
 const {parameters:unused,...actuation}=a;
 return {schema:'origami-box/validation/1',actuation,assembly:b,
  evidence:{rigidity:'numerical',closure:'numerical',collision:'sampled',manufacturing:'unverified',pneumaticPerformance:'unverified'},
  capabilities:{...capabilities}};
});}
export function templateGeometry(spec,options={}){return geometryError(()=>{
 const r=resolve(spec);
 for(const key of Object.keys(options))if(key!=='stockSizeMm')throw new DesignError('UNKNOWN_FIELD',`/options/${key}`,'Unknown template option.');
 const stock=options.stockSizeMm??[281,186];
 if(!Array.isArray(stock)||stock.length!==2||stock.some(v=>!Number.isFinite(v)||v<=0))throw new DesignError('INVALID_OPTIONS','/options/stockSizeMm','Expected two positive stock dimensions in mm.');
 const result={schema:'origami-box/templates/1',units:'mm',stockSizeMm:[...stock]};
 for(const type of ['folding','cutting']){
  const net=unfold(r.parameters,type==='folding',{stockSizeMm:stock});
  result[type]={panels:net.faces.map(f=>({id:idFor(f.id,r.mirror),pointsMm:f.panel.map(p=>[...p])})),
   cuts:(net.cuts??[]).map(s=>({from:s.a,to:s.b})),folds:net.folds.map(s=>({from:s.a,to:s.b})),
   seals:net.seals.map(s=>({from:s.a,to:s.b,role:s.role,status:'unverified'})),inlet:net.inlet?{center:net.inlet,radius:1.5,status:'unverified'}:null,
   boundsMm:{...net.bounds},overlaps:net.collisions.map(pair=>pair.map(id=>idFor(id,r.mirror))),components:net.cuttingComponents};
  if(r.mirror){
   const t=result[type],reflect=p=>[-p[0],p[1]];
   t.panels.forEach(p=>{p.pointsMm=p.pointsMm.map(reflect);});
   for(const segment of [...t.cuts,...t.folds,...t.seals]){segment.from=reflect(segment.from);segment.to=reflect(segment.to);}
   if(t.inlet)t.inlet.center=reflect(t.inlet.center);
   t.boundsMm={...t.boundsMm,minX:-net.bounds.maxX,maxX:-net.bounds.minX};
  }
 }
 return result;
});}
export function referencePoses(spec,{mode='actuation',samples=21}={}){
 sampleCount(samples,'/options/samples');
 return Array.from({length:samples},(_,i)=>evaluatePose(spec,{mode,progress:i/(samples-1)}));
}
export function analyzeDesign(spec){return geometryError(()=>{
 const r=resolve(spec),profile=mobilityProfile(r.parameters);
 return {schema:'origami-box/analysis/1',mobility:profile,
  path:[0,.25,.5,.75,1].map(p=>postureAt(r.parameters,p,r.mirror)),
  observations:[...(r.parameters.kind==='combined'&&Math.abs(r.spec.footprint.rearWidthRatio-r.spec.rise.rearRatio)<1e-9?[{code:'COINCIDENT_APEX_SUBFAMILY',message:'Matching width and rise ratios make the two side apexes coincide; this is a spherical 6R special case.'}]:[]),...(profile.genericSampledDof>1?[{code:'MULTIPLE_KINEMATIC_FREEDOMS',message:'This ideal linkage admits more instantaneous motions than the displayed path.'}]:[]),
  ...(profile.weakConstraintRatio<1e-3?[{code:'NEAR_SINGULAR_CONSTRAINTS',message:'Small geometric changes or compliance may matter; this conditioning measure is not a stiffness prediction.'}]:[])]};
});}
export function inversePosture(spec,target){return geometryError(()=>{const r=resolve(spec);return solvePosture(r.parameters,r.mirror,target);});}
export function synthesizeGoal(spec,goal){return geometryError(()=>{
 const r=resolve(spec),next=synthesizeLongitudinalGoal(r.spec,goal),design=buildDesign(next);
 return {design,achieved:postureAt(resolve(next).parameters,1),interpretation:'Geometric inverse design; manufacturing and load behavior still require validation.'};
});}
export function exploreOrientation(spec,state){return geometryError(()=>{
 const r=resolve(spec);
 if(!state||typeof state!=='object'||Object.keys(state).some(k=>!['progress','yawDeg'].includes(k)))throw new DesignError('INVALID_STATE','/state','Supply progress and yawDeg.');
 return sphericalPose(r.parameters,state.progress,state.yawDeg);
});}
