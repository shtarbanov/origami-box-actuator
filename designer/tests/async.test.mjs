import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorkerClient} from '../api/worker-client.mjs';
import {createAsyncController} from '../ui/async-controller.mjs';
import {call} from '../api/client.mjs';
test('worker replies correlate by ID across out-of-order success and failure',async()=>{
 const handlers={},requests=[];
 const client=createWorkerClient({addEventListener:(n,f)=>handlers[n]=f,postMessage:r=>requests.push(r),terminate(){}});
 const a=client.call('design.build',{a:1}),b=client.call('design.build',{a:2});
 handlers.message({data:{id:requests[1].id,ok:true,value:'second'}});
 handlers.message({data:{id:requests[0].id,ok:true,value:'first'}});
 assert.equal(await a,'first');assert.equal(await b,'second');
 const c=client.call('wrong');handlers.message({data:{id:requests[2].id,ok:false,errors:[{code:'UNKNOWN_METHOD',message:'Unknown'}]}});
 await assert.rejects(c,e=>e.issues[0].code==='UNKNOWN_METHOD');
 const d=client.call('describe');client.close();await assert.rejects(d,/closed/);await assert.rejects(client.call('describe'),/closed/);
});
test('async controller isolates snapshots, shares work, and recovers after rejected requests',async()=>{
 const seen=[];
 const c=createAsyncController(async(method,payload)=>{seen.push([method,structuredClone(payload)]);return call(method,payload);});
 const spec=call('describe').defaultSpec;
 const pending=c.build(spec,'A4');spec.footprint.length=90;
 const first=await pending;assert.equal(first.design.spec.footprint.length,75);
 const second=await c.build(spec,'A4');assert.equal(second.design.spec.footprint.length,90);
 const before=seen.filter(([m])=>m==='design.validate').length;await c.build(spec,'A3');assert.equal(seen.filter(([m])=>m==='design.validate').length,before);
 const a=c.pose(spec,{mode:'actuation',progress:.5}),b=c.pose(spec,{mode:'actuation',progress:.5});assert.deepEqual(await a,await b);
 assert.equal(seen.filter(([m])=>m==='design.pose').length,1);
 const bad=structuredClone(spec);bad.walls={left:false,right:false};await assert.rejects(c.build(bad,'A4'));
 assert.ok((await c.build(spec,'A4')).exportable);
});
