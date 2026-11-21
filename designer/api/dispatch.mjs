// Versioned transport-independent application API. Both browser and CLI call this.
import {buildDesign,evaluatePose,validateDesign,templateGeometry,referencePoses,defaultSpec,legacyToSpec,analyzeDesign,inversePosture,synthesizeGoal,exploreOrientation} from '../kernel/index.mjs';
import {DesignError} from '../kernel/spec.mjs';
import {ENGINE_VERSION} from '../kernel/version.mjs';
import {API_VERSION} from './protocol.mjs';
import {newIntent,applyCommand,fromSpec,blockCatalog,featureCatalog,fields as intentFields} from '../intent/model.mjs';
import {interpretText} from '../intent/text.mjs';
import {resolveIntent} from '../constraints/resolve.mjs';
import {editorHandles} from '../kernel/editor-domain.mjs';
import {resolveEdgeEdit} from '../constraints/edge-edit.mjs';
export {API_VERSION} from './protocol.mjs';
const METHODS={
 'intent.describe':{required:[],optional:[]},
 'intent.resolve':{required:['intent'],optional:[]},
 'intent.command':{required:['intent','command'],optional:[]},
 'intent.interpret':{required:['intent','text'],optional:[]},
 'intent.fromSpec':{required:['spec'],optional:[]},
 'intent.export':{required:['intent'],optional:[]},
 'intent.open':{required:['project'],optional:[]},
 'design.handles':{required:['spec'],optional:['state']},
 'describe':{required:[],optional:[]},
 'design.build':{required:['spec'],optional:[]},
 'design.pose':{required:['spec','state'],optional:[]},
 'design.validate':{required:['spec'],optional:['options']},
 'design.templates':{required:['spec'],optional:['options']},
 'design.referencePoses':{required:['spec'],optional:['options']},
 'design.edit':{required:['spec','changes'],optional:['fixedPaths']},
 'design.analyze':{required:['spec'],optional:[]},
 'design.solvePosture':{required:['spec','target'],optional:[]},
 'design.synthesize':{required:['spec','goal'],optional:[]},
 'research.orientation':{required:['spec','state'],optional:[]},
 'artifact.export':{required:['spec'],optional:[]},
 'artifact.open':{required:['artifact'],optional:[]},
 'legacy.migrate':{required:['record'],optional:[]}
};
function finiteOutput(value){
 if(typeof value==='number'&&!Number.isFinite(value))throw new DesignError('NUMERICAL_FAILURE','','The requested dimensions produced a non-finite result.');
 if(value&&typeof value==='object')for(const child of Object.values(value))finiteOutput(child);
}
function canonical(value){if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));return value;}
function shape(value,required,optional,path){
 if(!value||typeof value!=='object'||Array.isArray(value))throw new DesignError('INVALID_REQUEST',path,'Expected an object.');
 for(const key of required)if(!Object.hasOwn(value,key))throw new DesignError('MISSING_FIELD',`${path}/${key}`,'Required field is missing.');
 for(const key of Object.keys(value))if(!required.includes(key)&&!optional.includes(key))throw new DesignError('UNKNOWN_FIELD',`${path}/${key}`,'Unknown field.');
}
const editable=new Set(['/footprint/length','/footprint/frontWidth','/footprint/rearWidthRatio','/rise/front','/rise/rearRatio','/rise/rightToLeftRatio','/walls/left','/walls/right','/fabrication/hingeGap','/fabrication/panelThickness','/fabrication/endAllowance']);
function edit({spec,changes,fixedPaths=[]}){
 buildDesign(spec);
 if(!Array.isArray(changes)||!changes.length||!Array.isArray(fixedPaths)||fixedPaths.some(path=>!editable.has(path)))throw new DesignError('INVALID_EDIT','/payload','Supply changes and valid fixedPaths.');
 const next=JSON.parse(JSON.stringify(spec)),seen=new Set();
 for(const change of changes){
  shape(change,['path','value'],[],'/payload/changes');const {path,value}=change;
  if(!editable.has(path)||seen.has(path))throw new DesignError('INVALID_EDIT',path,'Unknown or repeated edit path.');seen.add(path);
  const [,group,key]=path.split('/');
  if(fixedPaths.includes(path)&&value!==next[group][key])throw new DesignError('LOCK_CONFLICT',path,'The requested edit changes a fixed value.');
  next[group][key]=value;
 }
 return buildDesign(next); // Atomic: failures never mutate the input or adjust another value.
}
function migrate(record){
 shape(record,['schema','parameters'],['dimensionBasis','status','geometry','fabrication','validation','attribution','notes','designRules','futureExtensions','certificate','assemblyCertificate'],'/payload/record');
 if(record.schema!=='origami-reference/0.2')throw new DesignError('UNSUPPORTED_VERSION','/payload/record/schema','Only hinge-axis schema 0.2 can be migrated. Original cutting-size records require a separate conversion.');
 const p=record.parameters;
 shape(p,['kind','length','width0','width1','l0','l1','gap','clearance','thickness'],['paper','opening'],'/payload/record/parameters');
 if(!['rectangle','taper','wedge','hinge'].includes(p.kind))throw new DesignError('INVALID_INPUT','/payload/record/parameters/kind','Unknown legacy family.');
 for(const key of ['length','width0','width1','l0','l1','gap','clearance','thickness'])if(typeof p[key]!=='number'||!Number.isFinite(p[key]))throw new DesignError('INVALID_NUMBER',`/payload/record/parameters/${key}`,'Expected a finite number.');
 if(p.l0<=0||p.l1<0||p.width0<=0)throw new DesignError('INVALID_NUMBER','/payload/record/parameters','Invalid legacy dimensions.');
 const spec=legacyToSpec(p);buildDesign(spec);return {spec,warnings:[{code:'VIEW_STATE_REMOVED',message:'Paper selection and opening belong to the client, not the design specification.'}]};
}
export function handleRequest(request){
 let id=null;
 try{
  shape(request,['apiVersion','method','payload'],['id'],'');
  if(request.id!==undefined&&(typeof request.id!=='string'&&!(Number.isSafeInteger(request.id))))throw new DesignError('INVALID_REQUEST','/id','Request ID must be a string or safe integer.');id=request.id??null;
  if(request.apiVersion!==API_VERSION)throw new DesignError('UNSUPPORTED_VERSION','/apiVersion','Unsupported API version.',{supported:API_VERSION});
  if(typeof request.method!=='string'||!Object.hasOwn(METHODS,request.method))throw new DesignError('UNKNOWN_METHOD','/method','Unknown API method.');
  const {required,optional}=METHODS[request.method],p=request.payload;shape(p,required,optional,'/payload');
  if(p.options!==undefined)shape(p.options,[],request.method==='design.validate'?['samples','assemblySamples']:request.method==='design.templates'?['stockSizeMm']:['mode','samples'],'/payload/options');
  let value;
  switch(request.method){
   case 'intent.describe':value={schema:'origami-box/editor/1',initialIntent:newIntent(),blocks:blockCatalog,features:featureCatalog,fields:intentFields,textSyntax:'Controlled English; semicolon-separated clauses. Unknown clauses are rejected.'};break;
   case 'intent.resolve':value=resolveIntent(p.intent);break;
   case 'intent.command':{
    if(p.command?.type==='edge-rise'){try{value=resolveEdgeEdit(p.intent,p.command);}catch(e){throw new DesignError('INVALID_INTENT','/payload/command',e.message);}break;}
    let intent;try{
     let command=p.command;
     if(command?.type==='switch-feature-mode'){
      if(command.feature!=='longitudinal'||!['angle','ratio'].includes(command.mode))throw Error('Unknown description input mode.');
      const current=resolveIntent(p.intent,{ranges:false});if(current.status!=='resolved'){value=current;break;}
      command={type:'set-feature',feature:'longitudinal',mode:command.mode,value:command.mode==='angle'?current.measurements.longitudinalAngleDeg:current.values.rearRise/current.values.frontRise,source:command.source};
     }
     intent=applyCommand(p.intent,command);
    }catch(e){throw new DesignError('INVALID_INTENT','/payload',e.message);}
    value=resolveIntent(intent);break;
   }
   case 'intent.interpret':{
    const result=interpretText(p.intent,p.text);
    value=result.ok?resolveIntent(result.intent):{status:'interpretation-error',conflicts:result.errors};break;
   }
   case 'intent.fromSpec':buildDesign(p.spec);value=resolveIntent(fromSpec(p.spec));break;
   case 'intent.export':{
    const resolved=resolveIntent(p.intent,{ranges:false});if(resolved.status!=='resolved')throw new DesignError('UNRESOLVED_INTENT','/intent','Resolve conflicting conditions before saving.');
    value={schema:'origami-box/project/1',engineVersion:ENGINE_VERSION,intent:resolved.intent,design:buildDesign(resolved.spec)};break;
   }
   case 'intent.open':{
    shape(p.project,['schema','engineVersion','intent','design'],[],'/payload/project');
    if(p.project.schema!=='origami-box/project/1'||p.project.engineVersion!==ENGINE_VERSION)throw new DesignError('UNSUPPORTED_VERSION','/project','This project needs an explicit version migration.');
    value=resolveIntent(p.project.intent);
    if(value.status!=='resolved'||JSON.stringify(canonical(buildDesign(value.spec)))!==JSON.stringify(canonical(p.project.design)))throw new DesignError('PROJECT_MISMATCH','/project','The saved intent does not reproduce the saved geometry.');
    break;
   }
   case 'design.handles':value=editorHandles(p.spec,p.state);break;
   case 'describe':value={apiVersion:API_VERSION,methods:Object.keys(METHODS),defaultSpec:defaultSpec(),unsupported:['independently chosen rear rise in direct-hinge topology','noncongruent plates','outward folding','pressure prediction'],units:'mm'};break;
   case 'design.build':value=buildDesign(p.spec);break;
   case 'design.pose':value=evaluatePose(p.spec,p.state);break;
   case 'design.validate':value=validateDesign(p.spec,p.options);break;
   case 'design.templates':value=templateGeometry(p.spec,p.options);break;
   case 'design.referencePoses':value=referencePoses(p.spec,p.options);break;
   case 'design.edit':value=edit(p);break;
   case 'design.analyze':value=analyzeDesign(p.spec);break;
   case 'design.solvePosture':value=inversePosture(p.spec,p.target);break;
   case 'design.synthesize':value=synthesizeGoal(p.spec,p.goal);break;
   case 'research.orientation':value=exploreOrientation(p.spec,p.state);break;
   case 'artifact.export':value={schema:'origami-box/artifact/1',engineVersion:ENGINE_VERSION,design:buildDesign(p.spec)};break;
   case 'artifact.open':{
    shape(p.artifact,['schema','engineVersion','design'],[],'/payload/artifact');
    if(p.artifact.schema!=='origami-box/artifact/1')throw new DesignError('UNSUPPORTED_VERSION','/payload/artifact/schema','Unsupported artifact format.');
    if(p.artifact.engineVersion!==ENGINE_VERSION)throw new DesignError('ENGINE_VERSION_MISMATCH','/payload/artifact/engineVersion','This artifact was generated by another algorithm version. A reviewed migration is required to reproduce or recompute it.',{saved:p.artifact.engineVersion,current:ENGINE_VERSION});
    const rebuilt=buildDesign(p.artifact.design?.spec);
    if(JSON.stringify(canonical(rebuilt))!==JSON.stringify(canonical(p.artifact.design)))throw new DesignError('ARTIFACT_MISMATCH','/payload/artifact/design','Saved geometry differs from the reproducible design.');
    value={spec:rebuilt.spec,engineVersion:ENGINE_VERSION,reproduced:true};break;
   }
   case 'legacy.migrate':value=migrate(p.record);break;
  }
  finiteOutput(value);
  return {apiVersion:API_VERSION,id,ok:true,value};
 }catch(error){return {apiVersion:API_VERSION,id,ok:false,errors:[error instanceof DesignError?{code:error.code,path:error.path,message:error.message,details:error.details}:{code:'INTERNAL_ERROR',path:'',message:'Unexpected internal failure.'}]};}
}
