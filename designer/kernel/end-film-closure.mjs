// Layer-preserving geometric press map for a deformable film. Plastic does not
// move. Required in-plane film strain is measured, never assumed acceptable.
export function endFilmPressFrame(problem,progress,{axialRetreatMm=0}={}){
 if(!Number.isFinite(progress)||progress<0||progress>1)throw Error('Progress must be in [0,1].');
 if(problem.opening!==0)throw Error('Pressing requires the collapsed both-inward state.');
 if(problem.atlasChecks.maxContinuityError>1e-6)throw Error('End film atlas is discontinuous; this design requires a corrected material map before pressing.');
 if(!Number.isFinite(axialRetreatMm)||axialRetreatMm<0||axialRetreatMm>problem.maxRetreatMm)throw Error('Axial retreat exceeds the end allowance.');
 const sign=problem.end==='front'?-1:1,inner=problem.sealY-sign*problem.bandWidthMm/2,span=sign*(inner-problem.rootY),k2BySource=new Map();
 for(const p of problem.parts)if(!k2BySource.has(p.sourceId))k2BySource.set(p.sourceId,p.transform.x[2]**2+p.transform.y[2]**2);
 const positionsMm=problem.initialMm.map((initial,i)=>{
  const flat=problem.flatMm[i],part=problem.parts[problem.members[i][0]],id=part.sourceId,base=id.startsWith('long-fin-')?'seam-overhang-'+id.split('-')[2]:id,k2=Math.min(1,Math.max(0,k2BySource.get(base)??0)),t=Math.max(0,Math.min(1,sign*(flat[1]-problem.rootY)/span)),amount=progress*t*t*(3-2*t),h=1-amount,c=Math.sqrt(1-k2),ratio=1-c>1e-12?(1-Math.sqrt(Math.max(0,1-k2*h*h)))/(1-c):h;
  return [flat[0]+ratio*(initial[0]-flat[0]),flat[1]+ratio*(initial[1]-flat[1])-sign*axialRetreatMm*amount,initial[2]*h+problem.sealPlaneZMm*amount];
 });
 let maxSharedProjectionSpreadMm=0;
 if(problem.layoutNodeId){const groups=new Map();problem.layoutNodeId.forEach((k,i)=>{if(!groups.has(k))groups.set(k,[]);groups.get(k).push(i);});const means=[];for(const group of groups.values()){const x=group.reduce((s,i)=>s+positionsMm[i][0],0)/group.length,y=group.reduce((s,i)=>s+positionsMm[i][1],0)/group.length;for(const i of group)maxSharedProjectionSpreadMm=Math.max(maxSharedProjectionSpreadMm,Math.hypot(positionsMm[i][0]-x,positionsMm[i][1]-y));means.push({group,x,y});}if(maxSharedProjectionSpreadMm>1e-7)throw Error('Material layers have incompatible XY projections; the shared-overlay closure is unavailable.');for(const {group,x,y} of means)for(const i of group){positionsMm[i][0]=x;positionsMm[i][1]=y;}}
 return {progress,positionsMm,retreatMm:axialRetreatMm*progress,maxSharedProjectionSpreadMm,deformationModel:'layer-preserving deformable film; required strain uncalibrated',inextensible:false};
}
