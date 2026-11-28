import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {defaultSpec} from '../kernel/spec.mjs';
import {wallTuckProgram} from '../kernel/wall-tuck-study.mjs';
import {wallTuckThickContext} from '../kernel/wall-tuck-thickness.mjs';
import {compileEndFilmStudy} from '../kernel/end-film-study.mjs';
const destination=resolve(process.argv[2]??'designer/verification/end-film-combined');await mkdir(destination,{recursive:true});const cases=[];
for(const widthRatio of [.65,.8,.95])for(const riseRatio of [.4,.6,.85]){
 const spec=defaultSpec();spec.footprint.frontWidth=80;spec.footprint.rearWidthRatio=widthRatio;spec.rise.front=30;spec.rise.rearRatio=riseRatio;
 try{const c=wallTuckThickContext(wallTuckProgram(spec,{marginMm:25,heatWidthMm:1,samples:51}),{samples:51}),r=compileEndFilmStudy(c,{framesPerPress:21,includePrefolds:false}).report;
  cases.push({widthRatio,riseRatio,pass:r.geometryPass&&r.finitePanelAudit.finitePanelPathPass&&r.coverage.covered&&r.airway.connected&&r.inletPath.positiveGap&&r.plasticAirway.clearOfPlastic,blankPlan:r.blankPlan,maxPrincipalStrain:r.maxPrincipalStrain,inletGapMm:r.inletPath.minimumGapMm,finitePanelPass:r.finitePanelAudit.finitePanelPathPass,minimumPlasticClearanceMm:Math.min(...r.validations.flatMap(v=>v.frames.map(f=>f.plasticAxialClearanceMm)))});
 }catch(error){cases.push({widthRatio,riseRatio,pass:false,reason:error.message});}
}
const report={schema:'origami-box/end-film-grid/1',framesPerEnd:21,pass:cases.every(c=>c.pass),cases,scope:'Sampled rigid-panel and zero-thickness deformable-film geometry, not physical material or pressure verification.'};
await writeFile(join(destination,'parameter-sweep.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:cases.filter(c=>c.pass).length,total:cases.length,failures:cases.filter(c=>!c.pass),operations:cases.map(c=>({widthRatio:c.widthRatio,riseRatio:c.riseRatio,operation:c.blankPlan?.operation}))},null,2));if(!report.pass)process.exitCode=1;
