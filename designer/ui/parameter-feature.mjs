import {esc,fmt,createInputDebounce} from './dom-utils.mjs';
import {modelPick} from './selection.mjs';
// This feature owns parameter forms, block selection and their input lifecycle.
// Its only design effect is an injected semantic command.
export function createParameterFeature({document,catalog,actions,onSelection=()=>{}}){
 const $=id=>document.getElementById(id),command=actions.command,travel=actions.travel,paint=onSelection;
 const debounce=createInputDebounce(),setTimeout=debounce.schedule,clearTimeout=debounce.cancel;
 let intent=structuredClone(catalog.initialIntent),report=null,validReport=null,handles=null;
 let selection=null,selectedSide=null,selectedField='frontWidth',sliderActive=false;
 const label=op=>catalog.features.find(b=>b.id===op)?.label??catalog.blocks.find(b=>b.op===op)?.label??op;
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

 $('side-action').onclick=()=>{if(selectedSide)command({type:'toggle-wall',side:selectedSide,source:{kind:'direct'}});};
 $('interpret').onclick=()=>actions.interpret($('statement').value);
 return {
  get selection(){return selection;},get selectedSide(){return selectedSide;},
  selectModelPart,flush:debounce.flush,cancel:debounce.cancel,
  setHandles(next){handles=next;},
  update(model){
   ({intent,report,validReport,handles}=model);
   if(selection?.virtual){const actual=intent.blocks.find(b=>catalog.blocks.find(c=>c.op===b.op)?.feature===selection.feature&&report?.blockStates?.[b.id]?.active!==false);if(actual)selection={...selection,virtual:false,blockId:actual.id};}
   if(selection?.blockId&&!selection.virtual&&!intent.blocks.some(b=>b.id===selection.blockId)){selection=null;selectedSide=null;$('selection-label').textContent='Drag a handle to change this box';$('side-action').hidden=true;}
   preserveFocus(()=>{renderBlocks();renderDimensions();renderConflicts();});
   if(report?.status==='resolved')$('adjustments').textContent=[...report.adjustments.map(a=>{const f=catalog.fields.find(f=>f.id===a.field);return `${f.label} → ${fmt(a.to)} ${f.unit}`;}),...(report.notes??[])].join(' · ');
  }
 };
}
