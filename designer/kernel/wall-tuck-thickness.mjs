// Finite-panel accommodation and the post-seal change to two inward walls.
import {pose,distance} from './geometry.mjs';
import {outwardMaps} from './fabrication-motion.mjs';
import {add,sub,mul,dot,cross,unit,point,points,rotate,inPolygon} from './sheet-folds.mjs';
import {compileThickFolds,thickFoldState,thickPoseValue,panelNormal,thickPanelContacts} from './thick-folds.mjs';
function rigidFrame(face,map){
 const ids=face.ids,a=ids[0],uv=id=>[-face.flat[id][0],face.flat[id][1]],q=uv(a);
 let b,c,det;
 for(let i=1;i<ids.length&&!det;i++)for(let j=i+1;j<ids.length;j++){const u=sub(uv(ids[i]),q),v=sub(uv(ids[j]),q),d=u[0]*v[1]-u[1]*v[0];if(Math.abs(d)>1e-9){b=ids[i];c=ids[j];det=d;break;}}
 const u=sub(uv(b),q),v=sub(uv(c),q),w=sub(map[b],map[a]),z=sub(map[c],map[a]),x=mul(sub(mul(w,v[1]),mul(z,u[1])),1/det),y=mul(sub(mul(z,u[0]),mul(w,v[0])),1/det);
 return {origin:sub(map[a],add(mul(x,q[0]),mul(y,q[1]))),x,y};
}
function idealPanels(context,opening,inward=false){
 const p=context.net.p,net=context.net;
 let maps;
 if(inward){const v=pose({...p,opening}).v;maps=net.faces.map(f=>Object.fromEntries(f.ids.map(id=>[id,v[id]])));}
 else{const a=outwardMaps(p,net,opening),v=pose({...p,opening}).v;maps=net.faces.map((f,i)=>i===4||i===5?Object.fromEntries(f.ids.map(id=>[id,v[id]])):a[i]);}
 return context.program.initial.panels.map((panel,i)=>({...panel,transform:rigidFrame(net.faces[i],maps[i])}));
}
export function wallTuckThickContext(context,{samples=101}={}){
 const thicknessMm=context.net.p.thickness;if(thicknessMm<=0)throw Error('A positive panel thickness is required for this study.');
 const program=compileThickFolds(context.program,{thicknessMm,gapMm:context.net.p.gap,samples}),end=thickFoldState(program,{step:3}),reference=idealPanels(context,0);
 const offsets=end.panels.map((p,i)=>{const r=reference[i],d=sub(p.transform.origin,r.transform.origin);return [dot(d,r.transform.x),dot(d,r.transform.y),dot(d,panelNormal(r))];});
 const H=point(end.panels[3],[0,0])[2],closed=idealPanels(context,0,true),heights=[0,H/2,H/2,H,H/2,H/2],inwardOffsets=closed.map((p,i)=>[0,0,heights[i]/panelNormal(p)[2]]);
 return {context,program,thicknessMm,offsets,inwardOffsets,stackHeightMm:H};
}
export function wallTuckClosedState(c,opening,inward=false){
 const panels=idealPanels(c.context,opening,inward),offsets=inward?c.inwardOffsets:c.offsets;
 const state={panels:panels.map((p,i)=>{const v=offsets[i],n=panelNormal(p),d=mul(add(add(mul(p.transform.x,v[0]),mul(p.transform.y,v[1])),mul(n,v[2])),1-opening);return {...p,thicknessMm:c.thicknessMm,transform:{...p.transform,origin:add(p.transform.origin,d)}};}),strips:[]};
 // Project small panel translations onto the available unbonded film gaps.
 // Rotations/shapes remain rigid. No axial slip is allowed along a hinge.
 const joints=[...c.context.net.hinges.map((ids,i)=>({ids,i,j:i+1})),{ids:c.context.net.seam,i:0,j:5}],g=c.context.net.p.gap;
 const vector=(i,j,v)=>{const r=Array(15).fill(0);for(let k=0;k<3;k++){if(i)r[(i-1)*3+k]+=v[k];if(j)r[(j-1)*3+k]-=v[k];}return r;},basis=[],values=[];
 for(const {ids,i,j} of joints){
  const a=physicalEdgePoint(c,state,i,ids),b=physicalEdgePoint(c,state,j,ids),u=unit(sub(a[1],a[0]));let row=vector(i,j,u),rhs=-dot(sub(a[0],b[0]),u);
  for(let pass=0;pass<2;pass++)for(let k=0;k<basis.length;k++){const d=dot(row,basis[k]);row=sub(row,mul(basis[k],d));rhs-=d*values[k];}
  const n=Math.hypot(...row);if(n>1e-9){basis.push(mul(row,1/n));values.push(rhs/n);}
 }
 const apply=delta=>{for(let i=1;i<6;i++)state.panels[i].transform.origin=add(state.panels[i].transform.origin,delta.slice((i-1)*3,i*3));};
 apply(basis.reduce((s,q,i)=>add(s,mul(q,values[i])),Array(15).fill(0)));
 for(let iteration=0;iteration<240;iteration++){
  let residual=0;
  for(const joint of joints){
   const {ids,i,j}=joint,a=physicalEdgePoint(c,state,i,ids),b=physicalEdgePoint(c,state,j,ids),d=sub(a[0],b[0]),length=Math.hypot(...d),excess=Math.max(0,length-g);residual=Math.max(residual,excess);
   if(excess>0){let gradient=vector(i,j,mul(d,1/length));for(const q of basis)gradient=sub(gradient,mul(q,dot(gradient,q)));const norm2=dot(gradient,gradient);if(norm2>1e-12)apply(mul(gradient,-excess/norm2));}
  }
  if(residual<1e-8)break;
 }
 return state;
}
function physicalEdgePoint(c,state,faceIndex,ids){
 const f=c.context.net.faces[faceIndex],uv=ids.map(id=>[-f.flat[id][0],f.flat[id][1]]),d=sub(uv[1],uv[0]),n=unit([-d[1],d[0]]),center=mul(f.panel.map(p=>[-p[0],p[1]]).reduce(add,[0,0]),1/f.panel.length),toward=Math.sign(dot(sub(center,uv[0]),n))||1;
 return uv.map(p=>point(state.panels[faceIndex],add(p,mul(n,toward*c.context.net.p.gap/2))));
}
export function wallTuckGapAudit(c,state){
 const item=(id,a,b)=>({id,first:a,second:b,chordMm:Math.max(distance(a[0],b[0]),distance(a[1],b[1])),axialSlipMm:Math.abs(dot(sub(a[0],b[0]),unit(sub(a[1],a[0]))))});
 const g=c.context.net.p.gap,items=c.context.net.hinges.map((ids,i)=>{const a=physicalEdgePoint(c,state,i,ids),b=physicalEdgePoint(c,state,i+1,ids);return item('hinge-'+i,a,b);});
 const ids=c.context.net.seam,a=physicalEdgePoint(c,state,0,ids),b=physicalEdgePoint(c,state,5,ids);items.push(item('sealed-long-edge',a,b));
 return {items,maxChordMm:Math.max(...items.map(i=>i.chordMm)),maxAxialSlipMm:Math.max(...items.map(i=>i.axialSlipMm)),availableFilmWidthMm:g,reachable:items.every(i=>i.chordMm<=g+1e-6&&i.axialSlipMm<1e-6)};
}
export function wallTuckThicknessAudit(c,{samples=201}={}){
 if(!Number.isInteger(samples)||samples<3||samples>1001)throw Error('Use 3..1001 samples.');
 const collisions=[],gapFailures=[];let maxChordMm=0,maxRigidErrorMm=0;
 for(const inward of [false,true])for(let k=0;k<samples;k++){
  const opening=inward?1-k/(samples-1):k/(samples-1),s=wallTuckClosedState(c,opening,inward),hits=thickPanelContacts(s.panels),g=wallTuckGapAudit(c,s);maxChordMm=Math.max(maxChordMm,g.maxChordMm);
  if(hits.length)collisions.push({inward,opening,pairs:hits});if(!g.reachable)gapFailures.push({inward,opening,items:g.items.filter(i=>i.chordMm>g.availableFilmWidthMm+1e-6)});
  s.panels.forEach((p,i)=>{const a=points(p),b=c.context.program.initial.panels[i].uvMm;for(let x=0;x<a.length;x++)for(let y=x+1;y<a.length;y++)maxRigidErrorMm=Math.max(maxRigidErrorMm,Math.abs(distance(a[x],a[y])-distance(b[x],b[y])));});
 }
 return {samplesPerBranch:samples,maxRigidErrorMm,maxChordMm,collisions,gapFailures,finitePanelPathPass:!c.program.failures.length&&!collisions.length&&!gapFailures.length&&maxRigidErrorMm<1e-6,
  scope:'Finite one-sided rigid-panel volumes, sampled prism collision tests and available film-gap chord lengths. Gap reachability does not establish full membrane fold shape or end-seal airtightness.'};
}
function ribbonMesh(id,a,q,b,shift,role='hinge'){
 return {id,role,verticesMm:[a,q,b,...[a,q,b].map(p=>add(p,shift))],faces:[[0,1,4,3],[1,2,5,4]]};
}
function elbow(item,target,gap){
 const a=item.first[0],b=item.second[0],u=unit(sub(item.first[1],a)),d=sub(b,a),length=Math.hypot(...d),m=mul(add(a,b),.5);
 let n=length>1e-8?unit(cross(u,d)):unit(sub(target,m));
 if(dot(n,sub(target,m))<0)n=mul(n,-1);
 return add(m,mul(n,Math.sqrt(Math.max(0,gap*gap/4-length*length/4))));
}
export function wallTuckPhysicalPose(c,{phase='prefold',step=0,progress=1}={}){
 if(!['prefold','seal','open','inward','front-seal','rear-seal'].includes(phase)||!Number.isFinite(progress)||progress<0||progress>1)throw Error('Invalid physical guide state.');
 const state=phase==='prefold'||phase==='seal'?thickFoldState(c.program,{step:phase==='seal'?3:step,progress:phase==='seal'?1:progress}):wallTuckClosedState(c,phase==='open'?progress:phase==='inward'?1-progress:0,phase!=='open');
 const result=thickPoseValue({...state,strips:[]}),g=c.context.net.p.gap,items=wallTuckGapAudit(c,state).items,cues=[];
 for(let j=0;j<5;j++){
  const ids=c.context.net.hinges[j],parent=state.panels[j],face=c.context.net.faces[j],axis=ids.map(id=>point(parent,[-face.flat[id][0],face.flat[id][1]])),item=items[j],q=elbow(item,axis[0],g);
  result.meshes.push(ribbonMesh('hinge-'+j,item.first[0],q,item.second[0],sub(item.first[1],item.first[0])));
  const names={4:'A',3:'B',1:'C'},active=phase==='prefold'&&step>0&&[4,3,1][step-1]===j;
  if(active||step===0&&phase==='prefold')cues.push({id:'hinge-'+j,role:'fold',pointsMm:axis,active,label:names[j]});
 }
 // The two unbonded edge overhangs each have length gap/2. Their common
 // equal-link elbow is a seal reference; the rest of the end membrane is not solved.
 if(phase!=='prefold'){
  const item=items.at(-1),p=item.first[0],u=unit(sub(item.first[1],p)),n=[...c.context.normal0,0],target=add(p,mul(n,g)),q=elbow(item,target,g),shift=sub(item.first[1],p),a=g/2,free=c.context.options.marginMm;
  const guides=[];
  for(const [index,faceIndex] of [[0,0],[1,5]]){
   const root=index?item.second[0]:p,desired=unit(sub(q,root));
   // During clamp, rotate a fixed-length overhang; after clamp keep the bond closed.
   let end=q;
   if(phase==='seal'){
    const face=c.context.net.faces[faceIndex],uv=c.context.net.seam.map(id=>[-face.flat[id][0],face.flat[id][1]]),d=sub(uv[1],uv[0]),nn=unit([-d[1],d[0]]),center=mul(face.panel.map(v=>[-v[0],v[1]]).reduce(add,[0,0]),1/face.panel.length),side=dot(sub(center,uv[0]),nn)>0?-1:1;
    const out=add(mul(state.panels[faceIndex].transform.x,nn[0]*side),mul(state.panels[faceIndex].transform.y,nn[1]*side)),angle=Math.atan2(dot(u,cross(out,desired)),dot(out,desired)),direction=rotate(out,[0,0,0],u,angle*progress);end=add(root,mul(direction,a));
   }
   guides.push([end,add(end,shift)]);
   const bandEnd=add(end,mul(n,free));
   result.meshes.push({id:'seam-film-'+index,role:'seam-film',region:index?'end-5':'end-0',verticesMm:[root,end,bandEnd,add(root,shift),add(end,shift),add(bandEnd,shift)],faces:[[0,1,4,3],[1,2,5,4]]});
  }
  result.seamGuideMismatchMm=Math.max(distance(guides[0][0],guides[1][0]),distance(guides[0][1],guides[1][1]));
  if(phase==='seal')guides.forEach((pointsMm,i)=>cues.push({id:'long-seal-'+i,role:'seal',pointsMm,active:true}));
  result.sealedLongEdge=phase!=='seal'||progress===1;
  if(phase==='seal'&&progress===1){
   const envelope=Math.max(...result.meshes.filter(m=>m.role!=='seam-film').flatMap(m=>m.verticesMm.map(p=>dot(sub(p,q),n)))),offset=Math.max(c.context.options.sealOffsetMm,envelope+1e-5,0),b=c.context.options.heatWidthMm,start=add(q,mul(n,offset));
   result.bandMm=[start,add(start,shift),add(add(start,shift),mul(n,b)),add(start,mul(n,b))];
   result.heater={outwardOffsetMm:offset,minimumBodyEnvelopeOffsetMm:Math.max(0,envelope),heatedWidthMm:b,marginMm:free,normalApproachClear:free>=offset+b,targetRegions:['end-0','end-5'],scope:'Outside the projection of all modeled plastic solids and hinge strips; full loose end-film regions remain unmodeled.'};
  }
 }
 if(phase==='inward'||phase==='front-seal'||phase==='rear-seal'){
  result.wallDirections={left:phase==='inward'&&progress<1?'transitioning-inward':'inward',right:'inward'};
  if(phase!=='inward'){
   const j=phase==='front-seal'?0:1;
   for(const [i,k] of [[0,2+j],[3,4+j]]){const guide=c.context.net.seals[k];cues.push({id:phase+'-'+i,role:'seal',active:true,pointsMm:[guide.a,guide.b].map(v=>point(state.panels[i],[-v[0],v[1]]))});}
  }
 }
 return {...result,cues,physicalThicknessMm:c.thicknessMm,film:[],state:{phase,step,progress},manufacturingReady:false,scope:'Finite rigid panels and local inextensible gap strips. End-seal film/gussets remain unverified.'};
}
export function wallTuckPhysicalStoryboard(c,{framesPerFold=61}={}){
 if(!Number.isInteger(framesPerFold)||framesPerFold<3||framesPerFold>181)throw Error('Use 3..181 frames per fold.');
 const descriptors=[
  {phase:'prefold',step:0,title:'Start flat',instruction:'Plastic is attached on the upper side of the flat film. Solid panel thickness is shown at its actual scale.'},
  {phase:'prefold',step:1,title:'A · Fold the last small panel DOWN',instruction:'Fold the last small panel downward onto its mate. Keep track of which plastic face is attached to the film.'},
  {phase:'prefold',step:2,title:'B · Swing the doubled pair UP',instruction:'Swing the two folded small panels upward together onto the large panel.'},
  {phase:'prefold',step:3,title:'C · Fold the remaining strip UP',instruction:'Keep the third fold direction. Fold at the opposite wall middle to overlap the large panels.'},
  {phase:'seal',title:'Seal the first long edge',instruction:'Bring the two flexible free margins together outside the plastic stack. The green footprint stays outward of the modeled body and hinge strips.'},
  {phase:'open',title:'Open the sealed pouch',instruction:'Keep the first long seal joined. Open until the opposite side-wall panels are straight; the prepared wall remains on its inward branch.'},
  {phase:'inward',title:'Tuck the OPPOSITE wall inward',instruction:'Turn the side wall used for the large half-fold inward, then flatten again. Both side walls must now fold into the box before either end is sealed.'},
  {phase:'front-seal',title:'Front end-seal reference',instruction:'Keep both side walls inward before closing this end. The complete loose end-film and gusset positioning are not solved in this study.'},
  {phase:'rear-seal',title:'Rear end-seal reference',instruction:'Keep both side walls inward before closing the other end. These are end-sealing references, not a validated end-membrane simulation.'}
 ];
 return descriptors.map((d,i)=>{
  const count=i===0||i>=7?1:framesPerFold,frames=[];
  for(let k=0;k<count;k++){
   const progress=count===1?1:k/(count-1),p=wallTuckPhysicalPose(c,{...d,progress}),moving=i>=1&&i<=3?c.program.steps[i-1].movingPanelIds:i===5||i===6?c.program.initial.panels.slice(1).map(p=>p.id):[];
   frames.push({...p,emphasizedPanelIds:i===6?['left-lower','left-upper']:moving,operation:{id:d.phase+'-'+(d.step??0),title:d.title,movingPanelIds:moving},angleLabel:i>=1&&i<=3?Math.round(180*progress)+'°':Math.round(progress*100)+'%'});
  }
  return {...d,durationMs:i===4?1600:1800,frames};
 });
}
export function wallTuckStackSection(c,state,side='right'){
 const f=c.context.net.faces[0],ids=side==='right'?['B','C']:['A','D'],edge=ids.map(id=>point(state.panels[0],[-f.flat[id][0],f.flat[id][1]])),mid=mul(add(...edge),.5),u=unit(sub(edge[1],edge[0]));let n=cross(u,[0,0,1]);if(side==='right'&&dot(n,[...c.context.normal0,0])>0||side==='left'&&dot(n,[...c.context.normal0,0])<0)n=mul(n,-1);
 const sample=add(mid,mul(n,5)),layers=[];
 for(const p of state.panels){const vs=points(p);if(!inPolygon(sample.slice(0,2),vs.map(p=>p.slice(0,2))))continue;const mesh=solid(p);layers.push({panelId:p.id,minZMm:Math.min(...mesh.verticesMm.map(p=>p[2])),maxZMm:Math.max(...mesh.verticesMm.map(p=>p[2]))});}
 layers.sort((a,b)=>a.minZMm-b.minZMm);return {pointMm:sample,layers};
}
function solid(p){return thickPoseValue({panels:[p],strips:[]}).meshes[0];}
