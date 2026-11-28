// One-sided finite plastic panels with an inextensible flexible hinge strip.
// A fold consists of straight legs plus a circular arc, length exactly gapMm.
// The hinge may bend; panel positions are always one rigid transform per panel.
import {add,sub,mul,dot,cross,unit,point,points,rotate,turn} from './sheet-folds.mjs';
import {contacts} from './surface-contacts.mjs';
export const panelNormal=p=>unit(cross(p.transform.x,p.transform.y));
export function panelMidSurface(p){return points(p).map(v=>add(v,mul(panelNormal(p),p.thicknessMm/2)));}
export function solidPanelMesh(p){
 const winding=p.uvMm.reduce((s,v,i)=>{const w=p.uvMm[(i+1)%p.uvMm.length];return s+v[0]*w[1]-v[1]*w[0];},0),base=winding<0?points(p).reverse():points(p),top=base.map(v=>add(v,mul(panelNormal(p),p.thicknessMm))),n=base.length;
 return {id:p.id,role:'panel',panelId:p.id,verticesMm:[...base,...top],faces:[Array.from({length:n},(_,i)=>n-1-i),Array.from({length:n},(_,i)=>i+n),...base.map((_,i)=>[i,(i+1)%n,(i+1)%n+n,i+n])],thicknessMm:p.thicknessMm};
}
function pairContacts(panels){
 const hits=[];for(let i=0;i<panels.length;i++)for(let j=i+1;j<panels.length;j++){
  const t=panels[i].thicknessMm;if(Math.abs(t-panels[j].thicknessMm)>1e-9)throw Error('Mixed panel thicknesses need a pairwise prism test.');
  if(contacts([panelMidSurface(panels[i]),panelMidSurface(panels[j])],t).length)hits.push([panels[i].id,panels[j].id]);
 }return hits;
}
function curve(step,progress){
 const theta=step.angleRad*progress,a=step.axisMm[0],u=step.axis,v=step.crossAxis,g=step.gapMm,r=step.radiusMm,arc=Math.abs(theta)*r,leg=(g-arc)/2;
 const parent=add(a,mul(v,-g/2)),bendStart=add(parent,mul(v,leg)),sign=Math.sign(theta)||1,n=cross(u,v),last=rotate(v,[0,0,0],u,theta);
 const at=t=>add(bendStart,add(mul(v,r*sign*Math.sin(t)),mul(n,r*sign*(1-Math.cos(t)))));
 const section=[parent,bendStart];for(let k=1;k<=24;k++)section.push(at(theta*k/24));section.push(add(at(theta),mul(last,leg)));
 const end=section.at(-1),idealEnd=rotate(add(a,mul(v,g/2)),a,u,theta),translation=sub(end,idealEnd);
 return {section,translation,theta,analyticLengthMm:2*leg+arc,legMm:leg};
}
function sampleOperation(step,progress){
 const bend=curve(step,progress),place=p=>{
  if(!step.movingPanelIds.includes(p.id))return p;
  const q=turn(p,step.axisMm[0],step.axis,bend.theta);return {...q,transform:{...q.transform,origin:add(q.transform.origin,bend.translation)}};
 };
 const transformPoint=v=>add(rotate(v,step.axisMm[0],step.axis,bend.theta),bend.translation);
 const strips=step.fromStrips.map(s=>s.id===step.hingeId?{...s,section:bend.section,axisMm:step.axisMm,analyticLengthMm:bend.analyticLengthMm}:step.movingPanelIds.includes(s.parentPanelId)?{...s,section:s.section.map(transformPoint),axisMm:s.axisMm.map(transformPoint)}:s);
 return {panels:step.fromPanels.map(place),strips,bend};
}
export function compileThickFolds(program,{thicknessMm,gapMm,samples=101}){
 if(!Number.isFinite(thicknessMm)||thicknessMm<=0||!Number.isFinite(gapMm)||gapMm<=0)throw Error('Positive thicknessMm and gapMm are required.');
 if(!Number.isInteger(samples)||samples<3||samples>1001)throw Error('Use 3..1001 samples.');
 let panels=structuredClone(program.initial.panels).map(p=>({...p,thicknessMm}));
 let strips=program.hinges.map(h=>{
  const parent=panels.find(p=>p.id===h.parentPanelId),a=h.axisUvMm[0],d=sub(h.axisUvMm[1],a),uv=mul(unit([-d[1],d[0]]),h.movingSide),v=add(mul(parent.transform.x,uv[0]),mul(parent.transform.y,uv[1])),axisMm=h.axisUvMm.map(p=>point(parent,p));
  return {id:h.id,parentPanelId:h.parentPanelId,axisMm,section:[add(axisMm[0],mul(v,-gapMm/2)),add(axisMm[0],mul(v,gapMm/2))],analyticLengthMm:gapMm};
 });
 const initial={panels,strips},steps=[],failures=[];
 for(const op of program.steps){
  const h=program.hinges.find(h=>h.id===op.hingeId),parent=panels.find(p=>p.id===h.parentPanelId),axisMm=h.axisUvMm.map(v=>point(parent,v)),axis=unit(sub(axisMm[1],axisMm[0])),d=sub(h.axisUvMm[1],h.axisUvMm[0]),uv=mul(unit([-d[1],d[0]]),h.movingSide),crossAxis=add(mul(parent.transform.x,uv[0]),mul(parent.transform.y,uv[1]));
  const step={id:op.id,title:op.title,instruction:op.instruction,durationMs:op.durationMs,hingeId:op.hingeId,angleRad:op.angleRad,axisMm,axis,crossAxis,gapMm,radiusMm:0,movingPanelIds:h.movingPanelIds,fromPanels:panels,fromStrips:strips};
  const hit=(r,t)=>{step.radiusMm=r;return pairContacts(sampleOperation(step,t).panels);};
  const limit=gapMm/Math.max(Math.abs(op.angleRad),1e-12),maxR=limit*(1-1e-8);
  let radius=0;
  if(hit(0,1).length){
   if(hit(maxR,1).length){failures.push({stepId:step.id,code:'HINGE_GAP_INSUFFICIENT',pairs:hit(maxR,1)});radius=maxR;}
   else{let lo=0,hi=maxR;for(let k=0;k<32;k++){const mid=(lo+hi)/2;if(hit(mid,1).length)lo=mid;else hi=mid;}radius=Math.min(maxR,Math.ceil((hi+1e-6)*1e5)/1e5);}
  }
  const pathHits=r=>{const all=[],fractions=[...Array.from({length:samples},(_,k)=>k/(samples-1)),1e-5,1e-4,.001,.999,.9999,.99999];for(const progress of fractions){const pairs=hit(r,progress);if(pairs.length)all.push({progress,pairs});}return all;};
  let collisions=pathHits(radius);
  if(collisions.length)for(let k=1;k<=16;k++){const candidate=radius+(maxR-radius)*k/16,hits=pathHits(candidate);if(!hits.length){radius=candidate;collisions=[];break;}}
  step.radiusMm=radius;if(collisions.length)failures.push({stepId:step.id,code:'FINITE_PANEL_INTERFERENCE',samples:collisions});
  const end=sampleOperation(step,1);panels=end.panels;strips=end.strips;steps.push(step);
 }
 return {schema:'origami-box/thick-fold-program/1',thicknessMm,gapMm,initial,steps,failures,scope:'Finite one-sided rigid panels and length-preserving hinge strips. Full loose-film ends are not represented.'};
}
export function thickFoldState(program,{step=0,progress=1}={}){
 if(!Number.isInteger(step)||step<0||step>program.steps.length||!Number.isFinite(progress)||progress<0||progress>1)throw Error('Invalid thick fold state.');
 return step?sampleOperation(program.steps[step-1],progress):program.initial;
}
export function thickPoseValue(state,operation=null){
 const meshes=state.panels.map(solidPanelMesh);
 for(const strip of state.strips){const shift=sub(strip.axisMm[1],strip.axisMm[0]),n=strip.section.length;meshes.push({id:strip.id,role:'hinge',verticesMm:[...strip.section,...strip.section.map(p=>add(p,shift))],faces:Array.from({length:n-1},(_,i)=>[i,i+1,i+1+n,i+n])});}
 return {panels:state.panels.map(p=>({id:p.id,pointsMm:points(p),normal:panelNormal(p),thicknessMm:p.thicknessMm})),film:[],meshes,operation};
}
export function thickPanelContacts(panels){return pairContacts(panels);}
