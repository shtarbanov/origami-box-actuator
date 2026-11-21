// Convert a geometric manipulation goal to existing intent commands. The UI
// supplies a target midpoint height, never box-folding equations or vertices.
import {applyCommand} from '../intent/model.mjs';
import {resolveIntent} from './resolve.mjs';
export function resolveEdgeEdit(input,{edge,value,source={kind:'direct'}}){
 if(!['front','rear','left','right'].includes(edge)||!Number.isFinite(value)||value<0)throw Error('Select an edge and a finite non-negative midpoint height.');
 const base=resolveIntent(input,{ranges:false});if(base.status!=='resolved')return base;
 const key=edge+'MidRise',side=['left','right'].includes(edge),hinge=!base.walls.left||!base.walls.right;
 if(side&&!base.walls[edge])return {status:'conflict',intent:structuredClone(input),conflicts:[{code:'FIXED_EDGE_RISE',message:`The ${edge} edge is connected directly to the base and has zero rise. Restore its folding wall to raise it.`,blockIds:input.blocks.filter(b=>b.op==='wall-off'&&b.side===edge).map(b=>b.id),fields:[],repairs:[]}]};
 const field=edge==='rear'?'rearRise':'frontRise';
 const initial=side&&!hinge?base.measurements[edge==='left'?'frontLeftRise':'frontRightRise']:base.values[field];
 const candidate=x=>applyCommand(base.intent,side&&!hinge?{type:'direct-side-rise',side:edge,value:x,source}:{type:'direct-dimension',field,value:x,source});
 let x=initial,current=base,lastDraft=base.intent;
 for(let k=0;k<8;k++){
  const error=value-current.measurements[key];
  if(Math.abs(error)<1e-7*Math.max(1,value))return resolveIntent(current.intent);
  let probe=null,step=Math.max(1e-4,Math.abs(x)*1e-5)*Math.sign(error),lastFailure=null;
  for(const sign of [1,-1]){try{const draft=candidate(x+sign*step),r=resolveIntent(draft,{ranges:false});if(r.status==='resolved'){probe=r;step*=sign;break;}lastFailure=r;}catch{}}
  if(!probe)return lastFailure??{status:'conflict',intent:structuredClone(input),conflicts:[{code:'FIXED_EDGE_RISE',message:'The current fixed dimensions prevent this edge height from changing.',blockIds:input.blocks.filter(b=>b.op==='lock').map(b=>b.id),fields:[],repairs:[]}]};
  const derivative=(probe.measurements[key]-current.measurements[key])/step;
  if(Math.abs(derivative)<1e-9)break;
  x+=error/derivative;lastDraft=candidate(x);current=resolveIntent(lastDraft,{ranges:false});
  if(current.status!=='resolved')return current;
 }
 return {status:'conflict',intent:lastDraft,conflicts:[{code:'EDGE_HEIGHT_CONSTRAINT',message:'This midpoint height cannot be reached while preserving the current relations and fixed dimensions.',blockIds:input.blocks.map(b=>b.id),fields:[],repairs:[]}]};
}
