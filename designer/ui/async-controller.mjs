import {papers,renderTemplate} from '../adapters/svg.mjs';
import {frameFromPoints} from './camera.mjs';
// Each promise cache is keyed by immutable request content. Old requests cannot
// overwrite newer requests' cache slots; the view also gates by revision.
export function createAsyncController(invoke){
 const structuralCache=new Map(),poseCache=new Map();
 const memo=(method,payload)=>{
  const cache=method==='design.pose'?poseCache:structuralCache;
  const snapshot=structuredClone(payload),key=JSON.stringify([method,snapshot]);
  if(!cache.has(key)){
   const promise=Promise.resolve().then(()=>invoke(method,snapshot));cache.set(key,promise);
   promise.catch(()=>{if(cache.get(key)===promise)cache.delete(key);});
   if(cache.size>(method==='design.pose'?4:32))cache.delete(cache.keys().next().value);
  }return cache.get(key);
 };
 return {
  describe:()=>memo('describe',{}),
  async import(value){if(value.schema==='origami-box/artifact/1')return (await invoke('artifact.open',{artifact:value})).spec;return value.schema==='origami-reference/0.2'?(await invoke('legacy.migrate',{record:value})).spec:(await invoke('design.build',{spec:value})).spec;},
  export:spec=>invoke('artifact.export',{spec}),
  async build(spec,paper){
   if(!papers[paper])throw Error('Unsupported paper size.');const [w,h]=papers[paper];
   const [design,validation,templates,analysis]=await Promise.all([
    memo('design.build',{spec}),memo('design.validate',{spec}),memo('design.templates',{spec,options:{stockSizeMm:[w-16,h-24]}}),memo('design.analyze',{spec})
   ]);
   const sheets=Object.fromEntries(['folding','cutting'].map(type=>[type,renderTemplate(templates[type],{type,paper})]));
   const exportable=Object.values(sheets).every(s=>s.fit)&&!templates.folding.overlaps.length&&!templates.cutting.overlaps.length&&validation.actuation.numericalPass&&validation.assembly.sampledPass&&validation.actuation.minimumSampledSafeOpening!==null;
   return {design,validation,templates,analysis,sheets,exportable};
  },
  pose:(spec,state)=>memo('design.pose',{spec,state}),
  async frame(spec,mode){const poses=await memo('design.referencePoses',{spec,options:{mode}});return frameFromPoints(poses.flatMap(p=>p.panels.flatMap(f=>f.pointsMm)));},
  synthesize:(spec,goal)=>invoke('design.synthesize',{spec,goal}),
  solvePosture:(spec,target)=>invoke('design.solvePosture',{spec,target})
 };
}
