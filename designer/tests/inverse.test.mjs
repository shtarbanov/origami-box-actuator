import test from 'node:test';
import assert from 'node:assert/strict';
import {call} from '../api/client.mjs';
test('inverse pose recovers generated states on all supported families and mirrored hinge',()=>{
 const base=call('describe').defaultSpec;
 const cases=[base,{...base,footprint:{length:75,frontWidth:80,rearWidthRatio:.8}},
 {...base,footprint:{length:75,frontWidth:80,rearWidthRatio:.8},rise:{front:40,rearRatio:.4}},
 {...base,rise:{front:30,rearRatio:1},walls:{left:false,right:true}},
 {...base,rise:{front:30,rearRatio:1},walls:{left:true,right:false}}];
 for(const spec of cases)for(const progress of [.01,.2,.6,.99]){
  const poses=call('design.analyze',{spec});assert.ok(poses.mobility.genericSampledDof>=1);
  // front rise is monotonic for every supported construction.
  const target=spec.rise.front*progress;
  const r=call('design.solvePosture',{spec,target:{frontMaxRiseMm:target}});
  assert.ok(Math.abs(r.posture.frontMaxRiseMm-target)<1e-8);
  assert.ok(r.state.progress>=0&&r.state.progress<=1);
 }
});
test('inverse design meets positive and negative tilt with combined trapezoids',()=>{
 const base=call('describe').defaultSpec;base.footprint={length:75,frontWidth:100,rearWidthRatio:.8};
 for(const angle of [-20,-5,0,10,20]){
  const r=call('design.synthesize',{spec:base,goal:{frontRiseMm:35,longitudinalTiltDeg:angle}});
  assert.ok(Math.abs(r.achieved.longitudinalTiltDeg-angle)<1e-8);
  assert.ok(Math.abs(r.achieved.frontMaxRiseMm-35)<1e-8);
  const validation=call('design.validate',{spec:r.design.spec,options:{samples:51,assemblySamples:31}});
  assert.ok(validation.actuation.numericalPass);
 }
});
test('inverse requests distinguish ambiguity, unreachable posture and ground crossing',()=>{
 const spec=call('describe').defaultSpec;
 assert.throws(()=>call('design.solvePosture',{spec,target:{longitudinalTiltDeg:0}}),e=>e.issues[0].code==='NON_UNIQUE_TARGET');
 assert.throws(()=>call('design.solvePosture',{spec,target:{frontMaxRiseMm:100}}),e=>e.issues[0].code==='UNREACHABLE_TARGET');
 assert.throws(()=>call('design.synthesize',{spec,goal:{frontRiseMm:10,longitudinalTiltDeg:-30}}),e=>e.issues[0].code==='GROUND_CROSSING');
});
