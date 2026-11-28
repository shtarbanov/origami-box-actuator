import {cameraForFrame,frameFromPoints} from './camera.mjs';
import {sceneSVG} from './render.mjs';
import {selectionTarget,directionColors} from './selection.mjs';
import {createLabelLayout,createFrameScheduler} from './label-layout.mjs';
import {createDragSession} from './drag-session.mjs';
import {bindViewControls,defaultView,orbitAngles,viewPoint,zoomAt} from '../view-controls.mjs';
import {fmt} from './dom-utils.mjs';
export function createViewportFeature({document,actions,getSelection,getDefaultFrame,storage=null}){
 const $=id=>document.getElementById(id),preview=$('preview3d');
 const command=actions.command,selectModelPart=actions.selectModelPart,stop=actions.prepareEdit,draw=actions.refresh;
 let frame=null,view=defaultView(),azimuth=-38,elevation=28,scene=null,handles=null,bundle=null,displayed=null,mode=null;
 let progress=1,drag=null,modelDown=null,dragSequence=0,selectedField=null;
 const labelLayout=createLabelLayout(),display={directions:true,labels:true,highlights:true,guides:true,handles:true};
 try{const saved=JSON.parse(storage?.getItem('origami-box-view/1'));for(const key of Object.keys(display))if(typeof saved?.[key]==='boolean')display[key]=saved[key];}catch{}
 const schedulePaint=createFrameScheduler(paintScene,callback=>requestAnimationFrame(callback));
function camera(){return frame?cameraForFrame(frame,azimuth,elevation):null;}
function screenPoint(point){return viewPoint(camera().project(point),view);}
function paint(){schedulePaint();}
function paintScene(){
 if(mode&&mode.pose&&frame){putSVG(mode.renderer(mode.pose,camera(),view));return;}
 const {selection,selectedSide}=getSelection(),intent=scene?.report.intent;
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
 putSVG(svg.replace('</svg>',overlay+'</svg>'));
 if(display.highlights&&selectedSide)for(const f of $('preview3d').querySelectorAll('[data-face]'))if(f.dataset.face.startsWith(selectedSide))f.setAttribute('stroke','#c09c56');
 $('progress-value').textContent=Math.round(progress*100)+'%';
 displayed={report:scene.report,handles,scene,frame,bundle,project:screenPoint};
}
function putSVG(svg){const width=330*preview.clientWidth/Math.max(1,preview.clientHeight);preview.innerHTML=svg.replace('viewBox="0 0 720 330"',`viewBox="${360-width/2} 0 ${width} 330"`);}
for(const input of document.querySelectorAll('[data-display]')){
 input.checked=display[input.dataset.display];input.onchange=()=>{display[input.dataset.display]=input.checked;try{storage?.setItem('origami-box-view/1',JSON.stringify(display));}catch{}paint();};
}
$('reset-labels').onclick=()=>{labelLayout.reset();paint();};

// A temporary mode or responsive resize must not discard the user's stable
// label offsets. Re-layout remains an explicit Display/Fit operation.
new ResizeObserver(paint).observe(preview);
const svgPoint=e=>{const matrix=preview.querySelector('svg')?.getScreenCTM();return matrix?new DOMPoint(e.clientX,e.clientY).matrixTransform(matrix.inverse()):null;};
preview.addEventListener('pointerdown',e=>{
 if(mode)return;
 const handle=e.target.closest('[data-handle]'),sideControl=e.target.closest('[data-side]');
 const face=e.target.closest('[data-face]')?.dataset.face,side=face?handles?.surfaces.find(s=>s.panelId===face)?.side:null;
 if(sideControl||(e.ctrlKey&&side)){
  e.stopImmediatePropagation();e.preventDefault();command({type:'toggle-wall',side:sideControl?.dataset.side??side,source:{kind:'direct'}});return;
 }
 if(handle&&e.button===0&&displayed){
  e.stopImmediatePropagation();e.preventDefault();stop();
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
preview.addEventListener('keydown',e=>{if(mode||!['Enter',' '].includes(e.key))return;const side=e.target.closest('[data-side]')?.dataset.side,edge=e.target.closest('[data-edge-pick]')?.dataset.edgePick,panelId=e.target.closest('[data-face]')?.dataset.face;if(side||edge||panelId){e.stopImmediatePropagation();e.preventDefault();if(side)command({type:'toggle-wall',side,source:{kind:'direct'}});else selectModelPart({edge,panelId});}},true);
bindViewControls(preview,{rotate(dx,dy){const a=orbitAngles(azimuth,elevation,dx,dy);azimuth=a.azimuth;elevation=a.elevation;paint();},pan(dx,dy){view.panX+=dx;view.panY+=dy;paint();},zoom(f,x,y){view=zoomAt(view,f,x,y);paint();},reset(){view=defaultView();azimuth=-38;elevation=28;labelLayout.reset();paint();}});

 $('fit-view').onclick=async()=>{if(mode){frame=frameFromPoints(mode.framePointsMm);}else{const next=await getDefaultFrame();if(!next)return;frame=next;}view=defaultView();azimuth=mode?-18:-38;elevation=mode?55:28;labelLayout.reset();paint();};
 return {
  paint,get frame(){return frame;},getDisplayed:()=>displayed,
  clearFrame(){frame=null;},
  present(model){({handles,bundle,progress}=model);scene={pose:model.pose,report:model.report};if(!frame)frame=model.frame;paint();},
  restoreVisible(snapshot){if(!snapshot)return;scene=snapshot.scene;handles=snapshot.handles;frame=snapshot.frame;bundle=snapshot.bundle;displayed=snapshot;paint();},
  enterMode({renderer,framePointsMm}){
   if(mode)throw Error('Another viewer mode is active.');
   const saved={frame,view,azimuth,elevation,displayed},lease={renderer,framePointsMm,pose:null};
   if(drag&&preview.hasPointerCapture(drag.id))preview.releasePointerCapture(drag.id);drag=null;modelDown=null;
   mode=lease;frame=frameFromPoints(framePointsMm);view=defaultView();azimuth=-18;elevation=55;
   return {show(pose){if(mode===lease){lease.pose=pose;paint();}},release(){if(mode!==lease)return;mode=null;({frame,view,azimuth,elevation,displayed}=saved);paint();}};
  }
 };
}
