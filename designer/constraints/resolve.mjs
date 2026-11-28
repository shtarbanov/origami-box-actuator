// Declarative relations -> solved dimensions. Only this layer requests domain
// checks; input interpreters and views do not contain geometry equations.
import {validateIntent,fields} from '../intent/model.mjs';
import {inspectBox,topologyRelation,longitudinalRelation,hingeRiseForTilt,boxMeasurements} from '../kernel/editor-domain.mjs';
import {describeResolved} from '../intent/description.mjs';
const close=(a,b)=>Math.abs(a-b)<=1e-7*Math.max(1,Math.abs(a),Math.abs(b));
class Conflict extends Error{constructor(code,message,blocks=[],fieldIds=[]){super(message);this.code=code;this.blockIds=[...new Set(blocks.map(b=>typeof b==='string'?b:b.id))];this.fields=fieldIds;}}
function core(input){
 validateIntent(input);const intent=structuredClone(input),v={sideRiseRatio:1,...intent.values},blocks=intent.blocks;
 const walls={left:!blocks.some(b=>b.op==='wall-off'&&b.side==='left'),right:!blocks.some(b=>b.op==='wall-off'&&b.side==='right')};
 const role=Object.fromEntries(fields.map(f=>[f.id,{role:'independent',reason:'Directly adjustable',blockIds:[]}]));
 const locks=new Map();
 for(const b of blocks.filter(b=>b.op==='lock')){
  if(locks.has(b.field)&&!close(locks.get(b.field).value,b.value))throw new Conflict('LOCK_CONFLICT','Two fixed values disagree.',[locks.get(b.field),b],[b.field]);
  locks.set(b.field,b);v[b.field]=b.value;role[b.field]={role:'fixed',reason:'Fixed by a dimension block',blockIds:[b.id]};
 }
 if(intent.lastEdit&&locks.has(intent.lastEdit.field)&&!close(intent.lastEdit.value,locks.get(intent.lastEdit.field).value))throw new Conflict('LOCK_CONFLICT','This dimension is fixed. Remove its fixed-value block to change it.',[locks.get(intent.lastEdit.field)],[intent.lastEdit.field]);
 const statuses=Object.fromEntries(blocks.map(b=>[b.id,{active:true}]));
 function choose(ops){
  let found=blocks.filter(b=>ops.includes(b.op));
  if(found.some(b=>b.strength==='required')){for(const b of found.filter(b=>b.strength==='default'))statuses[b.id]={active:false,reason:'Replaced by an explicit relation'};found=found.filter(b=>b.strength==='required');}
  const value=b=>b.op.startsWith('equal')?1:b.value;
  if(found.some(b=>!close(value(b),value(found[0]))))throw new Conflict('RELATION_CONFLICT','These blocks require different ratios for the same dimensions.',found);
  if(found.some(b=>value(b)<0||(ops.includes('width-ratio')&&value(b)===0)))throw new Conflict('INVALID_RATIO','Use a positive width ratio or a non-negative rise ratio.',found);
  return found.length?{value:value(found[0]),blocks:found}:null;
 }
 let width=choose(['equal-width','width-ratio']),rise=choose(['equal-rise','rise-ratio']);
 for(const [a,b,relation] of [['frontWidth','rearWidth',width],['frontRise','rearRise',rise]]){
  if(relation&&relation.blocks.every(b=>b.strength==='default')&&locks.has(a)&&locks.has(b)&&!close(v[b],v[a]*relation.value)){
   if(relation.blocks.some(b=>b.neutral))throw new Conflict('RESET_CONFLICT','The fixed dimensions prevent this condition from returning to its neutral shape. Unfix a conflicting dimension or undo the removal.',[...relation.blocks,locks.get(a),locks.get(b)],[a,b]);
   relation.blocks.forEach(b=>statuses[b.id]={active:false,reason:'Explicit dimensions override the initial relation'});
   if(a==='frontWidth')width=null;else rise=null;
  }
 }
 let tilts=blocks.filter(b=>b.op==='tilt');
 if(tilts.some(b=>b.strength==='required')||rise?.blocks.some(b=>b.strength==='required')){
  for(const b of tilts.filter(b=>b.strength==='default'))statuses[b.id]={active:false,reason:'Front/rear tilt is determined by an explicit height relation.'};
  tilts=tilts.filter(b=>b.strength==='required');
 }
 if(tilts.some(b=>!close(b.value,tilts[0].value)))throw new Conflict('TILT_CONFLICT','The top has two conflicting tilt targets.',tilts);
 function assign(field,value,sources,reason){
  const lock=locks.get(field);
  if(lock&&!close(lock.value,value))throw new Conflict('LOCK_CONFLICT',`${fields.find(f=>f.id===field).label} is fixed at ${lock.value}, but these relations require ${Number(value.toFixed(4))}.`,[lock,...sources],[field]);
  if(intent.lastEdit?.field===field&&!close(intent.lastEdit.value,value))throw new Conflict('EDIT_CONFLICT',`The requested ${fields.find(f=>f.id===field).label.toLowerCase()} conflicts with these relations.`,sources,[field]);
  v[field]=value;if(!lock)role[field]={role:'dependent',reason,blockIds:sources.map(b=>b.id)};
 }
 function ratioPair(a,b,r,sources,reason){
  sources=[...sources,...[locks.get(a),locks.get(b)].filter(Boolean)];
  if((locks.has(b)||intent.lastEdit?.field===b)&&!locks.has(a)&&intent.lastEdit?.field!==a){
   if(r===0){if(!close(v[b],0))throw new Conflict('RELATION_CONFLICT','A zero ratio requires zero rear rise.',sources,[b]);assign(b,0,sources,reason);}
   else assign(a,v[b]/r,sources,reason);
  }else assign(b,v[a]*r,sources,reason);
 }
 function linear(names,equations){
  const rows=equations.map(e=>({a:names.map(n=>e.coeff[n]??0),b:e.value,source:new Map(e.sources.map(b=>[b.id,b]))}));
  for(const name of names){const block=locks.get(name);if(block)rows.push({a:names.map(n=>n===name?1:0),b:block.value,source:new Map([[block.id,block]])});}
  if(intent.lastEdit&&names.includes(intent.lastEdit.field)){
   const edit={id:'edit:'+intent.lastEdit.field,source:intent.lastEdit.source};
   rows.push({a:names.map(n=>n===intent.lastEdit.field?1:0),b:intent.lastEdit.value,source:new Map([[edit.id,edit]])});
  }
  let pivotRow=0;const pivots=[];
  for(let col=0;col<names.length;col++){
   let selected=-1;for(let row=pivotRow;row<rows.length;row++)if(Math.abs(rows[row].a[col])>1e-10&&(selected<0||Math.abs(rows[row].a[col])>Math.abs(rows[selected].a[col])))selected=row;
   if(selected<0)continue;
   [rows[pivotRow],rows[selected]]=[rows[selected],rows[pivotRow]];const p=rows[pivotRow],factor=p.a[col];p.a=p.a.map(x=>x/factor);p.b/=factor;
   for(let row=0;row<rows.length;row++)if(row!==pivotRow){const r=rows[row],f=r.a[col];if(Math.abs(f)<1e-11)continue;r.a=r.a.map((x,k)=>x-f*p.a[k]);r.b-=f*p.b;for(const [id,b] of p.source)r.source.set(id,b);}
   pivots.push({col,row:pivotRow});pivotRow++;
  }
  for(const row of rows)if(row.a.every(x=>Math.abs(x)<1e-8)&&!close(row.b,0))throw new Conflict('RELATION_CONFLICT','These relations and fixed dimensions cannot hold together.',[...row.source.values()],names);
  const pivotCols=new Set(pivots.map(p=>p.col));
  for(const p of pivots){const row=rows[p.row],field=names[p.col];let value=row.b;for(let k=0;k<names.length;k++)if(!pivotCols.has(k))value-=row.a[k]*v[names[k]];
   const sources=[...row.source.values()];assign(field,value,sources,'Calculated from linked relations and fixed dimensions');
   if(!locks.has(field)&&(intent.lastEdit?.field===field||sources.every(b=>b.id.startsWith('edit:'))))role[field]={role:'independent',reason:'Current driving dimension',blockIds:[]};
  }
 }
 const topologyBlocks=blocks.filter(b=>b.op==='wall-off');
 if(topologyBlocks.length===1&&rise&&rise.blocks.some(b=>b.strength==='required')&&(!width||width.blocks.every(b=>b.strength==='default'))){
  if(width)width.blocks.forEach(b=>statuses[b.id]={active:false,reason:'Width ratio is driven by the rise relation and direct connection'});
  width={value:rise.value,blocks:[...rise.blocks,...topologyBlocks]};
 }
 linear(['rearWidth','frontWidth'],width?[{coeff:{rearWidth:1,frontWidth:-width.value},value:0,sources:width.blocks}]:[]);
 const lateral=choose(['side-rise-ratio']);
 if(lateral)assign('sideRiseRatio',lateral.value,lateral.blocks,'Required by the left/right lift description');
 let topology;
 try{topology=topologyRelation(v,walls);}catch(e){throw new Conflict(e.code,e.message,blocks.filter(b=>b.op==='wall-off'),['left','right']);}
 if(topology){
  for(const b of tilts.filter(b=>b.strength==='default'))statuses[b.id]={active:false,reason:'Front/rear tilt is determined by the direct side connection.'};
  tilts=tilts.filter(b=>b.strength==='required');
  if(lateral)throw new Conflict('DIRECT_SIDE_PROFILE','A directly connected side has zero lift. Remove the finite left/right lift ratio or restore that folding wall.',[...topologyBlocks,...lateral.blocks],['sideRiseRatio']);
  if(rise&&rise.blocks.every(b=>b.strength==='default')){for(const b of rise.blocks)statuses[b.id]={active:false,reason:'Rise ratio is driven by the direct side connection'};rise=null;}
  if(rise&&!close(rise.value,topology.riseRatio))throw new Conflict('HINGE_RATIO_CONFLICT',`The direct side connection requires rear/front rise = rear/front width = ${Number(topology.riseRatio.toFixed(4))}.`,[...topologyBlocks,...rise.blocks,...(width?.blocks??[]),...[locks.get('frontWidth'),locks.get('rearWidth')].filter(Boolean)],['rearRise','rearWidth']);
  rise={value:topology.riseRatio,blocks:[...topologyBlocks,...(rise?.blocks??[]),...(width?.blocks??[]),...[locks.get('frontWidth'),locks.get('rearWidth')].filter(Boolean)]};
 }
 if(tilts.length&&rise?.blocks.every(b=>b.strength==='default')){for(const b of rise.blocks)statuses[b.id]={active:false,reason:'Rise is driven by the tilt target'};rise=null;}
 if(tilts.length){
  const tilt=tilts[0];
  if(topology){
   let target;try{target=hingeRiseForTilt(v,tilt.value);}catch(e){throw new Conflict(e.code,e.message,[...topologyBlocks,...tilts],['frontRise','rearRise']);}
   if(target!==null)assign('frontRise',target,[...tilts,...topologyBlocks],'Calculated from top tilt and the direct connection');
   ratioPair('frontRise','rearRise',rise.value,rise.blocks,'Required by the direct side connection');
  }else{
   let relation;try{relation=longitudinalRelation(v,tilt.value);}catch(e){throw new Conflict(e.code,e.message,tilts);}
   const delta=v.frontRise*(relation.frontCoefficient-1)+v.length*relation.lengthCoefficient;
   if(rise&&close(rise.value,1)&&!close(delta,0))throw new Conflict('TILT_RISE_CONFLICT','Equal rises require 0° longitudinal tilt.',[...tilts,...rise.blocks],['frontRise','rearRise']);
   const equations=[{coeff:{rearRise:1,frontRise:-relation.frontCoefficient,length:-relation.lengthCoefficient},value:0,sources:[...tilts,...(lateral?.blocks??[])]}];
   if(rise)equations.push({coeff:{rearRise:1,frontRise:-rise.value},value:0,sources:rise.blocks});
   linear(['rearRise','frontRise','length'],equations);
  }
 }else if(rise){
  if(topology)ratioPair('frontRise','rearRise',rise.value,rise.blocks,'Required by the direct side connection');
  else linear(['rearRise','frontRise'],[{coeff:{rearRise:1,frontRise:-rise.value},value:0,sources:rise.blocks}]);
 }
 let checked;
 try{checked=inspectBox(v,walls);}catch(e){
  let affected=['length','frontWidth','rearWidth','frontRise','rearRise','sideRiseRatio','gap'];
  if(/minimum hinge-axis width/i.test(e.message))affected=['length','frontWidth','rearWidth','frontRise','rearRise'];
  if(/thickness/i.test(e.message))affected=['thickness'];
  const sources=blocks.filter(b=>b.op==='lock'?affected.includes(b.field):!b.op.startsWith('equal')||b.strength==='required');
  throw new Conflict(e.code??'GEOMETRY_LIMIT',e.message,sources,affected);
 }
 const measurements=boxMeasurements(checked.spec),description=describeResolved({values:v,walls,measurements});
 return {intent:{...intent,values:v,lastEdit:null},spec:checked.spec,values:v,walls,measurements,description,roles:role,blockStates:statuses,
  notes:blocks.filter(b=>b.neutral&&statuses[b.id]?.active===false).map(b=>statuses[b.id].reason),
  adjustments:fields.filter(f=>input.values[f.id]!==undefined&&!close(input.values[f.id],v[f.id])).map(f=>({field:f.id,from:input.values[f.id],to:v[f.id],reason:role[f.id].reason}))};
}
function localRange(current,feasible,lower=0){
 let min=lower,max=null,lowerTested=lower,upperTested=current;
 let good=current,bad=null;
 for(let i=0;i<22;i++){const next=lower+(good-lower)*.65;if(next-lower<1e-6){if(feasible(lower))good=lower;else bad=lower;break;}if(feasible(next))good=next;else{bad=next;break;}}
 if(bad!==null){let a=bad,b=good;for(let i=0;i<15;i++){const m=(a+b)/2;if(feasible(m))b=m;else a=m;}min=b;}else min=good;
 lowerTested=min;good=current;bad=null;
 for(let i=0;i<16;i++){const next=Math.max(good*1.4,good+1);if(feasible(next))good=next;else{bad=next;break;}}
 if(bad!==null){let a=good,b=bad;for(let i=0;i<15;i++){const m=(a+b)/2;if(feasible(m))a=m;else b=m;}max=a;}
 upperTested=good;
 return {min,max,lowerTested,upperTested,method:'local numerical branch',scope:'Construction geometry only; physical collision and paper fit are checked separately.'};
}
export function resolveIntent(input,{ranges=true}={}){
 try{
  const solved=core(input),descriptors=fields.map(f=>({...f,...solved.roles[f.id]}));
  if(ranges)for(const f of descriptors.filter(f=>!f.hiddenDimension)){
   if(f.role==='fixed')f.range={min:solved.values[f.id],max:solved.values[f.id],method:'fixed'};
   else if(f.role==='independent'){
    const probe=x=>{try{const candidate=structuredClone(solved.intent);candidate.values[f.id]=x;candidate.lastEdit={field:f.id,value:x};core(candidate);return true;}catch{return false;}};
    f.range=localRange(solved.values[f.id],probe);
   }
  }
  const blockRanges={};
  if(ranges)for(const block of solved.intent.blocks.filter(b=>['equal-width','equal-rise','width-ratio','rise-ratio','side-rise-ratio','tilt'].includes(b.op)&&solved.blockStates[b.id].active)){
   const probe=value=>{try{const candidate=structuredClone(solved.intent),b=candidate.blocks.find(b=>b.id===block.id);if(b.op==='equal-width')b.op='width-ratio';if(b.op==='equal-rise')b.op='rise-ratio';b.value=value;b.strength='required';candidate.lastEdit=null;core(candidate);return true;}catch{return false;}};
   if(block.op!=='tilt')blockRanges[block.id]=localRange(block.op.startsWith('equal')?1:block.value,probe);
   else{
    const boundary=(direction)=>{let good=block.value,bad=null;for(let value=good+direction*5;Math.abs(value)<90;value+=direction*5){if(probe(value))good=value;else{bad=value;break;}}if(bad===null)bad=direction*89.999;
     for(let i=0;i<16;i++){const mid=(good+bad)/2;if(probe(mid))good=mid;else bad=mid;}return good;};
    blockRanges[block.id]={min:boundary(-1),max:boundary(1),method:'local numerical branch'};
   }
  }
  return {status:'resolved',...solved,fields:descriptors,blockRanges,rangeNote:'Ranges describe the connected numerical construction branch around this design, not certified global motion limits.',conflicts:[]};
 }catch(e){return {status:'conflict',intent:structuredClone(input),conflicts:[{code:e.code??'INVALID_INTENT',message:e.message,blockIds:e.blockIds??[],fields:e.fields??[],repairs:(e.blockIds??[]).map(id=>({label:'Remove this condition',command:{type:'remove-block',id}}))}]};}
}
