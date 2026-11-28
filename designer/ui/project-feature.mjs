import {download,esc} from './dom-utils.mjs';
// Files, history controls, paper/templates and calculation feedback.
export function createProjectFeature({document,session}){
 const $=id=>document.getElementById(id);let page='folding';
 function showError(message){$('status').textContent='Condition conflict';$('conflicts').hidden=false;$('conflicts').innerHTML=`<h3>Could not apply this change</h3><p>${esc(message)}</p><button id="revert-error">Undo change</button>`;$('revert-error').onclick=()=>session.travel('undo');}
 function update(model){
  const {phase,bundle,report,paper}=model;$('undo').disabled=!model.canUndo;$('redo').disabled=!model.canRedo;
  if(phase==='pending'){$('status').textContent='Updating…';for(const id of ['save','download-svg','print'])$(id).disabled=true;return;}
  if(phase==='error'){showError(model.error);return;}
  if(phase==='conflict'){$('status').textContent=model.validReport?'Previous valid design · resolve conditions':'Resolve conditions';return;}
  if(phase==='rejected'){$('status').textContent='Showing last valid design';$('edit-feedback').textContent=model.error;$('edit-feedback').hidden=false;return;}
  if(!['ready','restored'].includes(phase)||!bundle)return;
  $('save').disabled=false;$('edit-feedback').hidden=true;$('paper').value=paper;$('sheet').innerHTML=bundle.sheets[page].svg;
  const a=bundle.validation.actuation,b=bundle.validation.assembly,reasons=[],paperFits=Object.values(bundle.sheets).every(s=>s.fit);
  if(!paperFits)reasons.push(`${a.numericalPass&&b.sampledPass?'The design is valid but its templates':'The templates'} exceed ${paper}. Change the paper size for printing.`);
  if(!a.numericalPass)reasons.push('Rigid geometry or folding checks failed.');if(!b.sampledPass)reasons.push('The sampled assembly path has interference or a closure error.');if(a.minimumSampledSafeOpening===null)reasons.push('No thickness-clear fully open sample was found.');
  $('paper-note').textContent=reasons.length?reasons.join(' '):`${paper} · Print at actual size`;
  $('status').textContent=!a.numericalPass?'Folding geometry needs review':!b.sampledPass?'Assembly path needs review':a.minimumSampledSafeOpening===null?'Panel clearance needs review':!paperFits?'Design valid · paper too small':'Design resolved';
  for(const id of ['download-svg','print']){$(id).disabled=!bundle.exportable;$(id).title=!paperFits?'The selected paper is too small; the actuator geometry remains editable.':'';}
  $('validation').textContent=`Rigid error ${a.maxRigidErrorMm.toExponential(2)} mm · closure ${a.maxSeamErrorMm.toExponential(2)} mm · assembly ${b.sampledPass?'passed':'needs review'} · sampled thickness clearance starts at ${a.minimumSampledSafeOpening===null?'no safe open sample':Math.round(a.minimumSampledSafeOpening*100)+'%'} · ${bundle.analysis.mobility.genericSampledDof} sampled ideal internal freedoms.`;
 }
 $('undo').onclick=()=>session.travel('undo');$('redo').onclick=()=>session.travel('redo');$('new').onclick=()=>session.newDesign();
 $('paper').onchange=()=>session.setPaper($('paper').value);
 document.querySelectorAll('[data-page]').forEach(button=>button.onclick=()=>{page=button.dataset.page;document.querySelectorAll('[data-page]').forEach(b=>b.setAttribute('aria-selected',String(b===button)));if(session.state.bundle)$('sheet').innerHTML=session.state.bundle.sheets[page].svg;});
 $('save').onclick=async()=>{try{download(document,'box-actuator-project.json',JSON.stringify(await session.export(),null,2),'application/json');}catch(e){showError(e.message);}};
 $('open').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;const value=JSON.parse(await file.text());await session.open(value);}catch(e){showError(e.message);}finally{$('open').value='';}};
 $('download-svg').onclick=()=>{const {bundle,report}=session.state;if(bundle&&report?.status==='resolved'&&bundle.exportable)download(document,'box-actuator-'+page+'.svg',bundle.sheets[page].svg,'image/svg+xml');};
 $('print').onclick=()=>{const {bundle,report,validReport,paper}=session.state;if(bundle&&report?.status==='resolved'&&bundle.exportable)location.href='print.html?paper='+encodeURIComponent(paper)+'&design='+encodeURIComponent(JSON.stringify(validReport.spec));};
 return {update,showError};
}
