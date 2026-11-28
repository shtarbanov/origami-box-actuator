// Ideal hinge-axis geometry. These are local reachability tests, not a full
// mechanism/film/thickness certification. Lengths in mm, angles in radians.
export function twoLinkRange(a,b){
 if(![a,b].every(x=>Number.isFinite(x)&&x>0))throw Error('Facet spans must be positive.');
 return {minimum:Math.abs(a-b),maximum:a+b,coincidentEndpointsPossible:a===b};
}
export function twoLinkJoint(A,B,a,b,branch=1){
 const r=twoLinkRange(a,b),dx=B[0]-A[0],dy=B[1]-A[1],d=Math.hypot(dx,dy);
 if(d<r.minimum-1e-9||d>r.maximum+1e-9)return null;
 // At coincident endpoints the joint direction is undetermined.
 if(d<1e-12)return {singular:true};
 const along=(a*a-b*b+d*d)/(2*d),normal=Math.sqrt(Math.max(0,a*a-along*along)),s=branch>=0?1:-1;
 return [A[0]+along*dx/d-s*normal*dy/d,A[1]+along*dy/d+s*normal*dx/d];
}
export function concurrentAxisRange(alpha,beta){
 if(![alpha,beta].every(x=>Number.isFinite(x)&&x>0&&x<Math.PI/2))throw Error('This study requires acute sector angles.');
 return {minimum:Math.abs(alpha-beta),maximum:alpha+beta,coincidentAxesPossible:alpha===beta};
}
export function concurrentMiddleAxis(alpha,beta,phi){
 const r=concurrentAxisRange(alpha,beta);
 if(phi<r.minimum-1e-10||phi>r.maximum+1e-10)return null;
 if(Math.abs(phi)<1e-12)return {singular:true};
 // Bottom axis (0,1,0), top axis (0,cos(phi),sin(phi)).
 const y=Math.cos(alpha),z=(Math.cos(beta)-y*Math.cos(phi))/Math.sin(phi),x2=1-y*y-z*z;
 if(x2 < -1e-8)return null;
 return [Math.sqrt(Math.max(0,x2)),y,z];
}
