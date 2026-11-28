import test from 'node:test';
import assert from 'node:assert/strict';
import {newIntent,applyCommand as edit} from '../intent/model.mjs';
import {resolveIntent} from '../constraints/resolve.mjs';
import {editorHandles} from '../kernel/editor-domain.mjs';
import {modelPick} from '../ui/selection.mjs';
const solve=i=>{const r=resolveIntent(i,{ranges:false});assert.equal(r.status,'resolved',r.conflicts?.[0]?.message);return r;};
const feature=(i,f,v,mode)=>edit(i,{type:'set-feature',feature:f,value:v,mode});
const remove=(r,f)=>edit(r.intent,{type:'remove-block',id:r.intent.blocks.find(b=>({outline:['width-ratio','equal-width'],longitudinal:['rise-ratio','tilt','equal-rise'],lateral:['side-rise-ratio'],connection:['wall-off']}[f].includes(b.op))&&b.strength==='required').id});

test('face and edge picking map back to their semantic features without changing design intent',()=>{
 const i=newIntent(),original=structuredClone(i),g=editorHandles(solve(i).spec);
 assert.deepEqual(modelPick(g,{panelId:'top'}),{feature:'outline'});
 assert.equal(modelPick(g,{panelId:'left-upper'}).feature,'lateral');
 for(const edge of ['front','rear'])assert.equal(modelPick(g,{edge}).feature,'longitudinal');
 for(const edge of ['left','right'])assert.equal(modelPick(g,{edge}).feature,'lateral');
 assert.equal(modelPick(g,{panelId:'top'},{feature:'longitudinal'}).feature,'outline');
 assert.deepEqual(i,original);
 for(const side of ['left','right']){const g=editorHandles(solve(edit(i,{type:'toggle-wall',side})).spec);assert.equal(modelPick(g,{edge:side}).feature,'connection');assert.equal(modelPick(g,{panelId:(side==='left'?'right':'left')+'-lower'}).side,side);}
});

test('removing either angle or height-ratio tilt restores zero longitudinal tilt',()=>{
 for(const [mode,value] of [['angle',-10],['ratio',.75]]){
  const r=solve(feature(newIntent(),'longitudinal',value,mode)),next=solve(remove(r,'longitudinal'));
  assert.ok(Math.abs(next.measurements.longitudinalAngleDeg)<1e-8);assert.equal(next.values.frontRise,r.values.frontRise);assert.equal(next.values.rearRise,next.values.frontRise);
 }
});

test('removal clears only its own shape effect, including compound lateral/trapezoid geometry',()=>{
 const r=solve(feature(feature(feature(newIntent(),'outline',.8),'lateral',.75),'longitudinal',.7));
 const level=solve(remove(r,'longitudinal'));assert.ok(Math.abs(level.measurements.longitudinalAngleDeg)<1e-8);assert.equal(level.values.sideRiseRatio,.75);assert.equal(level.spec.footprint.rearWidthRatio,.8);
 assert.ok(!level.description.clauses.some(c=>c.feature==='longitudinal'));
 const rectangle=solve(remove(r,'outline'));assert.equal(rectangle.spec.footprint.rearWidthRatio,1);assert.equal(rectangle.spec.rise.rearRatio,.7);assert.equal(rectangle.values.sideRiseRatio,.75);
 const lateral=solve(remove(r,'lateral'));assert.equal(lateral.values.sideRiseRatio,1);assert.equal(lateral.spec.rise.rearRatio,.7);assert.equal(lateral.spec.footprint.rearWidthRatio,.8);
});

test('old default equality does not leave a residual compound tilt after removing an angle block',()=>{
 let i=feature(feature(newIntent(),'outline',.8),'lateral',.75);i=edit(i,{type:'add-block',op:'tilt',value:-5});
 const r=solve(i),next=solve(remove(r,'longitudinal'));assert.ok(Math.abs(next.measurements.longitudinalAngleDeg)<1e-8);
});

test('restoring a folding wall returns a shape with no explicit height rule to parallel lift',()=>{
 let i=newIntent();i.blocks=[];i=feature(i,'outline',.8);i=edit(i,{type:'toggle-wall',side:'left'});
 const r=solve(i);assert.notEqual(r.values.rearRise,r.values.frontRise);
 for(const next of [remove(r,'connection'),edit(r.intent,{type:'toggle-wall',side:'left'})]){const a=solve(next);assert.equal(a.spec.walls.left,true);assert.ok(Math.abs(a.measurements.longitudinalAngleDeg)<1e-8);}
});

test('fixed values prevent a reset with a source conflict, while new explicit conditions can replace neutral defaults',()=>{
 let r=solve(feature(newIntent(),'outline',.8)),i=edit(edit(r.intent,{type:'add-block',op:'lock',field:'frontWidth'}),{type:'add-block',op:'lock',field:'rearWidth'});
 r=solve(i);const rejected=resolveIntent(remove(r,'outline'),{ranges:false});assert.equal(rejected.status,'conflict');assert.equal(rejected.conflicts[0].code,'RESET_CONFLICT');assert.equal(rejected.conflicts[0].blockIds.length,3);
 r=solve(feature(newIntent(),'longitudinal',.7));r=solve(remove(r,'longitudinal'));r=solve(feature(r.intent,'longitudinal',.8));assert.equal(r.spec.rise.rearRatio,.8);
});
