import test from 'node:test';
import assert from 'node:assert/strict';
import {call} from '../api/client.mjs';
import {defaultSpec} from '../kernel/spec.mjs';
import {sceneSVG} from '../ui/render.mjs';
import {createController} from '../ui/controller.mjs';
const sub=(a,b)=>a.map((v,k)=>v-b[k]),dot=(a,b)=>a.reduce((s,v,k)=>s+v*b[k],0),cross=(u,v)=>[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],dist=(a,b)=>Math.hypot(...sub(a,b));
function volume(m){let v=0;for(const f of m.faces)for(let j=1;j<f.length-1;j++)v+=dot(m.verticesMm[f[0]],cross(m.verticesMm[f[j]],m.verticesMm[f[j+1]]))/6;return v;}
test('API supplies exact symmetric panel solids, preserving rigid distances and volume throughout actuation/assembly',()=>{
 for(const kind of ['box','combined','hinge']){const s=defaultSpec();s.footprint.frontWidth=80;s.rise.front=30;if(kind==='combined'){s.footprint.rearWidthRatio=.8;s.rise.rearRatio=.6;}if(kind==='hinge')s.walls.left=false;
  s.fabrication.panelThickness=1.25;const ref=call('design.pose',{spec:s,state:{mode:'actuation',progress:1}});
  for(const mode of ['actuation','assembly'])for(const progress of [0,.2,.6,1]){const p=call('design.pose',{spec:s,state:{mode,progress}});assert.equal(p.meshes.length,p.panels.length);
   for(const m of p.meshes){const panel=p.panels.find(p=>p.id===m.panelId),r=ref.meshes.find(q=>q.panelId===m.panelId),n=panel.pointsMm.length;assert.equal(m.referenceSurface,'midplane');assert.equal(m.faces.length,n+2);assert.ok(volume(m)>0);assert.ok(Math.abs(volume(m)-volume(r))<1e-7);
    for(let i=0;i<n;i++){assert.ok(Math.abs(dist(m.verticesMm[i],m.verticesMm[i+n])-1.25)<1e-9);for(let k=0;k<3;k++)assert.ok(Math.abs((m.verticesMm[i][k]+m.verticesMm[i+n][k])/2-panel.pointsMm[i][k])<1e-9);}
    for(let i=0;i<2*n;i++)for(let j=i+1;j<2*n;j++)assert.ok(Math.abs(dist(m.verticesMm[i],m.verticesMm[j])-dist(r.verticesMm[i],r.verticesMm[j]))<1e-7);
   }
  }
 }
});
test('thickness edits alter only solid depth, support zero thickness and frame the actual supplied vertices',()=>{
 const s=defaultSpec();s.footprint.frontWidth=80;s.rise.front=30;const poses=[0,.3,2].map(t=>{s.fabrication.panelThickness=t;return call('design.pose',{spec:structuredClone(s),state:{mode:'actuation',progress:1}});});
 assert.deepEqual(poses[0].panels,poses[2].panels);assert.ok(poses[0].meshes.every(m=>m.faces.length===1));
 const controller=createController(),frame=controller.frame(s,'actuation');for(const p of call('design.referencePoses',{spec:s}))for(const m of p.meshes)for(const v of m.verticesMm)assert.ok(dist(v,frame.center)<=frame.radius+1e-8);
 const svg=sceneSVG(poses[2],{project:p=>p},{zoom:1,panX:0,panY:0},{panelIds:['top'],color:'#888888'});assert.equal(new Set([...svg.matchAll(/data-face="([^"]+)"/g)].map(m=>m[1])).size,6);assert.equal((svg.match(/data-highlighted="true"/g)??[]).length,6);assert.equal((svg.match(/role="button"/g)??[]).length,6);assert.ok(!svg.includes('NaN'));
});
