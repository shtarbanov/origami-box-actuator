// Label offsets are chosen once, not reselected as camera projections move.
// This keeps text attached continuously during orbit, pan and zoom.
export function createLabelLayout(){
 const offsets=new Map();
 return {
  reset(){offsets.clear();},
  place(id,anchor,width,occupied,preferred=[9,-21]){
   const [x,y]=anchor,height=16;
   const overlap=(a,b)=>Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y));
   let offset=offsets.get(id);
   if(!offset){
    const choices=[preferred,[9,5],[-width-9,-21],[-width-9,5],[9,-38],[-width-9,-38],[9,22],[-width-9,22],[9,39],[-width-9,39]];
    const boxes=choices.map(([dx,dy])=>({x:x+dx,y:y+dy,width,height,dx,dy}));
    const score=b=>occupied.reduce((s,o)=>s+overlap(b,o)*100,0)+Math.hypot(b.x-x,b.y-y);
    const box=boxes.find(b=>occupied.every(o=>!overlap(b,o)))??boxes.sort((a,b)=>score(a)-score(b))[0];
    offset=[box.dx,box.dy];offsets.set(id,offset);
   }
   const box={x:x+offset[0],y:y+offset[1],width,height};
   occupied.push({...box,x:box.x-2,y:box.y-2,width:width+4,height:height+4});return box;
  }
 };
}
export function createFrameScheduler(draw,requestFrame){
 let scheduled=false;
 return ()=>{if(scheduled)return;scheduled=true;requestFrame(()=>{scheduled=false;draw();});};
}
