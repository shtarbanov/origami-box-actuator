import {createWorkerClient} from '../api/worker-client.mjs';
import {createAsyncController} from './async-controller.mjs';
import {cameraForFrame,frameFromPoints} from './camera.mjs';
import {sceneSVG} from './render.mjs';
import {createFabricationPlayer} from './fabrication-player.mjs';
import {fabricationSVG} from './fabrication-render.mjs';
import {selectionTarget,directionColors,modelPick} from './selection.mjs';
import {createLabelLayout,createFrameScheduler} from './label-layout.mjs';
import {createDragSession} from './drag-session.mjs';
import {bindViewControls,defaultView,orbitAngles,viewPoint,zoomAt} from '../view-controls.mjs';

const $=id=>document.getElementById(id);
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=value=>Number.isFinite(value)?Number(value.toFixed(4)).toString():'—';
const client=createWorkerClient(new Worker(new URL('../adapters/worker.mjs',import.meta.url),{type:'module'}));
const controller=createAsyncController(client.call),catalog=await client.call('intent.describe');
let intent=structuredClone(catalog.initialIntent),report=null,validReport=null,bundle=null,scene=null,handles=null;
let revision=0,drawRevision=0,queue=Promise.resolve(),paper='A4',page='folding',progress=1,view=defaultView(),azimuth=-38,elevation=28,frame=null;
let selectedSide=null,selectedField='frontWidth',drag=null,sliderActive=false,playing=false,animationId=null,dragSequence=0;
let selection=null,handlesSpecKey=null;
let displayed=null;
let guideSession=null;
let guideOpening=false;
const fabrication=createFabricationPlayer(client.call,renderFabrication,{reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches});
const labelLayout=createLabelLayout();
const display={directions:true,labels:true,highlights:true,guides:true,handles:true};
try{const saved=JSON.parse(localStorage.getItem('origami-box-view/1'));for(const key of Object.keys(display))if(typeof saved?.[key]==='boolean')display[key]=saved[key];}catch{}
const schedulePaint=createFrameScheduler(paintScene,callback=>requestAnimationFrame(callback));
const undo=[],redo=[];let mergeKey=null,mergeTime=0;
const label=op=>catalog.features.find(b=>b.id===op)?.label??catalog.blocks.find(b=>b.op===op)?.label??op;
try{
 const saved=JSON.parse(sessionStorage.getItem('origami-box-intent/1'));
 if(saved?.intent){intent=saved.intent;paper=saved.paper??'A4';}
 else {const old=JSON.parse(sessionStorage.getItem('origami-box-client/1'));if(old?.spec){const migrated=await client.call('intent.fromSpec',{spec:old.spec});if(migrated.status==='resolved')intent=migrated.intent;}}
}catch{}

