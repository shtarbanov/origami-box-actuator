// Schematic tool/accessory meshes and their trajectories, generated as neutral
// geometry. These dimensions illustrate operations; they are not hardware specs.
const add=(a,b)=>a.map((x,i)=>x+b[i]),sub=(a,b)=>a.map((x,i)=>x-b[i]),mul=(a,k)=>a.map(x=>x*k);
const unit=a=>mul(a,1/Math.hypot(...a)),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const clamp=x=>Math.min(1,Math.max(0,x));
function beam(id,role,a,b,normal,width,height,offset){
 const side=mul(unit(cross(normal,sub(b,a))),width/2),base=add(a,mul(normal,offset)),end=add(b,mul(normal,offset));
 const ring=[sub(base,side),add(base,side),add(end,side),sub(end,side)],verticesMm=[...ring,...ring.map(p=>add(p,mul(normal,height)))];
 return {id,role,verticesMm,faces:[[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]]};
}
export function hollowInletMesh(origin,normal,radius,offset=0){
 const axis=unit(normal),basis=unit(cross(axis,Math.abs(axis[1])<.9?[0,1,0]:[1,0,0])),other=cross(axis,basis),N=32;
 // A smaller flange and a bevel around the outer rim of the neck opening.
 const profile=[[radius*.82,0],[radius*.82,radius*.24],[radius*.45,radius*.24],[radius*.45,radius*1.1],[radius*.36,radius*1.2],[radius*.22,0],[radius*.22,radius*1.2]];
 const verticesMm=profile.flatMap(([r,h])=>Array.from({length:N},(_,i)=>add(add(origin,mul(axis,h+offset)),add(mul(basis,r*Math.cos(i*2*Math.PI/N)),mul(other,r*Math.sin(i*2*Math.PI/N))))));
 const faces=[];for(const [a,b] of [[0,1],[1,2],[2,3],[3,4],[4,6],[6,5],[5,0]])for(let i=0;i<N;i++)faces.push([a*N+i,a*N+(i+1)%N,b*N+(i+1)%N,b*N+i]);
 const base=add(origin,mul(axis,offset));
 return {id:'inlet',role:'accessory',verticesMm,faces,schematic:true,bore:{radiusMm:radius*.22,axisMm:[base,add(base,mul(axis,radius*1.2))]}};
}
export function fabricationVisuals({p,g,progress,inletVisible,attachProgress,inletActive,activeSeal}){
 const meshes=[],details=[];
 if(inletVisible){
  const a=g.panels[3].pointsMm,normal=mul(unit(cross(sub(a[1],a[0]),sub(a[2],a[0]))),-1),radius=.7*Math.min(p.width0*.12,(p.l0+p.clearance)*.38);
  const mesh=hollowInletMesh(g.inlet,normal,radius,inletActive?radius*2.5*(1-attachProgress):0);meshes.push(mesh);
  if(inletActive){
   const viewRadius=radius/.7,placed=hollowInletMesh(g.inlet,normal,viewRadius).verticesMm,envelope=[...placed,...placed.map(v=>add(v,mul(normal,viewRadius*2.5)))];
   const lo=[0,1,2].map(i=>Math.min(...envelope.map(v=>v[i]))),hi=[0,1,2].map(i=>Math.max(...envelope.map(v=>v[i])));
   const framePointsMm=[0,1].flatMap(x=>[0,1].flatMap(y=>[0,1].map(z=>[x?hi[0]:lo[0],y?hi[1]:lo[1],z?hi[2]:lo[2]])));
   details.push({id:'inlet-detail',label:'Inlet',meshIds:[mesh.id],framePointsMm,targetMm:g.inlet});
  }
 }
 if(activeSeal){
  const [a,b]=g.seals.find(s=>s.id===activeSeal).pointsMm,normal=[0,0,1],w=Math.min(p.gap*.8,3),h=w*.8,lift=Math.min(p.width0*.15,12);
  const press=progress<.25?progress/.25:progress>.8?(1-progress)/.2:1;
  meshes.push(beam('lower-jaw','tool',a,b,normal,w*1.4,h,-h-.25),beam('upper-jaw','tool',a,b,normal,w*1.4,h,.25+lift*(1-clamp(press))));
  const bonded=clamp((progress-.25)/.5);
  if(bonded>0)meshes.push(beam('new-bond','bond',a,add(a,mul(sub(b,a),bonded)),normal,w,.08,.12));
  details.push({id:'seal-detail',label:'Heat sealing',meshIds:['lower-jaw','upper-jaw','new-bond'],targetMm:mul(add(a,b),.5),framePointsMm:[...meshes.find(m=>m.id==='lower-jaw').verticesMm,...beam('envelope','tool',a,b,normal,w*1.4,h,.25+lift).verticesMm]});
  return {meshes,details,action:{kind:'press-seal',phase:progress<.25?'approach':progress<=.8?'press':'release',pressFraction:clamp(press),bondFraction:bonded,schematic:true}};
 }
 return {meshes,details,action:null};
}
