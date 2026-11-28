// Domain provider for a box intent resolver. No knowledge of blocks or UI.
import {resolveSpec,DesignError} from './spec.mjs';
import {parameters,unfold,model,pose,panelWorld} from './geometry.mjs';
import {hingeVertices} from './mechanism.mjs';
import {taperedHingeVertices} from './tapered-hinge.mjs';
const midpoint=(a,b)=>a.map((x,i)=>(x+b[i])/2);
function topEdges(p,v,mirror){
 const point=q=>mirror?[-q[0],q[1],q[2]]:[...q],net=unfold(p),top=net.faces.find(f=>f.id==='top'),poly=panelWorld(net,top,v).map(point);
 const pairs={front:['E','F'],rear:['J','G'],left:mirror?['F','G']:['E','J'],right:mirror?['E','J']:['F','G']};
 const direction=(a,b)=>{const d=b.map((x,i)=>x-a[i]),n=Math.hypot(...d);return d.map(x=>x/n);};
 const edges=poly.map((a,i)=>[a,poly[(i+1)%poly.length]]);
 return Object.fromEntries(Object.entries(pairs).map(([id,ids])=>{
  const hingeMm=ids.map(i=>point(v[i])),u=direction(...hingeMm),mid=midpoint(...hingeMm);
  const candidates=edges.filter(e=>Math.abs(direction(...e).reduce((s,x,i)=>s+x*u[i],0))>1-1e-7);
  const score=e=>Math.hypot(...midpoint(...e).map((x,i)=>x-mid[i]));
  const physical=candidates.sort((a,b)=>score(a)-score(b))[0];
  // Interaction metadata must not reject a valid clipped panel when an end
  // edge disappears. Its hinge-axis segment remains a meaningful reference.
  return [id,{hingeMm,topMm:physical??hingeMm,virtual:!physical}];
 }));
}
export function specFromValues(v,walls){return {
 schema:'origami-box/spec/1',units:'mm',footprint:{length:v.length,frontWidth:v.frontWidth,rearWidthRatio:v.rearWidth/v.frontWidth},
 rise:{front:v.frontRise,rearRatio:v.rearRise/v.frontRise,...(v.sideRiseRatio!==undefined&&v.sideRiseRatio!==1?{rightToLeftRatio:v.sideRiseRatio}:{})},walls:{...walls},
 fabrication:{hingeGap:v.gap,panelThickness:v.thickness,endAllowance:v.allowance}
};}
export function topologyRelation(v,walls){
 if(!walls.left&&!walls.right)throw new DesignError('NO_FOLDING_WALL','/walls','At least one folding wall must remain.');
 return !walls.left||!walls.right?{riseRatio:v.rearWidth/v.frontWidth,code:'DIRECT_CONNECTION',fields:['frontWidth','rearWidth','frontRise','rearRise'],message:'A direct side connection requires rear/front rise to equal rear/front width.'}:null;
}
export function riseDifference(length,angle){
 if(!Number.isFinite(angle)||Math.abs(angle)>=90)throw new DesignError('TILT_DOMAIN','/tilt','Longitudinal tilt must be strictly between −90° and 90° in this solver.');
 return length*Math.sin(angle*Math.PI/180);
}
export function longitudinalRelation(v,angle){
 const slope=riseDifference(1,angle),s=v.sideRiseRatio??1;
 return {lengthCoefficient:slope,frontCoefficient:1+Math.abs(s>=1?1-1/s:s-1)*(v.rearWidth-v.frontWidth)/(2*v.frontWidth)};
}
export function boxMeasurements(spec){
 const r=resolveSpec(spec),p=parameters(r.parameters),v=pose({...p,opening:1}).v;
 const left=r.mirror?v.F:v.E,right=r.mirror?v.E:v.F;
 const front=v.E.map((x,i)=>(x+v.F[i])/2),rear=v.J.map((x,i)=>(x+v.G[i])/2);
 const edges=topEdges(p,v,r.mirror);
 return {frontLeftRise:left[2],frontRightRise:right[2],rearLeftRise:(r.mirror?v.G:v.J)[2],rearRightRise:(r.mirror?v.J:v.G)[2],
  ...Object.fromEntries(Object.entries(edges).map(([id,e])=>[id+'MidRise',midpoint(...e.topMm)[2]])),
  longitudinalAngleDeg:(!spec.walls.left||!spec.walls.right?Math.atan2(rear[2]-front[2],rear[1]-front[1]):Math.asin(Math.max(-1,Math.min(1,(rear[2]-front[2])/p.length))))*180/Math.PI};
}
export function inspectBox(v,walls){
 const spec=specFromValues(v,walls),r=resolveSpec(spec),p=parameters(r.parameters),net=unfold(p);
 if(net.collisions.length)throw new DesignError('NET_OVERLAP','','The folding layout contains overlapping panels.');
 return {spec,p};
}
export function hingeRiseForTilt(v,angle){
 const W=v.frontWidth,L=v.length,k=(W-v.rearWidth)/2,S=Math.hypot(L,k),arm=W*L/S,maximum=arm*Math.sin(Math.PI/3);
 const measure=h=>{
  const p={length:L,width0:W,width1:v.rearWidth,l0:h/2};
  const vv=Math.abs(k)<1e-12?hingeVertices({...p,l0:W*Math.sin(Math.asin(h/W)/2)},1):taperedHingeVertices(p,1);
  const front=[(vv.E[1]+vv.F[1])/2,(vv.E[2]+vv.F[2])/2],rear=[(vv.J[1]+vv.G[1])/2,(vv.J[2]+vv.G[2])/2];
  return Math.atan2(rear[1]-front[1],rear[0]-front[0])*180/Math.PI;
 };
 const a=measure(.000001),b=measure(maximum);
 if(Math.abs(a-b)<1e-8){if(Math.abs(angle)>1e-7)throw new DesignError('TILT_CONFLICT','','This direct connection keeps longitudinal tilt at 0°.');return null;}
 if(angle<Math.min(a,b)-1e-7||angle>Math.max(a,b)+1e-7)throw new DesignError('TILT_CONFLICT','',`This direct connection permits longitudinal tilt between ${Math.min(a,b).toFixed(2)}° and ${Math.max(a,b).toFixed(2)}° in the current solver.`);
 let lo=.000001,hi=maximum;for(let i=0;i<40;i++){const mid=(lo+hi)/2;if((measure(mid)<angle)===(b>a))lo=mid;else hi=mid;}
 return (lo+hi)/2;
}
export function editorHandles(spec,state={mode:'actuation',progress:1}){
 if(!state||typeof state!=='object'||state.mode!=='actuation'||!Number.isFinite(state.progress)||state.progress<0||state.progress>1||Object.keys(state).some(k=>!['mode','progress'].includes(k)))throw new DesignError('INVALID_STATE','/state','Interaction geometry requires actuation progress from 0 to 1.');
 const r=resolveSpec(spec),p=parameters(r.parameters),m=model(p),v=pose({...p,opening:state.progress}).v,mirror=r.mirror;
 const point=q=>mirror?[-q[0],q[1],q[2]]:[...q];
 const physicalEdges=topEdges(p,v,mirror);
 const bottomPairs={front:['A','B'],rear:['D','C'],left:mirror?['B','C']:['A','D'],right:mirror?['A','D']:['B','C']};
 const offsets={front:[0,-12,0],rear:[0,12,0],left:[-12,0,0],right:[12,0,0]};
 const edges=Object.entries(physicalEdges).map(([id,e])=>{const bottomMm=bottomPairs[id].map(i=>point(v[i])),mid=midpoint(...bottomMm);return {id,label:id[0].toUpperCase()+id.slice(1),...e,bottomMm,labelPointMm:mid.map((x,i)=>x+offsets[id][i])};});
 const handles=[
  {id:'length',label:'Length',pointMm:[0,p.length,0],axis:[0,1,0],factor:1},
  {id:'frontWidth',label:'Front width',pointMm:[p.width0/2,0,0],axis:[1,0,0],factor:2},
  {id:'rearWidth',label:'Rear width',pointMm:[p.width1/2,p.length,0],axis:[1,0,0],factor:2},
  ...edges.map(e=>{const pointMm=midpoint(...e.topMm);return {id:e.id+'Rise',label:e.label+' rise',pointMm,axis:[0,0,1],factor:1,value:pointMm[2],edge:e.id,fixed:['left','right'].includes(e.id)&&!spec.walls[e.id]};})
 ];
 const sideTargets=['left','right'].map(side=>({side,present:spec.walls[side],pointMm:[(side==='left'?-1:1)*(p.width0+p.width1)/4+(side==='left'?-5:5),p.length/2,0]}));
 const panelIds=m.faces.map(f=>mirror?f.id.replace(/^right/,'left'):f.id);
 const targets={
  outline:{panelIds:['top','bottom'],edgeIds:['front','rear'],handleIds:['frontWidth','rearWidth']},
  longitudinal:{panelIds:['top'],edgeIds:['front','rear'],handleIds:['frontRise','rearRise'],heightGuides:true},
  lateral:{panelIds:panelIds.filter(id=>id==='top'||/left|right/.test(id)),edgeIds:['left','right'],handleIds:['leftRise','rightRise'],heightGuides:true}
 };
 for(const side of ['left','right']){targets[side+'Connection']={panelIds:panelIds.filter(id=>id==='top'||id.startsWith(side==='left'?'right':'left')),edgeIds:[side],handleIds:[side+'Rise'],hingeAxes:true};targets[side+'Wall']={panelIds:panelIds.filter(id=>id.startsWith(side)),edgeIds:[side],handleIds:[side+'Rise'],heightGuides:true};}
 return {progress:state.progress,handles,edges,targets,sideTargets,surfaces:m.faces.filter(f=>/left|right/.test(f.id)).map(f=>({panelId:mirror?f.id.replace(/^right/,'left'):f.id,side:mirror?'left':f.id.startsWith('left')?'left':'right'}))};
}
