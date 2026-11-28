import assert from 'node:assert/strict';
import {defaultView,zoomAt,viewPoint,bindViewControls,orbitAngles} from './view-controls.mjs';
assert.deepEqual(orbitAngles(0,28,20,0),{azimuth:-20,elevation:28});
assert.deepEqual(orbitAngles(0,28,0,-90),{azimuth:0,elevation:-62});
assert.deepEqual(orbitAngles(170,170,-30,30),{azimuth:-160,elevation:-160});
const v={zoom:1.7,panX:40,panY:-25},p=[123,210,9],q=viewPoint(p,v),next=zoomAt(v,2,q[0],q[1]);
assert.deepEqual(viewPoint(p,next),q); // Cursor anchor stays fixed.
assert.equal(next.zoom,3.4);assert.equal(v.zoom,1.7);
assert.equal(zoomAt(v,100,0,0).zoom,6);assert.equal(zoomAt(v,.0001,0,0).zoom,.25);
assert.deepEqual(viewPoint(p,defaultView()),p);
assert.equal(viewPoint(p,next)[2],9);
console.log('PASS: cursor-anchored zoom, zoom bounds, immutable view state, identity reset and unchanged depth.');
// Exercise the actual gesture handlers with an identity SVG screen transform.
globalThis.DOMPoint=class {constructor(x,y){this.x=x;this.y=y;}matrixTransform(){return this;}};
const handlers={},capture=new Set(),calls=[];
const el={addEventListener:(n,f)=>handlers[n]=f,querySelector:()=>({getScreenCTM:()=>({inverse:()=>({})})}),setPointerCapture:id=>capture.add(id),hasPointerCapture:id=>capture.has(id),releasePointerCapture:id=>capture.delete(id),classList:{add(){},remove(){}},focus(){}};
bindViewControls(el,{pan:(...p)=>calls.push(['pan',...p]),rotate:(...p)=>calls.push(['rotate',...p]),zoom:(...p)=>calls.push(['zoom',...p]),reset:()=>calls.push(['reset'])});
const event=(id,x,y,button=0,type='mouse')=>({pointerId:id,clientX:x,clientY:y,button,pointerType:type,preventDefault(){}});
handlers.pointerdown(event(1,10,10));handlers.pointermove(event(1,30,20));assert.deepEqual(calls.pop(),['pan',20,10]);handlers.pointerup(event(1,30,20));
handlers.pointerdown(event(2,10,10,2));handlers.pointermove(event(2,30,20,2));assert.deepEqual(calls.pop(),['rotate',9,3.5]);handlers.pointerup(event(2,30,20,2));
handlers.pointerdown(event(3,0,0,0,'touch'));handlers.pointermove(event(3,10,0,0,'touch'));assert.deepEqual(calls.pop(),['rotate',4.5,0]);
handlers.pointerdown(event(4,110,0,0,'touch'));assert.equal(calls.length,0);
handlers.pointermove(event(4,130,0,0,'touch'));assert.deepEqual(calls.splice(0),[['pan',10,0],['zoom',1.2,70,0]]);
handlers.pointerup(event(4,130,0,0,'touch'));handlers.pointermove(event(3,10,0,0,'touch'));assert.deepEqual(calls.pop(),['rotate',0,0]);
handlers.pointercancel(event(3,10,0,0,'touch'));handlers.pointermove(event(3,80,0,0,'touch'));assert.equal(calls.length,0);assert.equal(capture.size,0);
console.log('PASS: left-drag pan, right-drag rotation, one-touch rotation, two-touch pan/pinch, pointer transitions and cancellation. Physical touchscreen not exercised.');
