// The same symmetric panel prisms used by the main collision audit. No
// clearance offset or thickness exaggeration is introduced for display.
import {panelFrame} from './panel-frame.mjs';
export function panelPrismMesh(panel,thicknessMm){
 if(!Number.isFinite(thicknessMm)||thicknessMm<0)throw Error('Nonnegative finite panel thickness required.');
 const ps=panel.pointsMm.map(p=>[...p]),n=ps.length,frame=panelFrame(ps),normal=frame.rotationRowMajor.map(row=>row[2]);
 if(thicknessMm===0)return {id:'solid-'+panel.id,panelId:panel.id,role:'panel',verticesMm:ps,faces:[Array.from({length:n},(_,i)=>i)],thicknessMm,referenceSurface:'midplane'};
 const offset=s=>ps.map(p=>p.map((v,k)=>v+s*normal[k]*thicknessMm/2));
 return {id:'solid-'+panel.id,panelId:panel.id,role:'panel',verticesMm:[...offset(-1),...offset(1)],faces:[Array.from({length:n},(_,i)=>n-1-i),Array.from({length:n},(_,i)=>i+n),...ps.map((_,i)=>[i,(i+1)%n,(i+1)%n+n,i+n])],thicknessMm,referenceSurface:'midplane'};
}
