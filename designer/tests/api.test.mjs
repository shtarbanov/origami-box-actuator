import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {handleRequest,API_VERSION} from '../api/dispatch.mjs';
import {call} from '../api/client.mjs';
import {createController} from '../ui/controller.mjs';
import {sceneSVG} from '../ui/render.mjs';
import {cameraForFrame} from '../ui/camera.mjs';
const defaults=()=>call('describe').defaultSpec;
const request=(method,payload={})=>({apiVersion:API_VERSION,id:'test',method,payload});
const issue=(method,payload)=>{const r=handleRequest(request(method,payload));assert.equal(r.ok,false);return r.errors[0];};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const allPoints=(a,b)=>{assert.equal(a.length,b.length);a.forEach((p,i)=>p.forEach((v,k)=>near(v,b[i][k])));};
const frozen=value=>{if(value&&typeof value==='object'){Object.freeze(value);Object.values(value).forEach(frozen);}return value;};

test('six pre-refactor designs retain physical templates and 24 reference poses',async()=>{
 const fixture=JSON.parse(await readFile(new URL('./fixtures/pre-separation.json',import.meta.url),'utf8'));
 for(const example of fixture){
  const p={kind:'rectangle',length:75,width0:48,width1:36,l0:24,l1:12,gap:4,clearance:4,paper:'A4',opening:.75,thickness:.3,...example.p};
  const spec=call('legacy.migrate',{record:{schema:'origami-reference/0.2',parameters:p}}).spec;
  const templates=call('design.templates',{spec});
  for(const type of ['folding','cutting'])for(const panel of templates[type].panels)allPoints(panel.pointsMm,example[type].find(p=>p.id===panel.id).points);
  for(const state of example.poses){const pose=call('design.pose',{spec,state:{mode:'actuation',progress:state.opening}});for(const p of pose.panels)allPoints(p.pointsMm,state.panels.find(f=>f.id===p.id).points);}
 }
});

test('pure, serializable API works without document/window and does not mutate inputs',()=>{
 assert.equal(typeof document,'undefined');assert.equal(typeof window,'undefined');
 const spec=frozen(defaults()),r=frozen(request('design.build',{spec}));
 const a=handleRequest(r),b=handleRequest(r);assert.deepEqual(a,b);assert.deepEqual(JSON.parse(JSON.stringify(a)),a);
 assert.equal(a.ok,true);assert.equal(a.value.capabilities.pressureModel,false);
 assert.ok(!JSON.stringify(a.value).includes('<svg'));
 const ids=new Set(a.value.topology.panels.map(p=>p.id));
 for(const h of a.value.topology.hinges){assert.equal(h.panelIds.length,2);h.panelIds.forEach(id=>assert.ok(ids.has(id)));}
});

test('strict malformed input handling; unsupported is not physically impossible',()=>{
 assert.equal(handleRequest(null).errors[0].code,'INVALID_REQUEST');
 assert.equal(handleRequest({...request('describe'),apiVersion:'old'}).errors[0].code,'UNSUPPORTED_VERSION');
 assert.equal(issue('wrong',{}).code,'UNKNOWN_METHOD');
 assert.equal(issue('design.build',{spec:{...defaults(),camera:1}}).code,'UNKNOWN_FIELD');
 for(const value of [NaN,Infinity,'50',null,-1,0]){const spec=defaults();spec.footprint.length=value;assert.equal(issue('design.build',{spec}).code,'INVALID_NUMBER');}
 const spec=defaults();spec.footprint.frontWidth=80;spec.footprint.rearWidthRatio=.8;spec.rise.rearRatio=.5;
 assert.ok(call('design.build',{spec}).reference.length===6);
 spec.walls.left=false;
 const error=issue('design.build',{spec});assert.equal(error.code,'HINGE_RATIO_CONSTRAINT');assert.equal(error.details.requiredRearRiseRatio,.8);
 const walls=defaults();walls.walls={left:false,right:false};assert.equal(issue('design.build',{spec:walls}).code,'NO_FOLDING_WALL');
 assert.equal(issue('design.pose',{spec:defaults(),state:{mode:'actuation',progress:1.1}}).code,'INVALID_STATE');
 assert.equal(issue('design.pose',{spec:defaults(),state:{mode:'actuation',progress:.5,targetOpening:.2}}).code,'INVALID_STATE');
 assert.equal(issue('design.validate',{spec:defaults(),options:{samples:1}}).code,'INVALID_OPTIONS');
 assert.equal(issue('design.templates',{spec:defaults(),options:{stockSizeMm:[Infinity,10]}}).code,'INVALID_OPTIONS');
 assert.equal(issue('legacy.migrate',{record:{schema:'origami-reference/0.1',parameters:{}}}).code,'UNSUPPORTED_VERSION');
 const huge=defaults();huge.footprint.length=1e308;assert.notEqual(issue('design.build',{spec:huge}).code,'INTERNAL_ERROR');
});

test('editing is atomic, respects fixed values and rejects invalid combinations',()=>{
 const spec=frozen(defaults());
 const changed=call('design.edit',{spec,changes:[{path:'/footprint/length',value:90}],fixedPaths:['/footprint/frontWidth']});
 assert.equal(changed.spec.footprint.length,90);assert.equal(spec.footprint.length,75);
 assert.equal(issue('design.edit',{spec,changes:[{path:'/footprint/frontWidth',value:60}],fixedPaths:['/footprint/frontWidth']}).code,'LOCK_CONFLICT');
 assert.equal(issue('design.edit',{spec,changes:[{path:'/footprint/rearWidthRatio',value:.8},{path:'/rise/rearRatio',value:.5},{path:'/walls/left',value:false}]}).code,'HINGE_RATIO_CONSTRAINT');
 assert.deepEqual(spec,defaults());
});

