import test from 'node:test';
import assert from 'node:assert/strict';
import {createSheetStudyPlayer,sheetStudySVG} from '../ui/sheet-study-document.mjs';
import {defaultSpec} from '../kernel/spec.mjs';
import {wallTuckProgram,wallTuckStoryboard,studyWallTuck} from '../kernel/wall-tuck-study.mjs';

test('generic study controls advance, rewind, scrub and finish a partial fold using kernel frames only',async()=>{
 const stages=[{title:'flat',frames:[{id:'flat'}]},...['unfamiliar-crease','another-fold'].map(title=>({title,durationMs:20,frames:[{id:title+'-0'},{id:title+'-1'},{id:title+'-2'}]})),{title:'inspection',frames:[{id:'inspection'}]}];
 let time=0;const updates=[],player=createSheetStudyPlayer(stages,s=>updates.push(s),{nextFrame:async()=>time+=10});
 assert.equal(await player.step(-1),false);await player.step(1);assert.equal(player.state.pose,stages[1].frames[2]);
 player.seek(1);assert.equal(player.state.pose,stages[1].frames[1]);await player.step(1);
 assert.equal(player.state.index,1);assert.equal(player.state.pose,stages[1].frames[2]);
 await player.step(1);await player.step(1);assert.equal(player.state.index,3);assert.equal(await player.step(1),false);
 await player.step(-1);assert.equal(player.state.pose,stages[2].frames[2]);await player.step(-1);await player.step(-1);assert.equal(player.state.pose,stages[0].frames[0]);
 for(const update of updates)assert.ok(update.stage.frames.includes(update.pose),'The UI must select a supplied kernel pose rather than synthesize geometry.');
});
test('rapid navigation and slider input cannot change an in-flight operation',async()=>{
 let release,time=0;const stages=[{frames:[{id:0}]},{durationMs:1,frames:[{id:1},{id:2}]}],player=createSheetStudyPlayer(stages,()=>{},{nextFrame:()=>new Promise(r=>{release=()=>r(time+=2);})});
 const pending=player.step(1);assert.equal(await player.step(1),false);assert.equal(player.seek(0),false);
 release();await Promise.resolve();release();await pending;assert.equal(player.state.busy,false);assert.equal(player.state.pose.id,2);
});
test('transported story contains exact boundary poses, axes and seal evidence for an independent renderer',()=>{
 const s=defaultSpec();s.footprint.frontWidth=80;s.rise.front=30;s.footprint.rearWidthRatio=.8;
 const opts={marginMm:8,heatWidthMm:1,samples:31},c=wallTuckProgram(s,opts),r=studyWallTuck(s,opts),story=JSON.parse(JSON.stringify(wallTuckStoryboard(c,r,{framesPerFold:13})));
 assert.equal(story.length,5);for(let i=1;i<=3;i++)assert.deepEqual(story[i-1].frames.at(-1).panels.map(p=>p.pointsMm),story[i].frames[0].panels.map(p=>p.pointsMm));
 const final=story[4].frames[0];assert.deepEqual(final.bandMm,r.heater.bandMm);assert.equal(final.operation,null);
 const view={az:-30,el:28,zoom:1,x:0,y:0},frame={center:[0,40,0],scale:3};
 const svg=sheetStudySVG(final,view,frame);assert.ok(svg.includes('<polygon'));assert.ok(svg.includes('#20a87a'));
 assert.deepEqual(story[4].frames[0].bandMm,r.heater.bandMm);
});
