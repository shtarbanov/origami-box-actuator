// Right-handed local panel frame. Rotation is a row-major 3x3 matrix and maps
// local coordinates to world coordinates: world = rotation * local + origin.
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=v=>{const n=Math.hypot(...v);if(n<1e-10)throw Error('Degenerate panel frame.');return v.map(x=>x/n);};
export function panelFrame(points){
 const originMm=[...points[0]],x=unit(sub(points[1],originMm));
 const off=points.slice(2).map(p=>sub(p,originMm)).find(v=>Math.hypot(...cross(x,v))>1e-10);
 if(!off)throw Error('Degenerate panel frame.');
 const z=unit(cross(x,off)),y=cross(z,x);
 return {originMm,rotationRowMajor:[0,1,2].map(i=>[x[i],y[i],z[i]]),
  shapeMm:points.map(p=>{const q=sub(p,originMm);return [dot(q,x),dot(q,y)];})};
}
