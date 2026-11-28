import assert from 'node:assert/strict';
import {assembly,auditAssembly,constraint} from './kresling-assembly.mjs';
for(const n of [4,6,8])for(const twist of [15,30,45]){
 const a=auditAssembly({n,twist},51);
 assert(a.maxRigidErrorMm<1e-9);assert(a.finalSeamErrorMm<1e-9);assert(a.maxTargetPairDistanceErrorMm<1e-9);
}
const a=auditAssembly();assert.equal(a.zeroThicknessCrossings.length,0);assert.equal(a.finiteThicknessCollisions.length,0);assert(assembly({},0).seamError>100);
const c=constraint();assert.equal(c.exactPoses.length,1);assert(Math.abs(c.exactPoses[0].height-40)<1e-10);assert(c.bestSampledForcedHeight.maxEdgeMismatchMm>10);
console.log('PASS: 9 assembly reference configurations, 1001-pose default rigid/collision audit, fixed-radius closed-chain obstruction. Film and seals excluded.');
