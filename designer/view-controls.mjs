// View state only: never mutates actuator dimensions or fold state.
export const defaultView=()=>({zoom:1,panX:0,panY:0});
const wrapAngle=value=>((value+180)%360+360)%360-180;
// Drag right rotates the object right. Both axes wrap; underside views are allowed.
export function orbitAngles(azimuth,elevation,dx,dy){return {azimuth:wrapAngle(azimuth-dx),elevation:wrapAngle(elevation+dy)};}
export function zoomAt(view,factor,x,y){
 const zoom=Math.max(.25,Math.min(6,view.zoom*factor)),ratio=zoom/view.zoom;
 return {zoom,panX:x-360-(x-360-view.panX)*ratio,panY:y-155-(y-155-view.panY)*ratio};
}
export function viewPoint(p,v){return [360+(p[0]-360)*v.zoom+v.panX,155+(p[1]-155)*v.zoom+v.panY,p[2]];}
export function bindViewControls(el,{rotate,pan,zoom,reset}){
 const pointers=new Map();let pinch=null;
 const point=e=>{
  const svg=el.querySelector('svg'),m=svg?.getScreenCTM();
  if(!m)return null;
  return new DOMPoint(e.clientX,e.clientY).matrixTransform(m.inverse());
 };
 const pair=()=>{const a=[...pointers.values()].filter(p=>p.touch);if(a.length!==2)return null;return {x:(a[0].p.x+a[1].p.x)/2,y:(a[0].p.y+a[1].p.y)/2,d:Math.hypot(a[0].p.x-a[1].p.x,a[0].p.y-a[1].p.y)};};
 el.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse'&&![0,1,2].includes(e.button))return;const p=point(e);if(!p)return;pointers.set(e.pointerId,{p,touch:e.pointerType==='touch',pan:e.pointerType!=='touch'&&e.button!==2});pinch=pair();el.setPointerCapture(e.pointerId);el.classList.add('dragging');el.focus({preventScroll:true});e.preventDefault();});
 el.addEventListener('pointermove',e=>{
  const drag=pointers.get(e.pointerId);if(!drag)return;const p=point(e);if(!p)return;const dx=p.x-drag.p.x,dy=p.y-drag.p.y;drag.p=p;
  if(drag.touch&&pointers.size>=2){const next=pair();if(next&&pinch){pan(next.x-pinch.x,next.y-pinch.y);if(next.d>1&&pinch.d>1)zoom(next.d/pinch.d,next.x,next.y);}pinch=next;}
  else if(drag.pan)pan(dx,dy);else rotate(dx*.45,dy*.35);
 });
 const end=e=>{if(!pointers.has(e.pointerId))return;pointers.delete(e.pointerId);pinch=pair();if(!pointers.size)el.classList.remove('dragging');if(el.hasPointerCapture(e.pointerId))el.releasePointerCapture(e.pointerId);};
 for(const name of ['pointerup','pointercancel','lostpointercapture'])el.addEventListener(name,end);
 el.addEventListener('contextmenu',e=>e.preventDefault());
 el.addEventListener('wheel',e=>{const p=point(e);if(!p)return;e.preventDefault();const dy=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?330:1);zoom(Math.exp(-Math.max(-200,Math.min(200,dy))*.002),p.x,p.y);},{passive:false});
 el.addEventListener('dblclick',reset);
 el.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();const dx=e.key==='ArrowLeft'?-12:e.key==='ArrowRight'?12:0,dy=e.key==='ArrowUp'?-12:e.key==='ArrowDown'?12:0;if(e.shiftKey)pan(dx,dy);else rotate(dx,dy);}else if(['+','=','-','0'].includes(e.key)){e.preventDefault();if(e.key==='0')reset();else zoom(e.key==='-'?1/1.15:1.15,360,155);}});
}
