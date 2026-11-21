// At a zero-height rear edge, two finite-thickness plates form a symmetric
// wedge. Equal setbacks q avoid overlap if q*sin(theta/2) >= t/2*cos(theta/2).
// This relief is dimensioned for the existing nominal assembly target (75%).
export const ASSEMBLY_TARGET=.75;
export function rearApexRelief(p){
 if(!['wedge','combined'].includes(p.kind)||p.l1!==0)return 0;
 const angle=Math.abs(Math.asin(2*(p.l1-p.l0)/p.length))*ASSEMBLY_TARGET;
 const thicknessMinimum=p.thickness===0?0:p.thickness/(2*Math.tan(angle/2));
 return Math.max(p.gap/2,thicknessMinimum+1e-6);
}
