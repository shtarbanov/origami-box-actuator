// Congruent, centred trapezoidal plates with longitudinal pitch.
// Each side's three hinge axes meet at its own stationary apex. The middle
// axis lies on two cones of equal half-angle beta. See docs/combined-derivation.html.
export function combinedData(p){
 const H=p.length,k=(p.width0-p.width1)/2,S=Math.hypot(H,k);
 const sine=2*(p.l1-p.l0)/H;
 if(Math.abs(sine)>=1-1e-10)throw Error('Front-to-rear rise difference must be less than plate length.');
 const delta=Math.asin(sine),hy=H/S,sinBeta=hy*Math.sin(Math.abs(delta)/2);
 return {H,k,S,delta,hy,sinBeta,cosBeta:Math.sqrt(1-sinBeta*sinBeta)};
}
export function combinedVertices(p,opening=1){
 const q=combinedData(p),{H,k,S,delta,hy,sinBeta,cosBeta}=q;
 if(delta===0)return null; // Exact parallel-axis limit is handled by geometry.pose.
 const theta=delta*opening,st=Math.sin(theta/2),ct=Math.cos(theta/2),sd=Math.sin(delta/2);
 const cg2=1-hy*hy*st*st;
 // Rationalized cosBeta/cos(gamma)^2 - 1 avoids cancellation near equal rises.
 const coefficient=(-sinBeta*sinBeta/(1+cosBeta)+hy*hy*st*st)/cg2;
 const a=cosBeta/cg2;
 const vertices={A:[-p.width0/2,0,0],B:[p.width0/2,0,0],C:[p.width1/2,H,0],D:[-p.width1/2,H,0]};
 const rise=[2*p.l0,2*p.l1];
 for(const [side,base,middle,upper] of [[1,['A','D'],['K','L'],['E','J']],[-1,['B','C'],['M','N'],['F','G']]]){
  const vx=side*k/S;
  for(let i=0;i<2;i++){
   const b=vertices[base[i]],r=rise[i]*S/(H*Math.sin(delta));
   const offset=[r*coefficient*vx,r*(coefficient*hy-a*hy*st*st),r*a*hy*st*ct];
   const inward=side*rise[i]*Math.sqrt(Math.max(0,sd*sd-st*st))/(Math.abs(Math.sin(delta))*cg2);
   const normal=[hy*ct,-vx*ct,-vx*st];
   vertices[middle[i]]=b.map((x,j)=>x+offset[j]+inward*normal[j]);
   vertices[upper[i]]=[b[0],b[1]-rise[i]*2*st*st/Math.sin(delta),rise[i]*Math.sin(theta)/Math.sin(delta)];
  }
 }
 return vertices;
}