function remember(key,origin=intent){
 if(!key||mergeKey!==key||(!key.startsWith('drag-')&&performance.now()-mergeTime>900)){undo.push(structuredClone(origin));if(undo.length>60)undo.shift();redo.length=0;}
 mergeKey=key;mergeTime=performance.now();
}
function persist(){try{sessionStorage.setItem('origami-box-intent/1',JSON.stringify({intent,paper}));}catch{}}
function pending(){stop();progress=1;$('progress').value=100;$('status').textContent='Updating…';$('save').disabled=true;$('download-svg').disabled=true;$('print').disabled=true;}
function command(action,key=null,gesture=null){
 if(guideSession)return Promise.resolve();
 const ticket=++revision;pending();
 queue=queue.catch(()=>{}).then(async()=>{
  const request=gesture?gesture.request(action):{intent:structuredClone(intent),command:action};
  if(!gesture)remember(key,request.intent);
  try{
   const next=await client.call('intent.command',request);
   if(gesture&&next.status!=='resolved'){if(ticket===revision)rejectDrag(next.conflicts?.[0]?.message??'This resize is outside the supported range.');return;}
   if(gesture)remember(key,request.intent);
   intent=next.intent??intent;
   if(ticket===revision)await accept(next,ticket);
  }catch(e){if(ticket===revision){if(gesture)rejectDrag(e.message);else showError(e.message);}}
 });return queue;
}
function rejectDrag(message){
 if(!displayed)return;intent=structuredClone(displayed.report.intent);validReport=displayed.report;report=validReport;scene=displayed.scene;handles=displayed.handles;frame=displayed.frame;bundle=displayed.bundle;handlesSpecKey=JSON.stringify(validReport.spec);
 preserveFocus(()=>{renderBlocks();renderDimensions();renderConflicts();});persist();
 $('status').textContent='Showing last valid design';$('edit-feedback').textContent=message;$('edit-feedback').hidden=false;
 $('save').disabled=false;$('download-svg').disabled=!bundle?.exportable;$('print').disabled=!bundle?.exportable;paint();
}
function showError(message){
 $('status').textContent='Condition conflict';$('conflicts').hidden=false;
 $('conflicts').innerHTML=`<h3>Could not apply this change</h3><p>${esc(message)}</p><button id="revert-error">Undo change</button>`;
 $('revert-error').onclick=()=>travel('undo');
}
function preserveFocus(render){
 const active=document.activeElement,id=active?.id,hadFocus=active?.matches('input[type=number]');
 render();if(hadFocus&&id){const replacement=document.getElementById(id)??(id.startsWith('block-value-view-')?document.getElementById('block-value-'+selection?.blockId):null);replacement?.focus({preventScroll:true});}
}
function virtualBlock(feature){
 const r=report?.status==='resolved'?report:validReport;if(!r)return null;
 const v=r.values,op=feature==='outline'?'width-ratio':feature==='longitudinal'?'tilt':'side-rise-ratio';
 return {id:'view-'+feature,op,value:feature==='outline'?v.rearWidth/v.frontWidth:feature==='longitudinal'?r.measurements.longitudinalAngleDeg:v.sideRiseRatio??1,strength:'default',virtual:true};
}
function selectedBlockById(id){return intent.blocks.find(b=>b.id===id)??(id?.startsWith('view-')?virtualBlock(id.slice(5)):null);}
function renderBlocks(){
 if(sliderActive)return;
 const conflicting=new Set(report?.conflicts?.flatMap(c=>c.blockIds??[])??[]);
 const visibleBlocks=intent.blocks.filter(b=>b.strength!=='default'||report?.blockStates?.[b.id]?.active!==false);
 if(selection?.virtual){const b=virtualBlock(selection.feature);if(b)visibleBlocks.push(b);}
 $('block-count').textContent=`${visibleBlocks.length}`;
 $('blocks').innerHTML=visibleBlocks.length?visibleBlocks.map(b=>{
  const entry=catalog.blocks.find(c=>c.op===b.op),state=report?.blockStates?.[b.id],active=state?.active!==false,r=report?.blockRanges?.[b.id];
  let title=entry.label;if(b.op==='wall-off')title=`opening about its ${b.side} edge`;
  const equal=b.op.startsWith('equal-'),value=equal?1:b.value;
  if(entry.feature==='outline')title=Math.abs(value-1)<1e-7?'with a rectangular outline':'with a trapezoidal outline';
  if(entry.feature==='longitudinal')title=Math.abs(value-(b.op==='tilt'?0:1))<1e-7?(b.op==='tilt'?'without front/rear tilt':'with equal front/rear lift'):'with unequal front/rear lift';
  if(entry.feature==='lateral')title=Math.abs(value-1)<1e-7?'with equal left/right lift':'with unequal left/right lift';
  if(b.op==='lock')title=`Fix ${catalog.fields.find(f=>f.id===b.field)?.label.toLowerCase()}`;
  let controls='';
  if(entry.parameter||equal){
   const parameter=entry.parameter??{min:0,step:.05,unit:'×'},min=r?.min??parameter.min??0,max=r?.max??(b.op==='tilt'?89:Math.max(2,value*1.5));
   const mode=entry.feature==='longitudinal'?`<select data-mode="${esc(b.id)}" aria-label="Front/rear lift input"><option value="ratio" ${b.op==='tilt'?'':'selected'}>Height ratio</option><option value="angle" ${b.op==='tilt'?'selected':''}>Angle</option></select>`:'';
   controls=`${mode}<div class="block-edit"><input type="range" data-block-range="${esc(b.id)}" aria-label="${esc(title)} slider" min="${min}" max="${max}" step="any" value="${value}" ${!active||b.pinned?'disabled':''}><input id="block-value-${esc(b.id)}" type="number" data-block-value="${esc(b.id)}" aria-label="${esc(title)} value" value="${fmt(value)}" step="${parameter.step}" ${!active||b.pinned?'readonly':''}><span>${parameter.unit}</span></div><div class="block-note">${esc(entry.description)}</div><details class="block-options"><summary>Limits &amp; lock</summary><button class="pin" data-pin="${esc(b.id)}" title="Preserve this value during direct edits">${b.pinned?'● Value fixed':'○ Value editable'}</button>${r&&active?`<div class="block-note">Local range ≈ ${fmt(r.min)} … ${r.max===null?'open':fmt(r.max)}</div>`:''}</details>`;
  }else if(b.op==='lock')controls=`<div class="block-edit"><input id="block-value-${esc(b.id)}" type="number" data-block-value="${esc(b.id)}" aria-label="${esc(title)} value" value="${fmt(b.value)}" step=".5"><span>mm</span></div>`;
  else if(b.op==='wall-off')controls=`<label class="edge-choice">Fixed edge <select data-fixed-side="${esc(b.id)}" aria-label="Fixed side"><option value="left" ${b.side==='left'?'selected':''}>Left</option><option value="right" ${b.side==='right'?'selected':''}>Right</option></select></label>`;
  if(b.virtual)controls=controls.replace(/<details class="block-options">[\s\S]*?<\/details>/,'');
  return `<article class="relation-block ${conflicting.has(b.id)?'conflict':''} ${active?'':'inactive'} ${selection?.blockId===b.id?'selected':''}" tabindex="0" role="group" aria-label="${esc(title)}" aria-current="${selection?.blockId===b.id?'true':'false'}" draggable="${!b.virtual}" data-block-id="${esc(b.id)}" data-feature="${entry.feature??'fixed'}" data-family="${entry.family??''}" data-op="${esc(b.op)}"><div class="block-head"><span>${esc(title)}</span>${b.virtual||b.neutral?'':`<button data-remove="${esc(b.id)}" aria-label="Remove ${esc(title)}">×</button>`}</div>${controls}${!active?`<div class="block-note">${esc(state.reason)}</div>`:''}</article>`;
 }).join(''):'<div class="empty">Add a phrase to describe this actuator.</div>';
 $('design-description').textContent=report?.description?.sentence??'Resolve the highlighted conditions to describe this actuator.';
 const m=report?.measurements;
 $('side-heights').hidden=!m||!report.walls.left||!report.walls.right;
 if(m)$('side-heights').innerHTML=['left','right'].map(side=>`<label>${side==='left'?'Left':'Right'} rise <input id="side-rise-${side}" data-side-rise="${side}" type="number" step=".5" value="${fmt(m[side+'MidRise'])}" aria-label="${side==='left'?'Left':'Right'} midpoint rise"> mm</label>`).join('');
 renderModelEditor();
}
function renderDimensions(){
 const conflictFields=new Set(report?.conflicts?.flatMap(c=>c.fields??[])??[]);
 const descriptions=(report?.status==='resolved'?report.fields:catalog.fields.map(f=>({...f,role:intent.blocks.some(b=>b.op==='lock'&&b.field===f.id)?'fixed':'independent'}))).filter(f=>!f.hiddenDimension);
 for(const [container,subset] of [['dimensions',descriptions.slice(0,5)],['fabrication',descriptions.slice(5)]]){
  $(container).innerHTML=subset.map(f=>{
   const fixed=intent.blocks.find(b=>b.op==='lock'&&b.field===f.id),range=f.range;
   const bound=x=>fmt(Math.round(x*100)/100);
   const rangeText=range&&f.role!=='fixed'?`≈ ${bound(range.min)} ${range.max===null?'…':`– ${bound(range.max)}`} mm`:f.role==='dependent'?f.reason:f.role==='fixed'?'Preserved by a fixed-value block':'';
   return `<div class="dimension-row ${conflictFields.has(f.id)?'conflict':''}" data-field="${f.id}"><div class="dimension-label"><label for="dimension-${f.id}">${f.label}</label><button data-fix="${f.id}" aria-label="${fixed?'Unfix':'Fix'} ${f.label}">${fixed?'● Fixed':'○ Fix'}</button></div><div class="dimension-value"><input id="dimension-${f.id}" data-dimension="${f.id}" type="number" step=".5" value="${fmt(intent.values[f.id])}" aria-label="${f.label}" title="${esc(f.reason??'')}" ${f.role!=='independent'?'readonly':''}><span class="role">${f.role==='dependent'?'linked':f.role==='fixed'?'fixed':''}</span></div><small class="range">${esc(rangeText??'')}</small></div>`;
  }).join('');
 }
}
function renderConflicts(){
 const conflicts=report?.conflicts??[];$('conflicts').hidden=!conflicts.length;
 if(!conflicts.length)return;
 $('conflicts').innerHTML='<h3>These conditions do not agree</h3>'+conflicts.map(c=>{
  const sources=(c.blockIds??[]).map(id=>intent.blocks.find(b=>b.id===id)).filter(Boolean);
  const name=b=>b.neutral?(b.op==='tilt'?'Zero front/rear tilt':'Equal widths'):b.op==='lock'?`Fix ${catalog.fields.find(f=>f.id===b.field)?.label}`:b.op==='wall-off'?`${b.side} fixed edge`:label(b.op);
  const names=sources.map(b=>b.source?.kind==='text'?`${name(b)}: “${b.source.clause}”`:name(b));
  return `<p>${esc(c.message)}</p>${names.length?`<p class="hint">From: ${esc(names.join(' + '))}</p>`:''}${sources.filter(b=>!b.neutral).map(b=>`<button data-repair-remove="${esc(b.id)}">Remove “${esc(name(b))}”</button>`).join('')}`;
 }).join('')+'<button id="revert-draft">Undo change</button>';
 $('revert-draft').onclick=()=>travel('undo');
}
async function accept(next,ticket){
 if(ticket!==revision)return;report=next;
 if(selection?.virtual){const actual=intent.blocks.find(b=>catalog.blocks.find(c=>c.op===b.op)?.feature===selection.feature&&next.blockStates?.[b.id]?.active!==false);if(actual)selection={...selection,virtual:false,blockId:actual.id};}
 if(selection?.blockId&&!selection.virtual&&!intent.blocks.some(b=>b.id===selection.blockId)){selection=null;selectedSide=null;$('selection-label').textContent='Drag a handle to change this box';$('side-action').hidden=true;}
 preserveFocus(()=>{renderBlocks();renderDimensions();renderConflicts();});
 $('undo').disabled=!undo.length;$('redo').disabled=!redo.length;
 if(next.status!=='resolved'){$('status').textContent=scene?'Previous valid design · resolve conditions':'Resolve conditions';return;}
 validReport=next;
 if(displayed&&JSON.stringify(displayed.report.spec)===JSON.stringify(next.spec)){displayed.report=next;displayed.scene.report=next;}
 persist();$('save').disabled=false;
 $('edit-feedback').hidden=true;
 $('adjustments').textContent=[...next.adjustments.map(a=>{const f=catalog.fields.find(f=>f.id===a.field);return `${f.label} → ${fmt(a.to)} ${f.unit}`;}),...(next.notes??[])].join(' · ');
 try{
  const snapshot=structuredClone(next.spec);
  const [built,interaction]=await Promise.all([controller.build(snapshot,paper),client.call('design.handles',{spec:snapshot})]);
  if(ticket!==revision)return;bundle=built;handles=interaction;handlesSpecKey=JSON.stringify(snapshot);scene=null;
  $('sheet').innerHTML=bundle.sheets[page].svg;
  const a=bundle.validation.actuation,b=bundle.validation.assembly;
  const reasons=[];
  const paperFits=Object.values(bundle.sheets).every(s=>s.fit);
  if(!paperFits)reasons.push(`${a.numericalPass&&b.sampledPass?'The design is valid but its templates':'The templates'} exceed ${paper}. Change the paper size for printing.`);
  if(!a.numericalPass)reasons.push('Rigid geometry or folding checks failed.');
  if(!b.sampledPass)reasons.push('The sampled assembly path has interference or a closure error.');
  if(a.minimumSampledSafeOpening===null)reasons.push('No thickness-clear fully open sample was found.');
  $('paper-note').textContent=reasons.length?reasons.join(' '):`${paper} · Print at actual size`;
  $('status').textContent=!a.numericalPass?'Folding geometry needs review':!b.sampledPass?'Assembly path needs review':a.minimumSampledSafeOpening===null?'Panel clearance needs review':!paperFits?'Design valid · paper too small':'Design resolved';$('download-svg').disabled=!bundle.exportable;$('print').disabled=!bundle.exportable;
  for(const id of ['download-svg','print'])$(id).title=!paperFits?'The selected paper is too small; the actuator geometry remains editable.':'';
  $('validation').textContent=`Rigid error ${a.maxRigidErrorMm.toExponential(2)} mm · closure ${a.maxSeamErrorMm.toExponential(2)} mm · assembly ${b.sampledPass?'passed':'needs review'} · sampled thickness clearance starts at ${a.minimumSampledSafeOpening===null?'no safe open sample':Math.round(a.minimumSampledSafeOpening*100)+'%'} · ${bundle.analysis.mobility.genericSampledDof} sampled ideal internal freedoms.`;
  await draw();
 }catch(e){if(ticket===revision)showError(e.message);}
}
async function draw(){
 if(guideSession)return;
 if(!validReport)return;const ticket=++drawRevision,key=JSON.stringify([validReport.spec,progress]);
 if(scene?.key!==key){
  const spec=structuredClone(validReport.spec);
  try{const [pose,referenceFrame,interaction]=await Promise.all([controller.pose(spec,{mode:'actuation',progress}),frame?Promise.resolve(frame):controller.frame(spec,'actuation'),handlesSpecKey===JSON.stringify(spec)&&handles?.progress===progress?Promise.resolve(handles):client.call('design.handles',{spec,state:{mode:'actuation',progress}})]);
   if(ticket!==drawRevision)return;if(!frame)frame=referenceFrame;handles=interaction;handlesSpecKey=JSON.stringify(spec);scene={key,pose,report:validReport};
  }catch(e){if(ticket===drawRevision)showError(e.message);return;}
 }
 if(scene)scene.report=validReport;paint();
}
function camera(){return frame?cameraForFrame(frame,azimuth,elevation):null;}
function screenPoint(point){return viewPoint(camera().project(point),view);}
function paint(){schedulePaint();}
function paintScene(){
 if(guideSession&&fabrication.state.pose&&frame){
  let svg=fabricationSVG(fabrication.state.pose,camera(),view);
  const viewportWidth=330*preview.clientWidth/Math.max(1,preview.clientHeight);
  svg=svg.replace('viewBox="0 0 720 330"',`viewBox="${360-viewportWidth/2} 0 ${viewportWidth} 330"`);
  preview.innerHTML=svg;return;
 }
 if(!scene||!frame)return;
 const projectionCamera=camera(),projectionView={...view},screenPoint=p=>viewPoint(projectionCamera.project(p),projectionView);
 const currentSelection=selection?.blockId?{...selection,side:intent.blocks.find(b=>b.id===selection.blockId)?.side??selection.side}:selection;
 const target=selectionTarget(handles,currentSelection),activeHandles=new Set(display.highlights?target.handleIds??[]:[]),activeEdges=new Set(display.highlights?target.edgeIds??[]:[]);
 let svg=sceneSVG(scene.pose,projectionCamera,projectionView,display.highlights?target:{}),overlay='';const labels=[],occupied=[];
 if(handles){
  if(display.handles&&progress>=.999)for(const h of handles.handles){const p=screenPoint(h.pointMm);occupied.push({x:p[0]-7,y:p[1]-7,width:14,height:14});}
  if(display.handles)for(const side of handles.sideTargets){const p=screenPoint(side.pointMm);occupied.push({x:p[0]-9,y:p[1]-9,width:18,height:18});}
  for(const edge of handles.edges){
   const labelPoint=screenPoint(edge.labelPointMm),on=activeEdges.has(edge.id),[a,b]=(target.hingeAxes?edge.hingeMm:edge.topMm).map(screenPoint),color=directionColors[edge.id];
   if(on){overlay+=`<g data-highlight-edge="${edge.id}" class="selected-edge"><line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="white" stroke-width="6"/><line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="${color}" stroke-width="3"/></g>`;
   }
   if(display.guides&&target.heightGuides&&target.edgeIds?.includes(edge.id)){const h=handles.handles.find(h=>h.edge===edge.id),top=screenPoint(h.pointMm),base=screenPoint([h.pointMm[0],h.pointMm[1],0]);overlay+=`<line class="height-guide" data-height-guide="${edge.id}" x1="${base[0]}" y1="${base[1]}" x2="${top[0]}" y2="${top[1]}" stroke="${color}"/>`;}
   if(display.directions)labels.push({kind:'direction',edge,anchor:labelPoint,on,color});
   const [hitA,hitB]=edge.topMm.map(screenPoint);overlay+=`<line class="edge-hit" data-edge-pick="${edge.id}" role="button" tabindex="0" aria-label="Select ${edge.id} edge" x1="${hitA[0]}" y1="${hitA[1]}" x2="${hitB[0]}" y2="${hitB[1]}" stroke="transparent" stroke-width="12"/>`;
  }
  if(progress>=.999)for(const h of handles.handles){const p=screenPoint(h.pointMm),isHeight=h.id.endsWith('Rise'),active=activeHandles.has(h.id),color=directionColors[h.edge]??'#47765b';if(display.handles)overlay+=`<g data-handle="${h.id}" class="${active?'active-handle':''} ${h.fixed?'fixed-handle':''}" role="button" tabindex="0" aria-disabled="${h.fixed?'true':'false'}" aria-label="${h.fixed?'Fixed':'Drag'} ${h.label}"><title>${h.label} (${fmt(h.value??scene.report.values[h.id])} mm)${h.fixed?': fixed connection':isHeight?': drag this edge midpoint vertically':': drag to resize'}</title><circle class="dimension-handle" cx="${p[0]}" cy="${p[1]}" r="${active?7:5.5}" style="stroke:${color};${active?'fill:'+color+';':''}"/></g>`;if(display.labels)labels.unshift({kind:'handle',h,anchor:p,color});}
  if(display.handles)for(const side of handles.sideTargets){const p=screenPoint(side.pointMm);overlay+=`<g class="side-control" data-side="${side.side}" role="button" tabindex="0" aria-label="${side.present?'Remove':'Restore'} ${side.side} folding wall"><title>${side.present?'Remove':'Restore'} ${side.side} folding wall</title><circle cx="${p[0]}" cy="${p[1]}" r="8"/><text x="${p[0]}" y="${p[1]}">${side.present?'−':'+'}</text></g>`;}
  for(const item of labels){
   if(item.kind==='handle'){const {h,anchor:p,color}=item,box=labelLayout.place('dimension-'+h.id,p,h.label.length*5.2+2,occupied);overlay+=`<text class="handle-label" x="${box.x}" y="${box.y+11}" style="fill:${color}">${h.label}</text>`;}
   else{const {edge,anchor:p,on,color}=item,box=labelLayout.place('direction-'+edge.id,p,40,occupied,[-20,-8]);overlay+=`<g data-direction="${edge.id}" class="direction-label ${on?'active':''}" aria-label="${edge.label} direction" style="--direction:${color}"><rect x="${box.x}" y="${box.y}" width="40" height="16" rx="5"/><text x="${box.x+20}" y="${box.y+8}">${edge.label}</text></g>`;}
  }
 }
 const viewportWidth=330*preview.clientWidth/Math.max(1,preview.clientHeight);
 svg=svg.replace('viewBox="0 0 720 330"',`viewBox="${360-viewportWidth/2} 0 ${viewportWidth} 330"`);
 $('preview3d').innerHTML=svg.replace('</svg>',overlay+'</svg>');
 if(display.highlights&&selectedSide)for(const f of $('preview3d').querySelectorAll('[data-face]'))if(f.dataset.face.startsWith(selectedSide))f.setAttribute('stroke','#c09c56');
 $('progress-value').textContent=Math.round(progress*100)+'%';
 displayed={report:scene.report,handles,scene,frame,bundle,project:screenPoint};
}
function selectSide(side){selection={feature:'side',side};for(const card of $('blocks').querySelectorAll('[data-block-id]')){card.classList.remove('selected');card.setAttribute('aria-current','false');}selectedSide=side;$('selection-label').textContent=`${side==='left'?'Left':'Right'} folding wall`;$('side-action').hidden=false;$('side-action').textContent=validReport?.walls[side]?'Connect this side directly':'Restore folding wall';paint();}
function selectBlock(id,options={}){
 const block=selectedBlockById(id);if(!block)return;
 const entry=catalog.blocks.find(c=>c.op===block.op);selection={blockId:id,feature:entry.feature,field:block.field,side:block.side,virtual:!!block.virtual,...options};selectedSide=null;
 for(const card of $('blocks').querySelectorAll('[data-block-id]')){const selected=card.dataset.blockId===id;card.classList.toggle('selected',selected);card.setAttribute('aria-current',String(selected));}
 $('selection-label').textContent=entry.feature==='connection'?`${block.side==='left'?'Left':'Right'} fixed edge`:entry.feature==='longitudinal'?'Front ↔ Rear · top-edge heights':entry.feature==='lateral'?'Left ↔ Right · side edges':entry.feature==='outline'?'Front ↔ Rear · panel widths':entry.label;
 $('side-action').hidden=true;renderModelEditor();paint();
}
function renderModelEditor(){
 const container=$('model-editor'),b=selectedBlockById(selection?.blockId),r=report?.status==='resolved'?report:validReport;
 container.hidden=!b||!r;if(!b||!r)return;
 const entry=catalog.blocks.find(c=>c.op===b.op),mode=b.op==='tilt'?'angle':'ratio',v=b.op.startsWith('equal')?1:b.value,edge=selection.edge;
 let html='';
 if(edge){const fixed=handles?.handles.find(h=>h.edge===edge)?.fixed;html+=`<label>${edge[0].toUpperCase()+edge.slice(1)} midpoint <input id="model-primary" data-primary-edge="${edge}" type="number" step=".5" value="${fmt(r.measurements[edge+'MidRise'])}" aria-label="Selected ${edge} midpoint height" ${fixed?'readonly':''}> mm</label>`;}
 else if(entry.feature==='outline')html+=`<label>Front width <input id="model-primary" data-primary-field="frontWidth" type="number" step=".5" value="${fmt(r.values.frontWidth)}" aria-label="Selected front width" ${r.roles.frontWidth.role==='fixed'?'readonly':''}> mm</label>`;
 if(entry.feature==='connection')html+=`<label>Fixed edge <select id="model-fixed-side" aria-label="Selected fixed side"><option value="left" ${b.side==='left'?'selected':''}>Left</option><option value="right" ${b.side==='right'?'selected':''}>Right</option></select></label>`;
 else if(entry.feature){
  if(entry.feature==='longitudinal')html+=`<select id="model-mode" aria-label="Selected front/rear input"><option value="ratio" ${mode==='ratio'?'selected':''}>Height ratio</option><option value="angle" ${mode==='angle'?'selected':''}>Angle</option></select>`;
  const caption=entry.feature==='outline'?'Rear / front':entry.feature==='lateral'?'Front R / L':mode==='angle'?'Tilt':'Rear / front';
  html+=`<label>${caption} <input id="model-value" type="number" step="${mode==='angle'?1:.05}" value="${fmt(v)}" aria-label="Selected ${entry.feature} value" ${b.pinned?'readonly':''}> ${mode==='angle'?'°':'×'}</label>`;
 }
 else if(b.op==='lock')html+=`<label>${catalog.fields.find(f=>f.id===b.field)?.label} <input id="model-value" type="number" value="${fmt(b.value)}" step=".5" aria-label="Selected fixed dimension"> ${catalog.fields.find(f=>f.id===b.field)?.unit}</label>`;
 container.innerHTML=html;
}
function selectModelPart(part,focus=true){
 const target=modelPick(handles,part,selection);if(!target)return;
 const b=intent.blocks.find(b=>catalog.blocks.find(c=>c.op===b.op)?.feature===target.feature&&report?.blockStates?.[b.id]?.active!==false);
 selection={...target,virtual:!b,blockId:b?.id??'view-'+target.feature};renderBlocks();selectBlock(selection.blockId,target);
 if(focus){const input=$('model-editor').querySelector('input:not([readonly]),select');input?.focus({preventScroll:true});if(input?.type==='number')input.select();}
}
function stop(){playing=false;if(animationId!==null)cancelAnimationFrame(animationId);animationId=null;$('play').textContent='Play';}

