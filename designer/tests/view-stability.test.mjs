import test from 'node:test';
import assert from 'node:assert/strict';
import {createLabelLayout,createFrameScheduler} from '../ui/label-layout.mjs';
import {createDragSession} from '../ui/drag-session.mjs';
import {fromSpec} from '../intent/model.mjs';
import {defaultSpec} from '../kernel/spec.mjs';
import {call} from '../api/client.mjs';
import {createController} from '../ui/controller.mjs';
const box=()=>{const s=defaultSpec();s.footprint.frontWidth=60;s.rise.front=32;return call('intent.fromSpec',{spec:s});};

test('camera motion does not switch label offsets when other labels cross them',()=>{
 const layout=createLabelLayout(),occupied=[],first=layout.place('front',[100,100],50,occupied);
 const offset=[first.x-100,first.y-100];
 for(let k=0;k<=720;k++){
  const t=k*Math.PI/180,anchor=[200+70*Math.cos(t),140+40*Math.sin(t)],obstacles=[{x:anchor[0]-70,y:anchor[1]-60,width:150,height:130}];
  const b=layout.place('front',anchor,50,obstacles);
  assert.ok(Math.abs(b.x-anchor[0]-offset[0])<1e-10);assert.ok(Math.abs(b.y-anchor[1]-offset[1])<1e-10);
 }
});

test('many pointer updates are rendered once per animation frame using current view state',()=>{
 const frames=[],drawn=[];let angle=0;
 const schedule=createFrameScheduler(()=>drawn.push(angle),callback=>frames.push(callback));
 for(let k=0;k<200;k++){angle=k;schedule();}
 assert.equal(frames.length,1);frames.shift()();assert.deepEqual(drawn,[199]);
 angle=201;schedule();frames.shift()();assert.deepEqual(drawn,[199,201]);
});

test('a failed resize draft cannot prevent a subsequent valid widening of the visible model',()=>{
 const displayed=box(),bad=call('intent.command',{intent:displayed.intent,command:{type:'direct-dimension',field:'frontWidth',value:12.66}});
 assert.equal(bad.status,'conflict');
 const action={type:'direct-dimension',field:'rearWidth',value:80};
 assert.equal(call('intent.command',{intent:bad.intent,command:action}).status,'conflict');
 const gesture=createDragSession(displayed.intent),recovered=call('intent.command',gesture.request(action));
 assert.equal(recovered.status,'resolved');assert.equal(recovered.values.frontWidth,60);assert.equal(recovered.values.rearWidth,80);
 assert.equal(displayed.values.frontWidth,60);
});

test('every drag sample starts from the same visible constraints, including after rejected samples',()=>{
 const displayed=box(),session=createDragSession(displayed.intent);
 for(const value of [60,45,20,10,80,100,150,250,500]){
  const r=call('intent.command',session.request({type:'direct-dimension',field:'frontWidth',value}));
  assert.equal(r.status,value<32?'conflict':'resolved');
  if(r.status==='resolved'){assert.equal(r.values.frontWidth,value);assert.equal(r.values.rearWidth,value);}
 }
});

test('a large rectangular actuator remains geometrically valid when its stencil exceeds A4',()=>{
 const s=defaultSpec();s.footprint.frontWidth=250;s.rise.front=32;
 const b=createController().build(s,'A4');
 assert.equal(b.validation.actuation.numericalPass,true);assert.equal(b.validation.assembly.sampledPass,true);
 assert.equal(Object.values(b.sheets).every(s=>s.fit),false);assert.equal(b.exportable,false);
});