test('hinge rise has physical meaning; opposite wall is a mirrored geometry',()=>{
 const spec=defaults();spec.rise.front=30;spec.walls.left=false;
 const right=call('design.pose',{spec,state:{mode:'actuation',progress:1}});
 // Rise is measured on virtual hinge axes; physical panel edges are inset.
 const axes=call('design.build',{spec}).topology.hinges.flatMap(h=>h.axisMm);near(Math.max(...axes.map(p=>p[2])),30);
 const mirrored=structuredClone(spec);mirrored.walls={left:true,right:false};
 const left=call('design.pose',{spec:mirrored,state:{mode:'actuation',progress:1}});
 for(const p of right.panels){const q=left.panels.find(f=>f.id===p.id.replace(/^right/,'left'));allPoints(q.pointsMm,p.pointsMm.map(([x,y,z])=>[-x,y,z]));}
 assert.equal(left.panels.length,4);
 const t1=call('design.templates',{spec}),t2=call('design.templates',{spec:mirrored});
 for(const type of ['folding','cutting'])for(const p of t1[type].panels){const q=t2[type].panels.find(f=>f.id===p.id.replace(/^right/,'left'));allPoints(q.pointsMm,p.pointsMm.map(([x,y])=>[-x,y]));}
});

test('local rigid shapes and right-handed placements reconstruct every pose',()=>{
 const cases=[defaults(),{...defaults(),footprint:{length:75,frontWidth:60,rearWidthRatio:1},rise:{front:48,rearRatio:0}},{...defaults(),rise:{front:30,rearRatio:1},walls:{left:true,right:false}}];
 for(const spec of cases){const d=call('design.build',{spec});
  for(const mode of ['actuation','assembly'])for(const progress of [0,.2,.8,1]){
   const pose=call('design.pose',{spec,state:{mode,progress}});
   for(const p of pose.placements){const local=d.localPanels.find(f=>f.id===p.id).shapeMm,R=p.rotationRowMajor;
    const det=R[0][0]*(R[1][1]*R[2][2]-R[1][2]*R[2][1])-R[0][1]*(R[1][0]*R[2][2]-R[1][2]*R[2][0])+R[0][2]*(R[1][0]*R[2][1]-R[1][1]*R[2][0]);near(det,1);
    const world=local.map(([x,y])=>R.map((row,k)=>p.originMm[k]+row[0]*x+row[1]*y));allPoints(world,pose.panels.find(f=>f.id===p.id).pointsMm);
   }
  }
 }
});

test('UI consumes only API data; camera redraw and paper changes do not revalidate',()=>{
 const calls=[];const controller=createController((method,payload)=>{calls.push(method);return call(method,payload);});
 const spec=defaults(),bundle=controller.build(spec,'A4');assert.ok(bundle.exportable);
 controller.build(spec,'A3');assert.equal(calls.filter(m=>m==='design.validate').length,1);
 const state={mode:'actuation',progress:.5};const p=controller.pose(spec,state),frame=controller.frame(spec,'actuation');
 calls.length=0;controller.pose(spec,state);controller.frame(spec,'actuation');assert.equal(calls.length,0);
 for(const elevation of [-180,-90,-30,0,30,90,180]){
  const camera=cameraForFrame(frame,42,elevation);const svg=sceneSVG(p,camera,{zoom:1,panX:0,panY:0});
  assert.ok(!svg.includes('<ellipse'));assert.ok(!svg.includes('NaN'));assert.equal(new Set([...svg.matchAll(/data-face="([^"]+)"/g)].map(m=>m[1])).size,6);assert.equal((svg.match(/data-facet=/g)||[]).length,36);near(camera.scale,frame.scale);
 }
 const bad=structuredClone(spec);bad.rise.front=200;assert.throws(()=>controller.build(bad,'A4'));
 assert.ok(controller.build(spec,'A4').exportable);
});

test('CLI and in-process API return the same JSON',()=>{
 const req=request('design.build',{spec:defaults()});
 const run=spawnSync(process.execPath,[fileURLToPath(new URL('../adapters/cli.mjs',import.meta.url))],{input:JSON.stringify(req),encoding:'utf8'});
 assert.equal(run.status,0,run.stderr);assert.deepEqual(JSON.parse(run.stdout),handleRequest(req));
});
test('saved artifacts preserve the algorithm version and reproduce the exact geometry',()=>{
 const spec=defaults(),artifact=call('artifact.export',{spec});
 const opened=call('artifact.open',{artifact:JSON.parse(JSON.stringify(artifact))});assert.deepEqual(opened.spec,spec);assert.ok(opened.reproduced);
 const old=structuredClone(artifact);old.engineVersion='0.0.1';assert.equal(issue('artifact.open',{artifact:old}).code,'ENGINE_VERSION_MISMATCH');
 const altered=structuredClone(artifact);altered.design.reference[0].pointsMm[0][0]+=.1;assert.equal(issue('artifact.open',{artifact:altered}).code,'ARTIFACT_MISMATCH');
});
