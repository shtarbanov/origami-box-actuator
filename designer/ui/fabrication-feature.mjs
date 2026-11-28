import {createFabricationPlayer} from './fabrication-player.mjs';
import {fabricationSVG} from './fabrication-render.mjs';
// All guide lifecycle, DOM and leases live here. The viewer is a supplied port,
// and the design editor is a supplied lock; neither imports this feature.
export function createFabricationFeature({document,call,getDesign,prepare,acquire,viewport,reducedMotion=false}){
 const $=id=>document.getElementById(id),preview=$('preview3d');let lease=null,opening=false;
 const player=createFabricationPlayer(call,render,{reducedMotion});
 function render(state){
  if(!lease)return;
  if(!state.active){
   const saved=lease;lease=null;saved.viewer?.release();saved.release();
   for(const [element,inert] of saved.inert)element.inert=inert;
   document.body.classList.remove('fabricating');$('fabrication-guide').hidden=true;$('fabrication-toggle').textContent='Fabrication guide';$('fabrication-toggle').setAttribute('aria-expanded','false');
   $('status').textContent=saved.status;preview.setAttribute('aria-label',saved.ariaLabel);
   if(state.error){$('edit-feedback').textContent=state.error;$('edit-feedback').hidden=false;}return;
  }
  $('guide-prev').disabled=state.busy||state.index===0;$('guide-next').disabled=state.busy||!state.guide||state.index===state.guide.stages.length-1;
  $('fabrication-guide').setAttribute('aria-busy',String(state.busy));$('status').textContent='Fabrication guide';
  if(state.guide){
   if(!lease.viewer)lease.viewer=viewport.enterMode({renderer:fabricationSVG,framePointsMm:state.guide.framePointsMm});
   const stage=state.guide.stages[state.index];$('guide-title').textContent=`${state.index+1} / ${state.guide.stages.length} · ${stage.title}`;$('guide-instruction').textContent=state.error??stage.instruction;
   const v=state.validation;if(v)$('guide-checks').textContent=v.summary??`Rigid distance error ${v.maxDistanceErrorMm.toExponential(2)} mm · hinge / closure error ${Math.max(v.maxHingeErrorMm,v.maxClosureErrorMm).toExponential(2)} mm · matched seal guides ${v.maxSealMismatchMm.toExponential(2)} mm. Ideal mid-surfaces; film pleats and thickness need physical validation. Tool and inlet geometry are illustrative. Back steps rewind the explanation.`;
   if(state.pose)lease.viewer.show(state.pose);
  }
 }
 async function toggle(){
  if(lease){player.close();return;}if(opening)return;opening=true;
  try{
   await prepare();const model=getDesign();if(model.report?.status!=='resolved'||!model.validReport)return;
   lease={release:acquire(),viewer:null,status:$('status').textContent,ariaLabel:preview.getAttribute('aria-label'),inert:[...document.querySelectorAll('.relations,.dimensions,header nav,.templates-head,#model-editor,.selection')].map(e=>[e,e.inert])};
   for(const [element] of lease.inert)element.inert=true;
   document.body.classList.add('fabricating');$('fabrication-guide').hidden=false;$('fabrication-toggle').textContent='Exit guide';$('fabrication-toggle').setAttribute('aria-expanded','true');
   $('guide-title').textContent='Loading fabrication steps…';$('guide-instruction').textContent='';$('guide-checks').textContent='';
   preview.setAttribute('aria-label','Fabrication guide. Left drag pans, right drag rotates, wheel or pinch zooms. Use the previous and next step buttons below.');
   await player.open(model.validReport.spec);
  }finally{opening=false;}
 }
 $('fabrication-toggle').onclick=toggle;$('guide-prev').onclick=()=>player.step(-1);$('guide-next').onclick=()=>player.step(1);
 $('fabrication-guide').addEventListener('keydown',e=>{if(e.target.closest('summary'))return;if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();player.step(e.key==='ArrowRight'?1:-1);}else if(e.key==='Escape')player.close();});
 return {toggle,close:()=>player.close(),get active(){return !!lease;}};
}
