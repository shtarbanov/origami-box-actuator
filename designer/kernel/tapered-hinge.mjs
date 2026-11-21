// Spherical 4R: a trapezoid's two long side axes meet at a common apex.
// Rotate the top about one side; solve the opposite middle axis on equal cones.
export function taperedHingeData(p){
 const k=(p.width0-p.width1)/2,S=Math.hypot(k,p.length),frontArm=p.width0*p.length/S;
 const h=2*p.l0;if(h>frontArm*Math.sin(Math.PI/3)+1e-9)throw Error(`Tapered hinge front rise must not exceed ${(frontArm*Math.sin(Math.PI/3)).toFixed(3)} mm in this solver.`);
 return {k,S,frontArm,angle:Math.asin(h/frontArm)};
}
export function taperedHingeVertices(p,opening=1){
 const {k,S,angle}=taperedHingeData(p),H=p.length,kx=k/S,hy=H/S;
 const theta=-angle*opening,st=Math.sin(theta/2),ct=Math.cos(theta/2),sm=Math.sin(angle/2);
 const sine=2*kx*hy,cosine=1-2*kx*kx,cb=Math.sqrt(1-sine*sine*sm*sm),cg2=1-sine*sine*st*st;
 const A=[-p.width0/2,0,0],D=[-p.width1/2,H,0],B=[p.width0/2,0,0],C=[p.width1/2,H,0];
 const result={A,D,B,C,E:A,J:D};
 for(const [base,top,middle,W] of [[B,'F','M',p.width0],[C,'G','N',p.width1]]){
  // Products with the remote apex radius are algebraically cancelled first.
  // This remains finite and continuous when the trapezoid becomes rectangular.
  const displacement=[-2*W*hy*hy*st*st,2*W*hy*kx*st*st,-2*W*hy*st*ct];
  const coefficient=W*hy*sine*(sm*sm/(1+cb)-st*st)/cg2;
  const inward=-W*hy*Math.sqrt(Math.max(0,sm*sm-st*st))/cg2;
  const v=[-kx,hy,0],n=[hy*ct,kx*ct,-cosine*st];
  result[top]=base.map((x,j)=>x+displacement[j]);
  result[middle]=base.map((x,j)=>x+coefficient*v[j]+cb/cg2*displacement[j]/2+inward*n[j]);
 }
 return result;
}
