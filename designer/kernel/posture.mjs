// Measures virtual hinge-axis posture in the canonical world frame.
import {model,pose} from './geometry.mjs';
import {DesignError} from './spec.mjs';
const average=ps=>ps[0].map((_,k)=>ps.reduce((s,p)=>s+p[k],0)/ps.length);
export function postureAt(parameters,progress=.5,mirror=false){
 const v=pose({...parameters,opening:progress}).v;
 const points=['E','F','G','J'].map(id=>mirror?[-v[id][0],v[id][1],v[id][2]]:v[id]);
 const [E,F,G,J]=points,front=average([E,F]),rear=average([J,G]);
 const frontSorted=[E,F].sort((a,b)=>a[0]-b[0]),[left,right]=frontSorted;
 return {progress,topCenterMm:average(points),frontMaxRiseMm:Math.max(E[2],F[2]),rearMaxRiseMm:Math.max(J[2],G[2]),
  longitudinalTiltDeg:Math.atan2(rear[2]-front[2],rear[1]-front[1])*180/Math.PI,
  transverseTiltDeg:Math.atan2(right[2]-left[2],right[0]-left[0])*180/Math.PI,
  interpretation:'Virtual hinge-axis posture on the constructed path. Physical cut edges and actual pneumatic response differ.'};
}
export function solvePosture(parameters,mirror,target){
 if(!target||typeof target!=='object'||Array.isArray(target)||Object.keys(target).length!==1)throw new DesignError('INVALID_TARGET','/target','Supply exactly one scalar posture target.');
 const [quantity]=Object.keys(target),value=target[quantity];
 if(!['frontMaxRiseMm','rearMaxRiseMm','longitudinalTiltDeg','transverseTiltDeg'].includes(quantity)||!Number.isFinite(value))throw new DesignError('INVALID_TARGET','/target','Unknown quantity or non-finite target.');
 const at=t=>postureAt(parameters,t,mirror),a=at(0)[quantity],b=at(1)[quantity];
 if(Math.abs(a-b)<1e-9)throw new DesignError(Math.abs(value-a)<1e-8?'NON_UNIQUE_TARGET':'UNREACHABLE_TARGET','/target','This target does not determine a unique state on the selected path.',{quantity,pathRange:[a,b]});
 if(value<Math.min(a,b)-1e-9||value>Math.max(a,b)+1e-9)throw new DesignError('UNREACHABLE_TARGET','/target','Target is outside this design’s constructed motion range.',{quantity,pathRange:[a,b]});
 let lo=0,hi=1;
 for(let i=0;i<55;i++){const mid=(lo+hi)/2,v=at(mid)[quantity];if((v<value)===(b>a))lo=mid;else hi=mid;}
 const progress=(lo+hi)/2,posture=at(progress);
 return {state:{mode:'actuation',progress},posture,residual:posture[quantity]-value,
  thicknessClearance:'not checked by inverse posture alone',physicalControl:'not calibrated'};
}
export function synthesizeLongitudinalGoal(spec,goal){
 if(!goal||typeof goal!=='object'||Array.isArray(goal)||Object.keys(goal).some(k=>!['frontRiseMm','longitudinalTiltDeg'].includes(k))||Object.keys(goal).length!==2)throw new DesignError('INVALID_GOAL','/goal','Supply frontRiseMm and longitudinalTiltDeg.');
 const {frontRiseMm:h,longitudinalTiltDeg:angle}=goal;
 if(!Number.isFinite(h)||h<=0||!Number.isFinite(angle)||Math.abs(angle)>=90)throw new DesignError('INVALID_GOAL','/goal','Rise must be positive and tilt strictly between -90 and 90 degrees.');
 const rear=h+spec.footprint.length*Math.sin(angle*Math.PI/180);
 if(rear<-1e-9)throw new DesignError('GROUND_CROSSING','/goal','This rise and tilt put the rear top edge below the bottom plane.',{minimumFrontRiseMm:-spec.footprint.length*Math.sin(angle*Math.PI/180)});
 return {...spec,rise:{front:h,rearRatio:Math.max(0,rear)/h}};
}
