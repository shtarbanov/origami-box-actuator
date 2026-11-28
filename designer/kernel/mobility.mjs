// Instantaneous closed-loop mobility, not a pressure model or finite-motion proof.
// Loop velocity closure: sum_i S_i qdot_i = 0, S=[omega; a x omega].
// Joint axes are normalized and moments are divided by a characteristic length.
import {model,pose} from './geometry.mjs';
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function singularValues(matrix){
 // One-sided Jacobi SVD, small dense matrices, no dependency or squared condition number.
 const rows=matrix.length,cols=matrix[0].length,A=matrix.map(row=>[...row]);
 for(let sweep=0;sweep<80;sweep++){
  let changed=false;
  for(let p=0;p<cols;p++)for(let q=p+1;q<cols;q++){
   let aa=0,bb=0,ab=0;for(let r=0;r<rows;r++){aa+=A[r][p]**2;bb+=A[r][q]**2;ab+=A[r][p]*A[r][q];}
   if(Math.abs(ab)<=1e-14*Math.sqrt(aa*bb)||aa*bb===0)continue;
   const zeta=(bb-aa)/(2*ab),t=(zeta>=0?1:-1)/(Math.abs(zeta)+Math.hypot(1,zeta)),c=1/Math.hypot(1,t),s=c*t;
   for(let r=0;r<rows;r++){const x=A[r][p],y=A[r][q];A[r][p]=c*x-s*y;A[r][q]=s*x+c*y;}changed=true;
  }
  if(!changed)break;
 }
 return Array.from({length:cols},(_,c)=>Math.hypot(...A.map(row=>row[c]))).sort((a,b)=>b-a);
}
export function mobilityAt(parameters,opening=.5){
 const m=model(parameters),v=pose({...parameters,opening}).v;
 const length=Math.max(parameters.length,parameters.width0,parameters.width1,2*parameters.l0,2*parameters.l1);
 const axes=[...m.hinges,m.seam];
 const columns=axes.map(([a,b])=>{const w=v[b].map((x,k)=>x-v[a][k]),n=Math.hypot(...w),u=w.map(x=>x/n);return [...u,...cross(v[a],u).map(x=>x/length)];});
 const matrix=Array.from({length:6},(_,row)=>columns.map(c=>c[row]));
 const values=singularValues(matrix),threshold=values[0]*1e-8,rank=values.filter(v=>v>threshold).length;
 return {opening,joints:axes.length,rank,instantaneousDof:axes.length-rank,singularValues:values,rankThreshold:threshold,
  interpretation:'First-order mobility of ideal revolute axes with bottom grounded. Singular configurations may have infinitesimal freedoms that do not extend to finite motion. Film and stiffness are excluded.'};
}
export function mobilityProfile(parameters){
 const poses=[0,.1,.25,.5,.75,.9,1].map(opening=>mobilityAt(parameters,opening));
 const interior=poses.slice(1,-1),genericDof=Math.min(...interior.map(p=>p.instantaneousDof));
 return {schema:'origami-box/mobility/1',genericSampledDof:genericDof,poses,
  weakConstraintRatio:Math.min(...interior.map(p=>p.singularValues[p.rank-1]/p.singularValues[0])),
  singularSamples:poses.filter(p=>p.instantaneousDof>genericDof).map(p=>p.opening),
  interpretation:'Numerical screw-Jacobian rank analysis, cross-check against independent SVD. Not a proof of passive path uniqueness.'};
}
