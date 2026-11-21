// Closed-form six-panel mechanisms. All dimensions refer to virtual hinge axes.
// Rigid panel outlines are inset g/2 from those axes in geometry.mjs.
import {combinedData} from './combined.mjs';
import {taperedHingeData} from './tapered-hinge.mjs';
import {obliqueProof} from './oblique.mjs';
export function hingeVertices(p,opening=1){
 const W=p.width0,H=p.length,l=p.l0;
 const maxAngle=2*Math.asin(l/W),angle=maxAngle*opening,half=angle/2;
 const radial=W*Math.cos(half)-Math.sqrt(Math.max(0,l*l-W*W*Math.sin(half)**2));
 const x=-W/2,top=[x+W*Math.cos(angle),W*Math.sin(angle)],mid=[x+radial*Math.cos(half),radial*Math.sin(half)];
 return {A:[x,0,0],D:[x,H,0],B:[W/2,0,0],C:[W/2,H,0],
 E:[x,0,0],J:[x,H,0],F:[top[0],0,top[1]],G:[top[0],H,top[1]],
 M:[mid[0],0,mid[1]],N:[mid[0],H,mid[1]]};
}
export function wedgeData(p){
 const dh=2*(p.l1-p.l0),s=dh/p.length;
 if(Math.abs(s)>1-1e-10)throw Error('The front-to-rear height difference must be less than the plate length.');
 if(Math.abs(s)<1e-9)return {parallel:true,beta:0,delta:0,inset:p.l0};
 const delta=Math.asin(s),beta=Math.abs(delta)/2;
 const r0=2*p.l0/s,r1=2*p.l1/s;
 const inset=Math.max(Math.abs(r0),Math.abs(r1))*Math.sin(beta);
 return {parallel:false,delta,beta,r0,r1,inset};
}
export function wedgeVertices(p,opening=1){
 const q=wedgeData(p),W=p.width0,H=p.length;
 if(q.parallel)return null;
 const phi=q.delta*opening,cb=Math.cos(q.beta),sb=Math.sin(q.beta);
 const uz=cb*Math.tan(phi/2),ux=Math.sqrt(Math.max(0,sb*sb-uz*uz));
 const mid=(x,y,r,side)=>[x+side*Math.abs(r)*ux,y+r*(cb-1),r*uz];
 const top=(x,y,r)=>[x,y+r*(-2*Math.sin(phi/2)**2),r*Math.sin(phi)];
 return {A:[-W/2,0,0],B:[W/2,0,0],C:[W/2,H,0],D:[-W/2,H,0],
 E:top(-W/2,0,q.r0),F:top(W/2,0,q.r0),G:top(W/2,H,q.r1),J:top(-W/2,H,q.r1),
 K:mid(-W/2,0,q.r0,1),L:mid(-W/2,H,q.r1,1),M:mid(W/2,0,q.r0,-1),N:mid(W/2,H,q.r1,-1)};
}
export function proofConditions(p){
 if(p.kind==='oblique')return obliqueProof(p);
 if(p.kind==='tapered-hinge'){
  const q=taperedHingeData(p);
  return {model:'spherical four-revolute linkage with a direct side hinge',continuous:true,requiredWidthMm:0,availableWidthMm:Math.min(p.width0,p.width1),widthMarginMm:Math.min(p.width0,p.width1),maximumOpeningAngleDeg:q.angle*180/Math.PI,
  conditions:['Congruent centred trapezoids; rear/front rise equals rear/front width.','All four revolute axes meet at the trapezoid side-line apex.','Opposite middle axis maintains equal angles to bottom and top free-edge axes.'],
  limits:['Interference and positive thickness require sampled checks.','Film and sealing remain unverified.']};
 }
 if(p.kind==='combined'){
  const q=combinedData(p),beta=Math.asin(q.sinBeta);
  const reach=Math.max(p.l0,p.l1)/(Math.cos(q.delta/2)*Math.cos(beta/2));
  return {model:'symmetric 6R with two stationary side apexes and equal-angle cone intersections',continuous:true,
   requiredWidthMm:2*reach,availableWidthMm:Math.min(p.width0,p.width1),widthMarginMm:Math.min(p.width0,p.width1)-2*reach,
   foldParameter:'top pitch = progress × asin((rearRise-frontRise)/length)',
   conditions:['Congruent centred trapezoid top/bottom; both folding walls present.',
   'Each outer side-axis pair intersects at a stationary apex.',
   'Middle side axis has fixed equal angle beta to both outer axes.',
   'All panel pairwise distances and closed hinges are preserved analytically.',
   'Conservative width bound keeps opposite side facets in separate x half-spaces.'],
   limits:['Same-side facet contact and finite-thickness interference require sampled checks.','Film, end seals and passive pressure-driven path are unverified.']};
 }
 if(p.kind==='hinge')return {
 model:'four rigid facets: two large panels, two folding panels, and a direct film hinge on the opposite edge',continuous:true,
 requiredWidthMm:2*p.l0,availableWidthMm:p.width0,widthMarginMm:p.width0-2*p.l0,
 maximumOpeningAngleDeg:2*Math.asin(p.l0/p.width0)*180/Math.PI,
 foldParameter:'rotation angle θ = opening × 2 asin(l/W)',
 conditions:['Two small panels on one side are removed; top and bottom share a fixed hinge axis.',
 'Distance between free large-panel edges: d=2W sin(θ/2) ≤ 2l.',
 'Opposite folding axis: r=W cos(θ/2)−sqrt(l²−W² sin²(θ/2)).',
 'W≥2l is retained as a conservative family condition; it yields maximum θ≤60 degrees.',
 'All four face shapes remain rigid, and the fourth hinge closes exactly.',
 'At zero thickness, fully folded stacking is permitted.'],
 limits:['Positive thickness needs the sampled clearance check.','Film end walls and sealing are not certified.']};
 const w=p.kind==='wedge'?wedgeData(p):null;
 const reach=w&&!w.parallel?w.inset:p.l0;
 const requiredWidth=2*reach;
 return {model:'zero-thickness rigid panels + zero-thickness film folded at gap centre',
 continuous:true,requiredWidthMm:requiredWidth,availableWidthMm:Math.min(p.width0,p.width1),
 widthMarginMm:Math.min(p.width0,p.width1)-requiredWidth,
 foldParameter:p.kind==='wedge'&&w&&!w.parallel?'top angle φ = opening × δ':'panel separation h = opening × 2l',
 conditions:p.kind==='wedge'&&w&&!w.parallel?[
 'sin δ = (h1 − h0) / H; |h1 − h0| < H',
 'β = |δ|/2; upper and lower side facets have equal hinge-axis angles β',
 'middle-axis direction: uy = cos β, uz = cos β tan(φ/2), ux² = sin² β − uz² ≥ 0',
 'W ≥ 2 max(|r0|,|r1|) sin β; r_i = h_i / sin δ',
 'each face preserves every pairwise vertex distance; all six hinge axes close',
 'at opening=0, top and bottom coincide; contact is allowed for zero thickness'
 ]:[
 'h = 2l × opening; inward offset d = sqrt(l² − (h/2)²)',
 'min(W0,W1) ≥ 2l; each opposite side stays in its own half-space',
 'face vertices lie between z=0 and z=h; lower and upper side facets occupy separate half-heights',
 'all hinge axes close and all face pairwise distances remain constant',
 'at opening=0, coplanar stacking/contact is allowed for zero thickness'
 ],
 limits:['Finite-thickness sweep is sampled, not a continuous collision proof.','Film end walls, seals, pneumatic loading and material strain are not certified.']};
}
