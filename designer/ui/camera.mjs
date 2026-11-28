// Rendering-only camera: consumes world-space points and knows no actuator solver.
export function frameFromPoints(points){
 if(!points.length)throw Error('Cannot frame an empty scene.');
 const center=[0,1,2].map(k=>(Math.min(...points.map(v=>v[k]))+Math.max(...points.map(v=>v[k])))/2);
 const radius=Math.max(...points.map(v=>Math.hypot(...v.map((x,k)=>x-center[k]))));
 return {center,radius,scale:Math.min(5,140/Math.max(radius,1))};
}
export function cameraForFrame(frame,azimuth=-38,elevation=28){
 const az=azimuth*Math.PI/180,el=elevation*Math.PI/180;
 const transform=v=>{const [x,y,z]=v,xx=x*Math.cos(az)-y*Math.sin(az),yy=x*Math.sin(az)+y*Math.cos(az);return [xx,-z*Math.cos(el)+yy*Math.sin(el),yy*Math.cos(el)+z*Math.sin(el)];};
 const [cx,cy]=transform(frame.center),{scale}=frame;
 return {...frame,cx,cy,azimuth,elevation,project(v){const t=transform(v.map((x,k)=>x-frame.center[k]));return [360+t[0]*scale,155+t[1]*scale,t[2]];}};
}
