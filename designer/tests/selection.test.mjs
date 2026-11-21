import test from 'node:test';
import assert from 'node:assert/strict';
import {newIntent,applyCommand} from '../intent/model.mjs';
import {resolveIntent} from '../constraints/resolve.mjs';
import {resolveSpec} from '../kernel/spec.mjs';
import {pose,distance} from '../kernel/geometry.mjs';
import {editorHandles} from '../kernel/editor-domain.mjs';
import {call} from '../api/client.mjs';
import {evaluatePose} from '../kernel/index.mjs';
import {selectionTarget} from '../ui/selection.mjs';
import {sceneSVG} from '../ui/render.mjs';
const solved=i=>{const r=resolveIntent(i,{ranges:false});assert.equal(r.status,'resolved',r.conflicts?.[0]?.message);return r;};
const compound=()=>['outline','longitudinal','lateral'].reduce((i,feature)=>applyCommand(i,{type:'set-feature',feature}),newIntent());

test('all four rise handles sit exactly at their named top-edge centres throughout motion',()=>{
 for(const intent of [newIntent(),compound(),applyCommand(newIntent(),{type:'toggle-wall',side:'left'}),applyCommand(newIntent(),{type:'toggle-wall',side:'right'})]){
  const r=solved(intent),resolved=resolveSpec(r.spec);
  for(const progress of [0,.3,1]){
   const geometry=editorHandles(r.spec,{mode:'actuation',progress}),poly=evaluatePose(r.spec,{mode:'actuation',progress}).panels.find(p=>p.id==='top').pointsMm;
   for(const edge of ['front','rear','left','right']){
    const h=geometry.handles.find(h=>h.id===edge+'Rise');
    assert.ok(poly.some((p,i)=>distance(h.pointMm,p.map((x,k)=>(x+poly[(i+1)%poly.length][k])/2))<1e-9));
    assert.equal(h.value,h.pointMm[2]);assert.equal(h.fixed,['left','right'].includes(edge)&&!r.walls[edge]);
   }
   assert.deepEqual(geometry.edges.map(e=>e.id),['front','rear','left','right']);
  }
 }
});

test('block target selection highlights the right plate and edges, including mirrored fixed connections',()=>{
 const r=solved(compound()),g=editorHandles(r.spec);
 assert.deepEqual(selectionTarget(g,{feature:'outline'}).panelIds,['top','bottom']);
 assert.deepEqual(selectionTarget(g,{feature:'longitudinal'}).edgeIds,['front','rear']);
 assert.deepEqual(selectionTarget(g,{feature:'lateral'}).handleIds,['leftRise','rightRise']);
 for(const side of ['left','right']){
  const i=solved(applyCommand(newIntent(),{type:'toggle-wall',side})),a=selectionTarget(editorHandles(i.spec),{feature:'connection',side});
  assert.deepEqual(a.edgeIds,[side]);assert.ok(a.panelIds.includes((side==='left'?'right':'left')+'-lower'));
 }
 const out=sceneSVG({contacts:[],panels:[{id:'top',pointsMm:[[0,0,0],[1,0,0],[0,1,0]]},{id:'bottom',pointsMm:[[0,0,1],[1,0,1],[0,1,1]]}]},{project:p=>p},{panX:0,panY:0,zoom:1},selectionTarget(g,{feature:'longitudinal'}));
 assert.equal((out.match(/data-highlighted="true"/g)??[]).length,1);
});

test('edge midpoint drag goals resolve to their actual heights under coupled relations',()=>{
 const original=solved(compound()),angle=call('intent.command',{intent:original.intent,command:{type:'switch-feature-mode',feature:'longitudinal',mode:'angle'}}).intent;
 const lateral=original.intent.blocks.find(b=>b.op==='side-rise-ratio'),pinned=applyCommand(original.intent,{type:'toggle-block-lock',id:lateral.id});
 for(const input of [newIntent(),compound(),angle,pinned])for(const edge of ['front','rear','left','right']){
  const r=solved(input),value=r.measurements[edge+'MidRise']+2;
  const next=call('intent.command',{intent:r.intent,command:{type:'edge-rise',edge,value}});
  assert.equal(next.status,'resolved',next.conflicts?.[0]?.message);assert.ok(Math.abs(next.measurements[edge+'MidRise']-value)<1e-6);
  const h=call('design.handles',{spec:next.spec,state:{mode:'actuation',progress:1}}).handles.find(h=>h.id===edge+'Rise');assert.ok(Math.abs(h.pointMm[2]-value)<1e-6);
 }
});

test('fixed edges remain fixed and conflicting dimension locks report the source',()=>{
 for(const side of ['left','right']){
  const r=solved(applyCommand(newIntent(),{type:'toggle-wall',side}));
  const blocked=call('intent.command',{intent:r.intent,command:{type:'edge-rise',edge:side,value:10}});assert.equal(blocked.status,'conflict');assert.equal(blocked.conflicts[0].code,'FIXED_EDGE_RISE');
  const free=side==='left'?'right':'left',next=call('intent.command',{intent:r.intent,command:{type:'edge-rise',edge:free,value:30}});assert.equal(next.status,'resolved');assert.ok(Math.abs(next.measurements[free+'MidRise']-30)<1e-6);
 }
 const r=solved(applyCommand(newIntent(),{type:'add-block',op:'lock',field:'frontRise'})),next=call('intent.command',{intent:r.intent,command:{type:'edge-rise',edge:'front',value:40}});
 assert.equal(next.status,'conflict');assert.ok(next.conflicts[0].blockIds.includes(r.intent.blocks.find(b=>b.op==='lock').id));
});
