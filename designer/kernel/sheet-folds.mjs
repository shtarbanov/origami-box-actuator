// Headless, material-coordinate hinge-fold programs. No actuator family or UI.
import {contacts,panelsCoplanar} from './surface-contacts.mjs';
const distance=(a,b)=>Math.hypot(...a.map((x,i)=>x-b[i]));
export const add=(a,b)=>a.map((x,i)=>x+b[i]),sub=(a,b)=>a.map((x,i)=>x-b[i]),mul=(a,s)=>a.map(x=>x*s);
export const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const unit=v=>mul(v,1/Math.hypot(...v));
export const identity=()=>({origin:[0,0,0],x:[1,0,0],y:[0,1,0]});
export const point=(patch,p)=>add(patch.transform.origin,add(mul(patch.transform.x,p[0]),mul(patch.transform.y,p[1])));
export const points=patch=>patch.uvMm.map(p=>point(patch,p));
export const area=uv=>Math.abs(uv.reduce((sum,a,i)=>{const b=uv[(i+1)%uv.length];return sum+a[0]*b[1]-a[1]*b[0];},0))/2;
export function rotate(v,a,u,t){const q=sub(v,a),c=Math.cos(t),s=Math.sin(t);return add(a,add(add(mul(q,c),mul(cross(u,q),s)),mul(u,dot(u,q)*(1-c))));}
export function turn(p,a,u,t){const f=p.transform;return {...p,transform:{origin:rotate(f.origin,a,u,t),x:rotate(f.x,[0,0,0],u,t),y:rotate(f.y,[0,0,0],u,t)}};}
export function inPolygon(p,poly){let sign=0;for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],d=(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);if(Math.abs(d)<1e-7)continue;const s=Math.sign(d);if(sign&&sign!==s)return false;sign=s;}return true;}
export function clipUV(patch,origin,normal,side){
 const output=[],uv=patch.uvMm,level=v=>side*dot(sub(v,origin),normal);
 for(let i=0;i<uv.length;i++){
  const p=uv[i],q=uv[(i+1)%uv.length],d=level(p),e=level(q);
  if(d>=-1e-9)output.push(p);
  if(d>1e-9&&e < -1e-9||d < -1e-9&&e>1e-9)output.push(p.map((x,j)=>x+(q[j]-x)*d/(d-e)));
 }
 const clean=output.filter((p,i)=>i===0||distance(p,output[i-1])>1e-8);
 if(clean.length>2&&distance(clean[0],clean.at(-1))<1e-8)clean.pop();
 return clean.length>=3&&area(clean)>1e-8?{...patch,uvMm:clean}:null;
}
function sharedMaterialPoints(a,b){
 return [...a.uvMm.filter(v=>inPolygon(v,b.uvMm)),...b.uvMm.filter(v=>inPolygon(v,a.uvMm))];
}
function overlapCenter(a,b){
 // Invert b's world polygon into a's material frame, then convex-clip a.
 const toUV=p=>{const q=sub(p,a.transform.origin);return [dot(q,a.transform.x),dot(q,a.transform.y)];};
 const poly=points(b).map(toUV),center=mul(poly.reduce(add,[0,0]),1/poly.length);let result=a;
 for(let i=0;i<poly.length&&result;i++){
  const v=poly[i],edge=sub(poly[(i+1)%poly.length],v),n=[-edge[1],edge[0]],side=Math.sign(dot(sub(center,v),n))||1;
  result=clipUV(result,v,n,side);
 }
 return result?point(a,mul(result.uvMm.reduce(add,[0,0]),1/result.uvMm.length)):null;
}
const snapshot=items=>items.map(p=>({id:p.id,region:p.region,stackLevel:p.stackLevel??0,uvMm:p.uvMm.map(v=>[...v]),pointsMm:points(p),...(p.anchorsUvMm?{anchorsMm:Object.fromEntries(Object.entries(p.anchorsUvMm).map(([id,v])=>[id,point(p,v)]))}:{})}));

