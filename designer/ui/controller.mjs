// Client orchestration/cache. Any API transport with call(method,payload) can be injected.
import {call} from '../api/client.mjs';
import {papers,renderTemplate} from '../adapters/svg.mjs';
import {frameFromPoints} from './camera.mjs';
export function createController(invoke=call){
 let designKey='',design=null,validation=null,templateKey='',templates=null,poseKey='',lastPose=null;
 const frames=new Map();
 return {
  describe:()=>invoke('describe'),
  import(value){if(value.schema==='origami-box/artifact/1')return invoke('artifact.open',{artifact:value}).spec;return value.schema==='origami-reference/0.2'?invoke('legacy.migrate',{record:value}).spec:invoke('design.build',{spec:value}).spec;},
  build(spec,paper){
   if(!papers[paper])throw Error('Unsupported paper size.');
   const key=JSON.stringify(spec);
   if(key!==designKey){
    // Do not commit the new cache until every calculation succeeds.
    const nextDesign=invoke('design.build',{spec}),nextValidation=invoke('design.validate',{spec});
    design=nextDesign;validation=nextValidation;designKey=key;templateKey='';frames.clear();
   }
   const nextTemplateKey=key+paper;
   if(nextTemplateKey!==templateKey){const [w,h]=papers[paper];templates=invoke('design.templates',{spec,options:{stockSizeMm:[w-16,h-24]}});templateKey=nextTemplateKey;}
   const sheets=Object.fromEntries(['folding','cutting'].map(type=>[type,renderTemplate(templates[type],{type,paper})]));
   const a=validation.actuation,b=validation.assembly;
   const exportable=Object.values(sheets).every(s=>s.fit)&&!templates.folding.overlaps.length&&!templates.cutting.overlaps.length&&a.numericalPass&&b.sampledPass&&a.minimumSampledSafeOpening!==null;
   return {design,validation,templates,sheets,exportable};
  },
  pose(spec,state){const key=JSON.stringify({spec,state});if(key!==poseKey){lastPose=invoke('design.pose',{spec,state});poseKey=key;}return lastPose;},
  frame(spec,mode){const key=JSON.stringify(spec)+mode;if(!frames.has(key)){const poses=invoke('design.referencePoses',{spec,options:{mode}});frames.set(key,frameFromPoints(poses.flatMap(p=>p.meshes?.flatMap(m=>m.verticesMm)??p.panels.flatMap(f=>f.pointsMm))));}return frames.get(key);}
 };
}
