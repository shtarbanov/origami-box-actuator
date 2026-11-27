import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultSpec} from '../kernel/spec.mjs';
import {wallTuckProgram} from '../kernel/wall-tuck-study.mjs';
import {wallTuckThickContext} from '../kernel/wall-tuck-thickness.mjs';
import {endFilmAtlas,endFilmOverlayProblem,endLongSeamCoverage,minimumEndBlankMargin,endFilmAirwayTopology,endFilmInletClearance,endSealLayerRegistry} from '../kernel/end-film.mjs';
import {endFilmPressFrame} from '../kernel/end-film-closure.mjs';
import {validateEndFilm,endFilmLayerAudit,endFilmInletPath,endFilmPlasticPath} from '../kernel/end-film-validation.mjs';
import {compileEndFilmStudy} from '../kernel/end-film-study.mjs';
function context({widthRatio=.8,heightRatio=1,marginMm=25}={}){const s=defaultSpec();s.footprint.frontWidth=80;s.footprint.rearWidthRatio=widthRatio;s.rise.front=30;s.rise.rearRatio=heightRatio;return wallTuckThickContext(wallTuckProgram(s,{marginMm,heatWidthMm:1,samples:51}),{samples:51});}
const c=context();
test('the film atlas preserves material coordinates and cannot hide a disconnected mixed profile',()=>{
 const a=endFilmAtlas(c);assert.ok(a.maxIsometryError<1e-10);assert.ok(a.maxContinuityError<1e-8);
 const bad=endFilmOverlayProblem(context({heightRatio:.6}),{end:'front'});assert.ok(bad.atlasChecks.maxContinuityError>1e-6);assert.throws(()=>endFilmPressFrame(bad,1),/discontinuous/);
 assert.throws(()=>endFilmOverlayProblem(c,{axialGridMm:0}));assert.throws(()=>endFilmOverlayProblem(c,{end:'bad'}));
});
test('both end presses retain roots, prior welds and unchanged finite plastic; film strain is measured',()=>{
 for(const end of ['front','rear']){const p=endFilmOverlayProblem(c,{end}),before=JSON.stringify(p.plasticMeshes),frames=Array.from({length:21},(_,i)=>endFilmPressFrame(p,i/20)),v=validateEndFilm(p,{frames});
  assert.equal(v.allLayerGeometryPass,true);assert.equal(v.allPriorWeldPass,true);assert.equal(JSON.stringify(p.plasticMeshes),before);
  assert.ok(v.frames.every(f=>f.maxRootErrorMm<1e-7&&f.plasticAxialClearanceMm>.59));assert.ok(v.frames.at(-1).bandPlanarityMm<1e-8);
  assert.ok(v.frames.at(-1).maxPrincipalStrain>.003);assert.ok(v.frames.at(-1).maxPrincipalStrain<.005);assert.equal(v.allMetricPass,false);assert.equal(v.materialStrainLimit,null);assert.equal(v.manufacturingReady,false);
  for(const f of frames)assert.equal(endFilmLayerAudit(p,f).pass,true);
 }
});
test('whole-triangle layer certificate rejects a penetrating layer and incompatible projections',()=>{
 const p=endFilmOverlayProblem(c,{end:'front'}),f=endFilmPressFrame(p,.5),bad=structuredClone(f),cell=p.layoutTriangles.find(t=>t.faces.length===4),layers=cell.faces.map(i=>p.triangles[i]);
 layers.sort((a,b)=>a.nodes.reduce((s,i)=>s+f.positionsMm[i][2],0)-b.nodes.reduce((s,i)=>s+f.positionsMm[i][2],0));for(const i of layers.at(-1).nodes)bad.positionsMm[i][2]-=5;assert.equal(endFilmLayerAudit(p,bad).pass,false);
 const moved=structuredClone(f);moved.positionsMm[layers.at(-1).nodes[0]][0]+=.1;assert.equal(endFilmLayerAudit(p,moved).pass,false);
});
test('long weld must continue through both end bands; old short blank fails',()=>{
 assert.equal(endLongSeamCoverage(context({marginMm:8})).covered,false);assert.equal(endLongSeamCoverage(c).covered,true);
 const a=minimumEndBlankMargin(c);assert.ok(a.minimumMarginMm>9.66&&a.minimumMarginMm<9.68);
 for(const end of ['front','rear']){const r=endSealLayerRegistry(c,end);assert.equal(r.registryPass,true);assert.deepEqual(r.counts,[2,4]);}
 assert.ok(endSealLayerRegistry(c,'front').guideExtensionRequired>4);
});
test('the unbonded airway survives intended end seals; an accidental internal cross-weld blocks it',()=>{
 assert.equal(endFilmAirwayTopology(c).connected,true);
 assert.equal(endFilmAirwayTopology(c,{extraBondBands:[{minX:-100,maxX:100,minY:78,maxY:79}]}).connected,false);
 const inlet=endFilmInletClearance(c);assert.equal(inlet.diameterMm,null);assert.equal(inlet.diameterClearOfEndBands,null);assert.equal(inlet.distanceToEndSealMm,9);
 const p=endFilmOverlayProblem(c,{end:'rear'}),path=endFilmInletPath(p,endFilmPressFrame(p,1),inlet.inletReferenceMm);assert.equal(path.positiveGap,true);assert.ok(path.minimumGapMm>.64);
 assert.equal(endFilmPlasticPath(p,path,{bodyTargetMm:[0,37.5,p.sealPlaneZMm]}).clearOfPlastic,true);
 assert.equal(endFilmPlasticPath(p,path,{bodyTargetMm:[0,37.5,.15]}).clearOfPlastic,false);
});
test('the kernel supplies reversible end operations and retains first end closure through second press',()=>{
 const s=compileEndFilmStudy(c,{framesPerPress:3,includePrefolds:false});assert.equal(s.report.geometryPass,true);assert.equal(s.report.manufacturingReady,false);assert.equal(s.stages.length,5);
 assert.match(s.stages[1].title,/front/);assert.match(s.stages[3].title,/rear/);
 const front=p=>p.meshes.filter(m=>m.id.startsWith('front-')),plastic=p=>p.meshes.filter(m=>m.role==='panel');
 assert.deepEqual(front(s.stages[2].frames.at(-1)),front(s.stages[3].frames.at(-1)));
 assert.deepEqual(plastic(s.stages[0].frames[0]),plastic(s.stages[4].frames.at(-1)));
});