// Hinges explicitly define a material line, parent panel and moving panel IDs.
// Film on the moving material side follows the hinge, even when folded back
// across its world-space axis. This is essential for swinging a doubled wall.
export function compileSheetFolds(model,operations){
 let film=structuredClone(model.film),panels=structuredClone(model.panels);
 const steps=[];
 for(const operation of operations){
  const hinge=model.hinges.find(h=>h.id===operation.hingeId);
  if(!hinge)throw Error('Unknown hinge: '+operation.hingeId);
  if(!Number.isFinite(operation.angleRad)||Math.abs(operation.angleRad)>Math.PI+1e-9)throw Error('Fold angle must be finite and within +/- pi.');
  const parent=panels.find(p=>p.id===hinge.parentPanelId),axisMm=hinge.axisUvMm.map(v=>point(parent,v)),axis=unit(sub(axisMm[1],axisMm[0]));
  const [a,b]=hinge.axisUvMm,edge=sub(b,a),normal=[-edge[1],edge[0]],pieces=[];
  for(const patch of film)for(const moving of [false,true]){
   const piece=clipUV(patch,a,normal,moving?hinge.movingSide:-hinge.movingSide);
   if(piece)pieces.push({...piece,id:patch.id+'-'+steps.length+(moving?'m':'s'),moving});
  }
  const step={...operation,axisMm,film:pieces,panels:panels.map(p=>({...p,moving:hinge.movingPanelIds.includes(p.id)}))};
  const end=sampleStep(step,1),near=sampleStep(step,1-1e-5),ranks=pieces.map(p=>p.stackLevel??0),range=Math.max(...ranks)-Math.min(...ranks)+1;
  film=end.film.map((p,i)=>{
   if(!pieces[i].moving)return p;
   const arrival=points(near.film[i]).reduce((sum,v)=>sum+v[2],0)/near.film[i].uvMm.length;
   return {...p,stackLevel:arrival>=0?Math.max(...ranks)+range-(p.stackLevel??0):Math.min(...ranks)-range-(p.stackLevel??0)};
  });panels=end.panels;step.endFilm=film;steps.push(step);
 }
 return {schema:'origami-box/sheet-fold-program/1',initial:structuredClone({film:model.film,panels:model.panels}),hinges:structuredClone(model.hinges),steps};
}
function sampleStep(step,progress){
 const a=step.axisMm[0],u=unit(sub(step.axisMm[1],a)),place=p=>p.moving?turn(p,a,u,step.angleRad*progress):p;
 return {film:step.film.map(place),panels:step.panels.map(place)};
}
export function sampleSheetFolds(program,{step=0,progress=1}={}){
 if(!Number.isInteger(step)||step<0||step>program.steps.length||!Number.isFinite(progress)||progress<0||progress>1)throw Error('Invalid fold state.');
 let state=step===0?program.initial:sampleStep(program.steps[step-1],progress);const operation=step?program.steps[step-1]:null;
 if(operation&&progress===1)state={...state,film:operation.endFilm};
 const flatStack=state.film.every(p=>points(p).every(v=>Math.abs(v[2])<1e-6));
 return {schema:'origami-box/sheet-fold-pose/1',state:{step,progress},stackOrderStatus:flatStack?'horizontal-flat-stack':'unresolved-away-from-flat-stack',operation:operation?{id:operation.id,title:operation.title,instruction:operation.instruction,durationMs:operation.durationMs,hingeId:operation.hingeId,axisMm:operation.axisMm.map(v=>[...v]),angleRad:operation.angleRad,movingPanelIds:operation.panels.filter(p=>p.moving).map(p=>p.id)}:null,film:snapshot(state.film).map(p=>({...p,stackLevel:flatStack?p.stackLevel:null})),panels:snapshot(state.panels)};
}
export function auditSheetFolds(program,{samples=101}={}){
 if(!Number.isInteger(samples)||samples<3||samples>501)throw Error('Use 3..501 samples.');
 let maxRigidDistanceErrorMm=0,maxFilmDistanceErrorMm=0,maxFilmContinuityErrorMm=0,maxPanelAttachmentErrorMm=0,maxAreaErrorMm2=0,maxHingeErrorMm=0,stackOrderAuditComplete=true,worstFilmContinuity=null;
 const filmCrossings=[],panelCrossings=[],stackViolations=[],referenceArea=program.initial.film.reduce((s,p)=>s+area(p.uvMm),0);
 for(const step of program.steps){
  const start=sampleStep(step,0),near=sampleStep(step,1e-5),ps=start.film.map(points);
  if(ps.flat().some(p=>Math.abs(p[2])>1e-6))stackOrderAuditComplete=false;
  for(const [i,j] of contacts(ps,0))if(panelsCoplanar(ps[i],ps[j])){
   const p=overlapCenter(start.film[i],start.film[j]);if(!p)continue;
   const departure=index=>{const item=start.film[index],q=sub(p,item.transform.origin),uv=[dot(q,item.transform.x),dot(q,item.transform.y)];return point(near.film[index],uv)[2]-p[2];};
   const dz=departure(i)-departure(j),order=(start.film[i].stackLevel??0)-(start.film[j].stackLevel??0);
   if(order===0&&Math.abs(dz)>1e-10)stackOrderAuditComplete=false;
   if(dz*order < -1e-10)stackViolations.push({stepId:step.id,patchIds:[start.film[i].id,start.film[j].id]});
  }
  for(let k=0;k<samples;k++){
   const t=k/(samples-1),state=sampleStep(step,t),filmPolys=state.film.map(points),panelPolys=state.panels.map(points);
   const hits=items=>contacts(items,0).filter(([i,j])=>!panelsCoplanar(items[i],items[j]));
   const f=hits(filmPolys),p=hits(panelPolys);if(f.length)filmCrossings.push({stepId:step.id,progress:t,pairs:f});if(p.length)panelCrossings.push({stepId:step.id,progress:t,pairs:p});
   for(const [kind,items] of [['film',state.film],['panel',state.panels]])for(const item of items){
    const vs=points(item);for(let i=0;i<vs.length;i++)for(let j=i+1;j<vs.length;j++){
     const error=Math.abs(distance(vs[i],vs[j])-distance(item.uvMm[i],item.uvMm[j]));
     if(kind==='film')maxFilmDistanceErrorMm=Math.max(maxFilmDistanceErrorMm,error);else maxRigidDistanceErrorMm=Math.max(maxRigidDistanceErrorMm,error);
    }
   }
   for(let i=0;i<state.film.length;i++)for(let j=i+1;j<state.film.length;j++)for(const uv of sharedMaterialPoints(state.film[i],state.film[j])){
    const a=point(state.film[i],uv),b=point(state.film[j],uv),error=distance(a,b);
    if(error>maxFilmContinuityErrorMm){maxFilmContinuityErrorMm=error;worstFilmContinuity={stepId:step.id,progress:t,patchIds:[state.film[i].id,state.film[j].id],materialPointMm:[...uv],pointsMm:[a,b],errorMm:error};}
   }
   for(const panel of state.panels)for(const uv of [...panel.uvMm,mul(panel.uvMm.reduce(add,[0,0]),1/panel.uvMm.length)]){
    const attached=state.film.filter(p=>inPolygon(uv,p.uvMm));if(!attached.length)maxPanelAttachmentErrorMm=Infinity;
    for(const patch of attached)maxPanelAttachmentErrorMm=Math.max(maxPanelAttachmentErrorMm,distance(point(patch,uv),point(panel,uv)));
   }
   for(const hinge of program.hinges){const parent=state.panels.find(p=>p.id===hinge.parentPanelId),child=state.panels.find(p=>p.id===hinge.movingPanelIds[0]);for(const uv of hinge.axisUvMm)maxHingeErrorMm=Math.max(maxHingeErrorMm,distance(point(parent,uv),point(child,uv)));}
   maxAreaErrorMm2=Math.max(maxAreaErrorMm2,Math.abs(state.film.reduce((s,p)=>s+area(p.uvMm),0)-referenceArea));
  }
 }
 return {samplesPerFold:samples,maxRigidDistanceErrorMm,maxFilmDistanceErrorMm,maxFilmContinuityErrorMm,maxPanelAttachmentErrorMm,maxHingeErrorMm,maxAreaErrorMm2,filmCrossings,panelCrossings,stackViolations,stackOrderAuditComplete,worstFilmContinuity,
  sampledPass:stackOrderAuditComplete&&Math.max(maxRigidDistanceErrorMm,maxFilmDistanceErrorMm,maxFilmContinuityErrorMm,maxPanelAttachmentErrorMm,maxHingeErrorMm,maxAreaErrorMm2)<1e-6&&!filmCrossings.length&&!panelCrossings.length&&!stackViolations.length,
  scope:'Material-isometric zero-thickness patches, continuous shared boundaries, attached rigid panels, sampled crossings and departures from horizontal flat stacks. Not finite-thickness or pneumatic validation.'};
}