function renderFabrication(state){
 if(!guideSession)return;
 if(!state.active){
  const saved=guideSession;guideSession=null;({frame,view,azimuth,elevation,scene,displayed}=saved);
  document.body.classList.remove('fabricating');
  for(const [element,inert] of saved.inert)element.inert=inert;
  $('fabrication-guide').hidden=true;$('fabrication-toggle').textContent='Fabrication guide';$('fabrication-toggle').setAttribute('aria-expanded','false');
  $('status').textContent=saved.status;preview.setAttribute('aria-label',saved.ariaLabel);
  if(state.error){$('edit-feedback').textContent=state.error;$('edit-feedback').hidden=false;}
  paint();return;
 }
 $('guide-prev').disabled=state.busy||state.index===0;
 $('guide-next').disabled=state.busy||!state.guide||state.index===state.guide.stages.length-1;
 $('fabrication-guide').setAttribute('aria-busy',String(state.busy));
 $('status').textContent='Fabrication guide';
 if(state.guide){
  if(!guideSession.framed){frame=frameFromPoints(state.guide.framePointsMm);view=defaultView();azimuth=-18;elevation=55;guideSession.framed=true;}
  const stage=state.guide.stages[state.index];
  $('guide-title').textContent=`${state.index+1} / ${state.guide.stages.length} · ${stage.title}`;
  $('guide-instruction').textContent=stage.instruction;
  const v=state.validation;if(v)$('guide-checks').textContent=`Rigid distance error ${v.maxDistanceErrorMm.toExponential(2)} mm · hinge / closure error ${Math.max(v.maxHingeErrorMm,v.maxClosureErrorMm).toExponential(2)} mm · matched seal guides ${v.maxSealMismatchMm.toExponential(2)} mm. Ideal mid-surfaces; flat stacking, film pleats and thickness need physical validation. Back steps rewind the explanation.`;
 }
 if(state.error){$('guide-instruction').textContent=state.error;}
 paint();
}
async function toggleFabrication(){
 if(guideSession){fabrication.close();return;}
 if(guideOpening)return;guideOpening=true;
 try{
 await queue;if(!validReport||report?.status!=='resolved')return;
 stop();++drawRevision;modelDown=null;
 guideSession={frame,view:{...view},azimuth,elevation,scene,displayed,status:$('status').textContent,ariaLabel:preview.getAttribute('aria-label'),inert:[...document.querySelectorAll('.relations,.dimensions,header nav,.templates-head,#model-editor,.selection')].map(e=>[e,e.inert])};
 for(const [element] of guideSession.inert)element.inert=true;
 document.body.classList.add('fabricating');$('fabrication-guide').hidden=false;$('fabrication-toggle').textContent='Exit guide';$('fabrication-toggle').setAttribute('aria-expanded','true');
 $('guide-title').textContent='Loading fabrication steps…';$('guide-instruction').textContent='';$('guide-checks').textContent='';
 preview.setAttribute('aria-label','Fabrication guide. Left drag pans, right drag rotates, wheel or pinch zooms. Use the previous and next step buttons below.');
 await fabrication.open(validReport.spec);
 }finally{guideOpening=false;}
}
function download(name,value,type){const url=URL.createObjectURL(new Blob([value],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function addBlock(feature){const existing=intent.blocks.find(b=>catalog.blocks.find(c=>c.op===b.op)?.feature===feature&&b.strength==='required');if(existing){selectBlock(existing.id);document.querySelector(`[data-block-id="${existing.id}"]`)?.scrollIntoView({block:'nearest'});return;}command({type:'set-feature',feature,side:selectedSide??'left',source:{kind:'block'}}).then(()=>{const b=intent.blocks.find(b=>catalog.blocks.find(c=>c.op===b.op)?.feature===feature);if(b)selectBlock(b.id);});}
function editBlock(id,value){const b=selectedBlockById(id),entry=catalog.blocks.find(c=>c.op===b?.op);return entry?.feature?{type:'set-feature',feature:entry.feature,mode:b.op==='tilt'?'angle':'ratio',value,source:{kind:'block'}}:{type:'update-block',id,value};}

$('palette').innerHTML=catalog.features.map(b=>`<button class="palette-item" draggable="true" data-add="${b.id}">${b.label} +</button>`).join('');
let suppressPaletteClick=0;
$('palette').onclick=e=>{if(performance.now()<suppressPaletteClick)return;const target=e.target.closest('[data-add]');if(target)addBlock(target.dataset.add);};
$('blocks').onclick=e=>{
 const card=e.target.closest('[data-block-id]');if(card)selectBlock(card.dataset.blockId);
 const target=e.target.closest('button');if(!target)return;
 if(target.dataset.remove)command({type:'remove-block',id:target.dataset.remove});
 if(target.dataset.pin)command({type:'toggle-block-lock',id:target.dataset.pin});
};
$('blocks').addEventListener('focusin',e=>{const id=e.target.closest('[data-block-id]')?.dataset.blockId;if(id)selectBlock(id);});
$('blocks').addEventListener('keydown',e=>{if(e.target.matches('[data-block-id]')&&['Enter',' '].includes(e.key)){e.preventDefault();selectBlock(e.target.dataset.blockId);}});
let inputTimer;
$('model-editor').addEventListener('input',e=>{
 if(e.target.type!=='number'||!Number.isFinite(e.target.valueAsNumber))return;
 const value=e.target.valueAsNumber,edge=e.target.dataset.primaryEdge,field=e.target.dataset.primaryField;
 const action=edge?{type:'edge-rise',edge,value}:field?{type:'direct-dimension',field,value}:editBlock(selection.blockId,value);
 clearTimeout(inputTimer);inputTimer=setTimeout(()=>command(action,'model:'+(edge??field??selection.feature)),220);
});
$('model-editor').addEventListener('change',e=>{
 if(e.target.id==='model-mode')command({type:'switch-feature-mode',feature:'longitudinal',mode:e.target.value});
 if(e.target.id==='model-fixed-side')command({type:'set-feature',feature:'connection',side:e.target.value});
});
$('blocks').addEventListener('input',e=>{
 const id=e.target.dataset.blockValue??e.target.dataset.blockRange;if(!id)return;
 const value=e.target.valueAsNumber;if(!Number.isFinite(value))return;
 if(e.target.type==='range'){sliderActive=true;const number=document.getElementById('block-value-'+id);if(number)number.value=value;}
 clearTimeout(inputTimer);inputTimer=setTimeout(()=>command(editBlock(id,value),'block:'+id),e.target.type==='range'?45:220);
});
$('blocks').addEventListener('change',e=>{
 if(e.target.dataset.blockRange){clearTimeout(inputTimer);sliderActive=false;command(editBlock(e.target.dataset.blockRange,e.target.valueAsNumber),'block:'+e.target.dataset.blockRange);}
 if(e.target.dataset.mode)command({type:'switch-feature-mode',feature:'longitudinal',mode:e.target.value});
 if(e.target.dataset.fixedSide)command({type:'set-feature',feature:'connection',side:e.target.value});
});
$('side-heights').addEventListener('input',e=>{const edge=e.target.dataset.sideRise;if(!edge||!Number.isFinite(e.target.valueAsNumber))return;const value=e.target.valueAsNumber;clearTimeout(inputTimer);inputTimer=setTimeout(()=>command({type:'edge-rise',edge,value,source:{kind:'direct'}},'side:'+edge),220);});
$('side-heights').addEventListener('change',e=>{const edge=e.target.dataset.sideRise;if(!edge||!Number.isFinite(e.target.valueAsNumber))return;clearTimeout(inputTimer);command({type:'edge-rise',edge,value:e.target.valueAsNumber,source:{kind:'direct'}},'side:'+edge);});
$('side-heights').addEventListener('focusin',()=>{const b=intent.blocks.find(b=>catalog.blocks.find(c=>c.op===b.op)?.feature==='lateral');if(b)selectBlock(b.id);else{selection={feature:'lateral'};selectedSide=null;paint();}});
for(const container of ['dimensions','fabrication']){
 $(container).addEventListener('input',e=>{if(!e.target.dataset.dimension||!Number.isFinite(e.target.valueAsNumber))return;const field=e.target.dataset.dimension,value=e.target.valueAsNumber;clearTimeout(inputTimer);inputTimer=setTimeout(()=>command({type:'set-value',field,value},'field:'+field),220);});
 $(container).addEventListener('focusin',e=>{if(e.target.dataset.dimension)selectedField=e.target.dataset.dimension;});
 $(container).onclick=e=>{const f=e.target.closest('[data-fix]')?.dataset.fix;if(!f)return;const old=intent.blocks.find(b=>b.op==='lock'&&b.field===f);command(old?{type:'remove-block',id:old.id}:{type:'add-block',op:'lock',field:f});};
}
$('conflicts').onclick=e=>{const id=e.target.closest('[data-repair-remove]')?.dataset.repairRemove;if(id)command({type:'remove-block',id});};
for(const container of ['palette','blocks'])$(container).addEventListener('dragstart',e=>{
 const b=e.target.closest('[data-add],[data-block-id]');if(!b||e.target.closest('input,select,summary'))return;
 e.dataTransfer.setData('application/json',JSON.stringify(b.dataset.add?{op:b.dataset.add}:{id:b.dataset.blockId}));e.dataTransfer.effectAllowed='copyMove';
});
for(const container of ['blocks','preview3d']){
 const element=$(container);element.addEventListener('dragover',e=>{e.preventDefault();element.classList.add('drag-over');});element.addEventListener('dragleave',()=>element.classList.remove('drag-over'));
 element.addEventListener('drop',e=>{e.preventDefault();element.classList.remove('drag-over');try{const data=JSON.parse(e.dataTransfer.getData('application/json'));if(data.op){const side=e.target.closest('[data-side]')?.dataset.side;if(side)selectedSide=side;addBlock(data.op);}else if(data.id&&container==='blocks'){const target=e.target.closest('[data-block-id]')?.dataset.blockId,ids=intent.blocks.map(b=>b.id).filter(id=>id!==data.id);ids.splice(target?ids.indexOf(target):ids.length,0,data.id);command({type:'reorder',ids});}}catch{}});
}
// Pointer dragging also works on touch screens and browser automation surfaces
// that do not carry HTML DataTransfer. The same add/reorder commands are used.
for(const container of ['palette','blocks']){
 const root=$(container);let moving=null;
 root.addEventListener('pointerdown',e=>{
  if(e.button!==0||e.target.closest('input,select,summary')||(container==='blocks'&&e.target.closest('button')))return;
  const source=e.target.closest(container==='palette'?'[data-add]':'[data-block-id]');if(!source)return;
  e.preventDefault();moving={pointer:e.pointerId,start:[e.clientX,e.clientY],op:source.dataset.add,id:source.dataset.blockId,label:source.textContent.trim(),moved:false};root.setPointerCapture(e.pointerId);
 });
 root.addEventListener('pointermove',e=>{
  if(!moving||moving.pointer!==e.pointerId)return;
  if(Math.hypot(e.clientX-moving.start[0],e.clientY-moving.start[1])>5)moving.moved=true;
  if(!moving.moved)return;
  let ghost=$('drag-ghost');if(!ghost){ghost=document.createElement('div');ghost.id='drag-ghost';document.body.append(ghost);}
  ghost.textContent=moving.op?label(moving.op):'Move relation';ghost.style.left=(e.clientX+12)+'px';ghost.style.top=(e.clientY+12)+'px';
  const over=document.elementFromPoint(e.clientX,e.clientY)?.closest('#blocks,#preview3d');
  for(const id of ['blocks','preview3d'])$(id).classList.toggle('drag-over',over?.id===id);
 });
 root.addEventListener('pointerup',e=>{
  if(!moving||moving.pointer!==e.pointerId)return;const item=moving;moving=null;
  $('drag-ghost')?.remove();for(const id of ['blocks','preview3d'])$(id).classList.remove('drag-over');
  if(root.hasPointerCapture(e.pointerId))root.releasePointerCapture(e.pointerId);
  suppressPaletteClick=performance.now()+350;
  const hit=document.elementFromPoint(e.clientX,e.clientY),destination=hit?.closest('#blocks,#preview3d');
  if(item.op&&(!item.moved||destination)){const side=hit?.closest('[data-side]')?.dataset.side;if(side)selectedSide=side;addBlock(item.op);}
  else if(item.id&&!item.moved)selectBlock(item.id);
  else if(item.id&&!item.id.startsWith('view-')&&item.moved&&destination?.id==='blocks'){
   const target=hit?.closest('[data-block-id]')?.dataset.blockId;if(target===item.id)return;
   const ids=intent.blocks.map(b=>b.id).filter(id=>id!==item.id);ids.splice(target?Math.max(0,ids.indexOf(target)):ids.length,0,item.id);command({type:'reorder',ids});
  }
 });
 root.addEventListener('pointercancel',()=>{moving=null;$('drag-ghost')?.remove();for(const id of ['blocks','preview3d'])$(id).classList.remove('drag-over');});
}
const preview=$('preview3d');
for(const input of document.querySelectorAll('[data-display]')){
 input.checked=display[input.dataset.display];input.onchange=()=>{display[input.dataset.display]=input.checked;try{localStorage.setItem('origami-box-view/1',JSON.stringify(display));}catch{}paint();};
}
$('reset-labels').onclick=()=>{labelLayout.reset();paint();};
let modelDown=null;
new ResizeObserver(()=>{labelLayout.reset();paint();}).observe(preview);
const svgPoint=e=>{const matrix=preview.querySelector('svg')?.getScreenCTM();return matrix?new DOMPoint(e.clientX,e.clientY).matrixTransform(matrix.inverse()):null;};
preview.addEventListener('pointerdown',e=>{
 if(guideSession)return;
 const handle=e.target.closest('[data-handle]'),sideControl=e.target.closest('[data-side]');
 const face=e.target.closest('[data-face]')?.dataset.face,side=face?handles?.surfaces.find(s=>s.panelId===face)?.side:null;
 if(sideControl||(e.ctrlKey&&side)){
  e.stopImmediatePropagation();e.preventDefault();command({type:'toggle-wall',side:sideControl?.dataset.side??side,source:{kind:'direct'}});return;
 }
 if(handle&&e.button===0&&displayed){
  e.stopImmediatePropagation();e.preventDefault();stop();progress=1;$('progress').value=100;
  const shown=displayed,h=shown.handles.handles.find(h=>h.id===handle.dataset.handle);if(!h)return;const p=svgPoint(e),a=shown.project(h.pointMm),b=shown.project(h.pointMm.map((v,i)=>v+h.axis[i]));
  if(h.edge)selectModelPart({edge:h.edge},false);
  else if(h.id!=='length')selectModelPart({panelId:'top'},false);
  if(h.fixed){$('selection-label').textContent=`${h.label}: fixed connection`;return;}
  if(!p||Math.hypot(b[0]-a[0],b[1]-a[1])<.1)return;
  selectedField=h.id;drag={id:e.pointerId,h,start:p,value:h.value??shown.report.values[h.id],session:createDragSession(shown.report.intent),axis:[b[0]-a[0],b[1]-a[1]],key:'drag-'+(++dragSequence),last:performance.now()};preview.setPointerCapture(e.pointerId);draw();return;
 }
 if(e.button===0){if(modelDown&&modelDown.id!==e.pointerId){modelDown=null;return;}const edge=e.target.closest('[data-edge-pick]')?.dataset.edgePick;modelDown=face||edge?{id:e.pointerId,x:e.clientX,y:e.clientY,moved:false,part:{panelId:face,edge},focus:e.pointerType!=='touch'}:null;}
},true);
preview.addEventListener('pointermove',e=>{
 if(modelDown?.id===e.pointerId&&Math.hypot(e.clientX-modelDown.x,e.clientY-modelDown.y)>5)modelDown.moved=true;
 if(!drag||e.pointerId!==drag.id)return;e.stopImmediatePropagation();e.preventDefault();const p=svgPoint(e);if(!p)return;
 const [x,y]=drag.axis,value=drag.value+((p.x-drag.start.x)*x+(p.y-drag.start.y)*y)/(x*x+y*y)*drag.h.factor;
 drag.pending=Number(value.toFixed(2));
 if(performance.now()-drag.last>65){drag.last=performance.now();command(directEdit(drag.h,drag.pending),drag.key,drag.session);}
},true);
function directEdit(h,value){return h.edge?{type:'edge-rise',edge:h.edge,value,source:{kind:'direct'}}:{type:'direct-dimension',field:h.id,value,source:{kind:'direct'}};}
const endDrag=e=>{if(!drag||drag.id!==e.pointerId)return;e.stopImmediatePropagation();if(Number.isFinite(drag.pending))command(directEdit(drag.h,drag.pending),drag.key,drag.session);drag=null;if(preview.hasPointerCapture(e.pointerId))preview.releasePointerCapture(e.pointerId);};
preview.addEventListener('pointerup',endDrag,true);preview.addEventListener('pointercancel',e=>{if(drag?.id===e.pointerId)drag=null;},true);
preview.addEventListener('pointerup',e=>{if(modelDown?.id!==e.pointerId)return;const pick=modelDown;modelDown=null;if(!pick.moved)queueMicrotask(()=>selectModelPart(pick.part,pick.focus));},true);
preview.addEventListener('pointercancel',()=>{modelDown=null;},true);
preview.addEventListener('keydown',e=>{if(guideSession||!['Enter',' '].includes(e.key))return;const side=e.target.closest('[data-side]')?.dataset.side,edge=e.target.closest('[data-edge-pick]')?.dataset.edgePick,panelId=e.target.closest('[data-face]')?.dataset.face;if(side||edge||panelId){e.stopImmediatePropagation();e.preventDefault();if(side)command({type:'toggle-wall',side,source:{kind:'direct'}});else selectModelPart({edge,panelId});}},true);
bindViewControls(preview,{rotate(dx,dy){const a=orbitAngles(azimuth,elevation,dx,dy);azimuth=a.azimuth;elevation=a.elevation;paint();},pan(dx,dy){view.panX+=dx;view.panY+=dy;paint();},zoom(f,x,y){view=zoomAt(view,f,x,y);paint();},reset(){view=defaultView();azimuth=-38;elevation=28;labelLayout.reset();paint();}});
$('side-action').onclick=()=>{if(selectedSide)command({type:'toggle-wall',side:selectedSide,source:{kind:'direct'}});};
$('fit-view').onclick=async()=>{if(!validReport||(guideSession&&!fabrication.state.guide))return;frame=guideSession?frameFromPoints(fabrication.state.guide.framePointsMm):await controller.frame(validReport.spec,'actuation');view=defaultView();azimuth=guideSession?-18:-38;elevation=guideSession?55:28;labelLayout.reset();paint();};
$('fabrication-toggle').onclick=toggleFabrication;
$('guide-prev').onclick=()=>fabrication.step(-1);
$('guide-next').onclick=()=>fabrication.step(1);
$('fabrication-guide').addEventListener('keydown',e=>{if(e.target.closest('summary'))return;if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();fabrication.step(e.key==='ArrowRight'?1:-1);}else if(e.key==='Escape')fabrication.close();});
$('progress').oninput=()=>{stop();progress=+$('progress').value/100;draw();};
$('play').onclick=()=>{
 if(playing){stop();return;}if(report?.status!=='resolved'||!bundle)return;
 playing=true;$('play').textContent='Pause';let last=null,direction=-1;
 function tick(time){if(!playing)return;const dt=last===null?0:Math.min((time-last)/6000,.03);last=time;const lo=bundle.validation.actuation.minimumSampledSafeOpening??1;progress+=direction*dt;if(progress<=lo){progress=lo;direction=1;}if(progress>=1){progress=1;direction=-1;}$('progress').value=progress*100;draw();animationId=requestAnimationFrame(tick);}animationId=requestAnimationFrame(tick);
};
function travel(direction){
 const source=direction==='undo'?undo:redo,destination=direction==='undo'?redo:undo;if(!source.length)return;
 const ticket=++revision;pending();queue=queue.catch(()=>{}).then(async()=>{destination.push(structuredClone(intent));intent=source.pop();mergeKey=null;await accept(await client.call('intent.resolve',{intent}),ticket);});
}
$('undo').onclick=()=>travel('undo');$('redo').onclick=()=>travel('redo');
$('new').onclick=()=>{const ticket=++revision;pending();queue=queue.catch(()=>{}).then(async()=>{remember(null);intent=structuredClone(catalog.initialIntent);frame=null;progress=1;$('progress').value=100;await accept(await client.call('intent.resolve',{intent}),ticket);});};
$('interpret').onclick=()=>{const text=$('statement').value,ticket=++revision;pending();queue=queue.catch(()=>{}).then(async()=>{remember(null);const result=await client.call('intent.interpret',{intent,text});if(result.intent)intent=result.intent;if(ticket===revision)await accept(result,ticket);});};
$('paper').value=paper;$('paper').onchange=()=>{paper=$('paper').value;const ticket=++revision;pending();accept(report,ticket);};
document.querySelectorAll('[data-page]').forEach(button=>button.onclick=()=>{page=button.dataset.page;document.querySelectorAll('[data-page]').forEach(b=>b.setAttribute('aria-selected',String(b===button)));if(bundle)$('sheet').innerHTML=bundle.sheets[page].svg;});
$('save').onclick=async()=>{try{const project=await client.call('intent.export',{intent});download('box-actuator-project.json',JSON.stringify(project,null,2),'application/json');}catch(e){showError(e.message);}};
$('open').onchange=async e=>{
 try{const file=e.target.files[0];if(!file)return;const value=JSON.parse(await file.text());let result;
  if(value.schema==='origami-box/project/1')result=await client.call('intent.open',{project:value});
  else{const spec=await controller.import(value);result=await client.call('intent.fromSpec',{spec});}
  remember(null);intent=result.intent;frame=null;await accept(result,++revision);
 }catch(e){showError(e.message);}finally{$('open').value='';}
};
$('download-svg').onclick=()=>{if(bundle&&report?.status==='resolved'&&bundle.exportable)download('box-actuator-'+page+'.svg',bundle.sheets[page].svg,'image/svg+xml');};
$('print').onclick=()=>{if(bundle&&report?.status==='resolved'&&bundle.exportable)location.href='print.html?paper='+encodeURIComponent(paper)+'&design='+encodeURIComponent(JSON.stringify(validReport.spec));};
await accept(await client.call('intent.resolve',{intent}),++revision);
