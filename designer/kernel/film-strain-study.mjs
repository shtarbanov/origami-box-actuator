// An exact local construction, deliberately not a complete gusseted-pouch proof.
import {sub,cross,dot,area} from './sheet-folds.mjs';
const distance=(a,b)=>Math.hypot(...sub(a,b));
export function fixedProjectionStretchBound(materialSpanMm,verticalShiftMm){
 if(!Number.isFinite(materialSpanMm)||materialSpanMm<=0||!Number.isFinite(verticalShiftMm))throw Error('Finite positive material span and finite vertical shift required.');
 const chord=Math.hypot(materialSpanMm,verticalShiftMm);
 return {materialSpanMm,verticalShiftMm,fixedXYEndpointChordMm:chord,minimumPairwiseExtension:chord/materialSpanMm-1,minimumRetreatForAnUnstretchedStraightRampMm:Math.abs(verticalShiftMm)<=materialSpanMm?materialSpanMm-Math.sqrt(materialSpanMm**2-verticalShiftMm**2):null,scope:'Necessary endpoint-distance bound only when material endpoints keep their original projected separation. It is not a structural lower bound after releasing that boundary condition.'};
}
export function isometricStripFrame({spanMm=12,stackHeightMm=1.2,widthMm=20,tailMm=3},progress){
 if(![spanMm,stackHeightMm,widthMm,tailMm].every(x=>Number.isFinite(x)&&x>0)||stackHeightMm/2>=spanMm||!Number.isFinite(progress)||progress<0||progress>1)throw Error('Invalid strip witness dimensions or progress.');
 const angle=Math.asin(progress*stackHeightMm/(2*spanMm)),C=Math.cos(angle),S=Math.sin(angle),meshes=[];
 for(const [layer,z0,sign] of [['bottom',0,1],['top',stackHeightMm,-1]])for(const region of ['ramp','clamp']){
  const a=region==='ramp'?0:spanMm,b=region==='ramp'?spanMm:spanMm+tailMm,uvMm=[[-widthMm/2,a],[widthMm/2,a],[widthMm/2,b],[-widthMm/2,b]],verticesMm=uvMm.map(([x,s])=>s<=spanMm?[x,-s*C,z0+sign*s*S]:[x,-spanMm*C-(s-spanMm),z0+sign*spanMm*S]);
  meshes.push({id:layer+'-'+region,role:'film',layer,uvMm,verticesMm,faces:[[0,1,2,3]]});
 }
 let maxRigidPatchErrorMm=0,maxAreaErrorMm2=0,maxContinuityErrorMm=0;
 for(const m of meshes){for(let i=0;i<4;i++)for(let j=i+1;j<4;j++)maxRigidPatchErrorMm=Math.max(maxRigidPatchErrorMm,Math.abs(distance(m.verticesMm[i],m.verticesMm[j])-distance(m.uvMm[i],m.uvMm[j])));const p=m.verticesMm,actual=Math.hypot(...cross(sub(p[1],p[0]),sub(p[3],p[0])));maxAreaErrorMm2=Math.max(maxAreaErrorMm2,Math.abs(actual-area(m.uvMm)));}
 for(let i=0;i<4;i+=2)maxContinuityErrorMm=Math.max(maxContinuityErrorMm,distance(meshes[i].verticesMm[3],meshes[i+1].verticesMm[0]),distance(meshes[i].verticesMm[2],meshes[i+1].verticesMm[1]));
 return {progress,meshes,panels:[],film:[],cues:[{role:'fold',active:true,pointsMm:[[-widthMm/2,0,0],[widthMm/2,0,0]]},{role:'seal',active:true,pointsMm:[[-widthMm/2,-spanMm*C,stackHeightMm/2],[widthMm/2,-spanMm*C,stackHeightMm/2]]}],angleLabel:(spanMm*(1-C)).toFixed(5)+' mm retreat',retreatMm:spanMm*(1-C),maxRigidPatchErrorMm,maxAreaErrorMm2,maxContinuityErrorMm,localIsometryPass:maxRigidPatchErrorMm<1e-10&&maxAreaErrorMm2<1e-9&&maxContinuityErrorMm<1e-10,globalPouchIsometryVerified:false,scope:'Two central film strips with free lateral boundaries. Root and clamp creases preserve every material distance within each face; joining the side gussets and prior long seam is a separate unsolved condition.'};
}
