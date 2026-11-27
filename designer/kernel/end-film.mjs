// Material-coordinate film atlas around the finite plastic skeleton.
// Every carrier/half-hinge/long-fin patch has an independent isometric map.
import {add,sub,mul,dot,cross,unit,point,points,clipUV,area,inPolygon} from './sheet-folds.mjs';
import {wallTuckClosedState,wallTuckGapAudit,wallTuckPhysicalPose} from './wall-tuck-thickness.mjs';
import {heatedFilmLayers} from './film-seal-study.mjs';
import {solidPanelMesh} from './thick-folds.mjs';
const length=v=>Math.hypot(...v),distance=(a,b)=>length(sub(a,b));
function frame(uv,xyz){
 const [a,b,c]=uv,u=sub(b,a),v=sub(c,a),d=u[0]*v[1]-u[1]*v[0],w=sub(xyz[1],xyz[0]),z=sub(xyz[2],xyz[0]);
 const x=mul(sub(mul(w,v[1]),mul(z,u[1])),1/d),y=mul(sub(mul(z,u[0]),mul(w,v[0])),1/d);
 return {origin:sub(xyz[0],add(mul(x,a[0]),mul(y,a[1]))),x,y};
}
function elbow(item,target,g){
 const a=item.first[0],b=item.second[0],u=unit(sub(item.first[1],a)),d=sub(b,a),mid=mul(add(a,b),.5);let n=length(d)>1e-8?unit(cross(u,d)):unit(sub(target,mid));if(dot(n,sub(target,mid))<0)n=mul(n,-1);
 return add(mid,mul(n,Math.sqrt(Math.max(0,g*g/4-dot(d,d)/4))));
}
function stripFrame(c,state,j,half){
 const h=c.context.program.hinges[j],uv=h.axisUvMm,du=sub(uv[1],uv[0]),v=mul(unit([-du[1],du[0]]),h.movingSide),a=c.context.net.p.gap/2,item=wallTuckGapAudit(c,state).items[j],parent=state.panels[j],target=point(parent,uv[0]),q=elbow(item,target,2*a),shift=sub(item.first[1],item.first[0]);
 return half===0?frame([sub(uv[0],mul(v,a)),uv[0],sub(uv[1],mul(v,a))],[item.first[0],q,add(item.first[0],shift)]):frame([uv[0],add(uv[0],mul(v,a)),uv[1]],[q,item.second[0],add(q,shift)]);
}
function seamFrame(c,state,faceIndex,fin){
 const f=c.context.net.faces[faceIndex],uv=c.context.net.seam.map(id=>[-f.flat[id][0],f.flat[id][1]]),u=sub(uv[1],uv[0]),cent=mul(f.panel.map(p=>[-p[0],p[1]]).reduce(add,[0,0]),1/f.panel.length);let n=unit([-u[1],u[0]]);if(dot(n,sub(cent,uv[0]))>0)n=mul(n,-1);
 const g=c.context.net.p.gap,item=wallTuckGapAudit(c,state).items.at(-1),out=[...c.context.normal0,0],q=elbow(item,add(item.first[0],mul(out,g)),g),root=faceIndex===0?item.first[0]:item.second[0],shift=sub(item.first[1],item.first[0]);
 return {normal:n,uv,transform:fin?frame([uv[0],add(uv[0],n),uv[1]],[q,add(q,out),add(q,shift)]):frame([sub(uv[0],mul(n,g/2)),uv[0],sub(uv[1],mul(n,g/2))],[root,q,add(root,shift)])};
}
export function endFilmAtlas(c,{opening=0,retainedLongFinMm=2,referenceYRange=c.context.retainedReferenceYRange??null}={}){
 const state=wallTuckClosedState(c,opening,true),zero={...c,inwardOffsets:c.inwardOffsets.map(()=>[0,0,0])},flat=wallTuckClosedState(zero,0,true),bounds=c.context.bounds,g=c.context.net.p.gap;
 let remaining={id:'blank',uvMm:[[bounds.minX,bounds.minY],[bounds.maxX,bounds.minY],[bounds.maxX,bounds.maxY],[bounds.minX,bounds.maxY]]};const patches=[];
 const interval=(patch,a,n,lo,hi)=>{let p=patch;if(Number.isFinite(lo))p=clipUV(p,add(a,mul(n,lo)),n,1);if(p&&Number.isFinite(hi))p=clipUV(p,add(a,mul(n,hi)),n,-1);return p;};
 const push=(patch,id,role,finite,flat)=>{if(patch)patches.push({...patch,id,role,transform:finite,flatTransform:flat});};
 for(let j=0;j<5;j++){
  const h=c.context.program.hinges[j],a=h.axisUvMm[0],d=sub(h.axisUvMm[1],a),n=mul(unit([-d[1],d[0]]),h.movingSide),body=interval(remaining,a,n,-Infinity,-g/2);
  push(body,'carrier-'+j,'carrier',state.panels[j].transform,flat.panels[j].transform);
  push(interval(remaining,a,n,-g/2,0),'hinge-'+j+'-0','hinge',stripFrame(c,state,j,0),stripFrame(c,flat,j,0));
  push(interval(remaining,a,n,0,g/2),'hinge-'+j+'-1','hinge',stripFrame(c,state,j,1),stripFrame(c,flat,j,1));
  remaining=interval(remaining,a,n,g/2,Infinity);
 }
 push(remaining,'carrier-5','carrier',state.panels[5].transform,flat.panels[5].transform);
 for(const i of [0,5]){
  const index=patches.findIndex(p=>p.id==='carrier-'+i),p=patches[index],s=seamFrame(c,state,i,false),z=seamFrame(c,flat,i,false),a=s.uv[0],n=s.normal;
  patches.splice(index,1);push(interval(p,a,n,-Infinity,-g/2),p.id,p.role,p.transform,p.flatTransform);
  push(interval(p,a,n,-g/2,0),'seam-overhang-'+i,'seam',s.transform,z.transform);
  const sf=seamFrame(c,state,i,true),zf=seamFrame(c,flat,i,true),offset=wallTuckPhysicalPose(c,{phase:'seal',progress:1}).heater.outwardOffsetMm,b=c.context.options.heatWidthMm;
  push(interval(p,a,n,0,offset),'long-fin-'+i+'-root','fin',sf.transform,zf.transform);
  push(interval(p,a,n,offset,Math.min(retainedLongFinMm,offset+b)),'long-fin-'+i+'-weld','fin-weld',sf.transform,zf.transform);
  if(retainedLongFinMm>offset+b)push(interval(p,a,n,offset+b,retainedLongFinMm),'long-fin-'+i+'-tip','fin',sf.transform,zf.transform);
 }
 if(referenceYRange){if(referenceYRange.length!==2||!referenceYRange.every(Number.isFinite)||referenceYRange[0]>=referenceYRange[1])throw Error('Invalid retained film range.');for(let i=patches.length-1;i>=0;i--){const a=clipWorldY(patches[i],referenceYRange[0],1),b=a?clipWorldY(a,referenceYRange[1],-1):null;if(b)patches[i]=b;else patches.splice(i,1);}}
 let maxIsometryError=0,maxContinuityError=0;const continuityConflicts=[],conflictKeys=new Set();
 for(const p of patches)for(const t of [p.transform,p.flatTransform])maxIsometryError=Math.max(maxIsometryError,Math.abs(dot(t.x,t.x)-1),Math.abs(dot(t.y,t.y)-1),Math.abs(dot(t.x,t.y)));
 for(let i=0;i<patches.length;i++)for(let j=i+1;j<patches.length;j++)for(const v of [...patches[i].uvMm,...patches[j].uvMm])if(inPolygon(v,patches[i].uvMm)&&inPolygon(v,patches[j].uvMm)){const world=[point(patches[i],v),point(patches[j],v)],errorMm=distance(...world),key=[i,j,...v.map(x=>Math.round(x*1e7))].join(',');maxContinuityError=Math.max(maxContinuityError,errorMm);if(errorMm>1e-8&&!conflictKeys.has(key)){conflictKeys.add(key);continuityConflicts.push({patchIds:[patches[i].id,patches[j].id],uvMm:[...v],pointsMm:world,errorMm});}}
 return {schema:'origami-box/end-film-atlas/1',patches,state,opening,retainedLongFinMm,maxIsometryError,maxContinuityError,continuityConflicts};
}
function clipWorldY(patch,value,side){const t=patch.flatTransform,n=[t.x[1],t.y[1]],origin=mul(n,(value-t.origin[1])/dot(n,n));return clipUV(patch,origin,n,side);}
export function endFilmProblem(c,{end='front',opening=0,retainedLongFinMm=2,endTrimAllowanceMm=2,rootClearanceMm=c.thicknessMm*2,subdivisions=2}={}){
 if(!['front','rear'].includes(end))throw Error('End must be front or rear.');
 if(![retainedLongFinMm,endTrimAllowanceMm,rootClearanceMm].every(Number.isFinite)||endTrimAllowanceMm<0||rootClearanceMm<=0||retainedLongFinMm<=c.context.options.heatWidthMm)throw Error('Invalid retained film or root clearance.');
 const atlas=endFilmAtlas(c,{opening,retainedLongFinMm}),isFront=end==='front',sign=isFront?-1:1,net=c.context.net,p=net.p,bodyY=atlas.state.panels.flatMap(p=>points(p).map(v=>v[1])),rootY=isFront?Math.min(...bodyY)-rootClearanceMm:Math.max(...bodyY)+rootClearanceMm;
 const depth=(net.endDepths?.[isFront?0:1]??(isFront?p.l0:p.l1))+p.clearance,sealY=isFront?-depth:p.length+depth,band=p.gap>0?c.context.options.heatWidthMm:0,parts=[];
 if(!Number.isFinite(band)||band<=0||sign*(sealY-sign*band/2-rootY)<=0)throw Error('The heat band must lie outside the plastic with a positive free-film transition.');
 for(const patch of atlas.patches){
  const initialCap=clipWorldY(patch,rootY,sign),cap=initialCap?clipWorldY(initialCap,sealY+sign*(band/2+endTrimAllowanceMm),-sign):null;if(!cap)continue;
  const body=clipWorldY(cap,sealY-sign*band/2,-sign),tail=clipWorldY(cap,sealY-sign*band/2,sign);
  if(body)parts.push({...body,id:patch.id+'-free',sourceId:patch.id,zone:'free'});if(tail)parts.push({...tail,id:patch.id+'-band-tail',sourceId:patch.id,zone:'weld'});
 }
 // Insert all material-boundary vertices before fan triangulation, then shared
 // midpoint refinement. A shared UV point always has one mesh vertex identity.
 const all=parts.flatMap(p=>p.uvMm),nodes=[],triangles=[],index=new Map(),members=[];
 const finFlat=parts.filter(p=>p.role.startsWith('fin')).flatMap(p=>all.filter(v=>inPolygon(v,p.uvMm)).map(v=>point({...p,transform:p.flatTransform},v).slice(0,2)));
 const key=p=>p.map(v=>Math.round(v*1e8)).join(',');
 const node=(uv,part)=>{const k=key(uv);let i=index.get(k);if(i===undefined){i=nodes.length;index.set(k,i);nodes.push([...uv]);members.push([]);}if(!members[i].includes(part))members[i].push(part);return i;};
 function edgePoints(a,b,part){const d=sub(b,a),D=dot(d,d),t=part.flatTransform,pool=part.role.startsWith('fin')?[...all,...finFlat.map(v=>{const q=sub([...v,t.origin[2]],t.origin);return [dot(q,t.x),dot(q,t.y)];})]:all;return pool.filter(p=>{const t=dot(sub(p,a),d)/D;return t>=-1e-8&&t<=1+1e-8&&Math.abs((p[0]-a[0])*d[1]-(p[1]-a[1])*d[0])<1e-7;}).sort((p,q)=>dot(sub(p,a),d)-dot(sub(q,a),d)).filter((p,i,vs)=>i===0||distance(p,vs[i-1])>1e-7);}
 function subdivide(vs,part,level){if(!level){triangles.push({nodes:vs.map(v=>node(v,part)),part});return;}const [a,b,d]=vs,ab=mul(add(a,b),.5),bd=mul(add(b,d),.5),da=mul(add(d,a),.5);for(const tri of [[a,ab,da],[ab,b,bd],[da,bd,d],[ab,bd,da]])subdivide(tri,part,level-1);}
 parts.forEach((p,j)=>{let polygon=p.uvMm.flatMap((a,i)=>edgePoints(a,p.uvMm[(i+1)%p.uvMm.length],p).slice(0,-1));const xy=v=>point({...p,transform:p.flatTransform},v),signed=polygon.reduce((s,a,i)=>{const b=polygon[(i+1)%polygon.length],v=xy(a),w=xy(b);return s+v[0]*w[1]-w[0]*v[1];},0);if(signed<0)polygon.reverse();let first=0;for(let i=1;i<polygon.length;i++){const a=xy(polygon[i]),b=xy(polygon[first]);if(a[0]<b[0]-1e-7||Math.abs(a[0]-b[0])<1e-7&&a[1]<b[1])first=i;}polygon=[...polygon.slice(first),...polygon.slice(0,first)];const center=mul(polygon.reduce(add,[0,0]),1/polygon.length);for(let i=0;i<polygon.length;i++)if(Math.abs((polygon[i][0]-center[0])*(polygon[(i+1)%polygon.length][1]-center[1])-(polygon[i][1]-center[1])*(polygon[(i+1)%polygon.length][0]-center[0]))>1e-10)subdivide([center,polygon[i],polygon[(i+1)%polygon.length]],j,subdivisions);});
 const initial=nodes.map((v,i)=>point(parts[members[i][0]],v)),flat=nodes.map((v,i)=>point({...parts[members[i][0]],transform:parts[members[i][0]].flatTransform},v)),root=[],weld=[];
 for(let i=0;i<nodes.length;i++){const Y=flat[i][1];if(Math.abs(Y-rootY)<1e-6)root.push(i);if(sign*(Y-(sealY-sign*band/2))>=-1e-7)weld.push(i);}
 const edgeMap=new Map();for(const tri of triangles)for(let j=0;j<3;j++){const a=tri.nodes[j],b=tri.nodes[(j+1)%3],k=[a,b].sort((a,b)=>a-b).join(',');edgeMap.set(k,{nodes:[a,b],length:distance(nodes[a],nodes[b])});}
 const weldMap=new Map(),contactMap=new Map();for(let i=0;i<nodes.length;i++){const key=flat[i].slice(0,2).map(x=>Math.round(x*1e6)).join(',');if(members[i].some(j=>parts[j].role==='fin-weld')){if(!weldMap.has(key))weldMap.set(key,[]);weldMap.get(key).push(i);}if(members[i].some(j=>parts[j].role.startsWith('fin'))){if(!contactMap.has(key))contactMap.set(key,[]);contactMap.get(key).push(i);}}const priorWeldGroups=[...weldMap.values()].filter(g=>g.length>1),coincidentContactGroups=[...contactMap.values()].filter(g=>g.length>1);
 const z0=Math.min(...initial.filter((_,i)=>root.includes(i)).map(p=>p[2])),z1=Math.max(...initial.filter((_,i)=>root.includes(i)).map(p=>p[2]));
 return {schema:'origami-box/end-film-problem/1',end,opening,nodesUvMm:nodes,initialMm:initial,flatMm:flat,triangles,edges:[...edgeMap.values()],root,weld,priorWeldGroups,coincidentContactGroups,members,rootY,sealY,bandWidthMm:band,sealPlaneZMm:(z0+z1)/2,plasticMeshes:atlas.state.panels.map(solidPanelMesh),plasticThicknessMm:c.thicknessMm,maxRetreatMm:p.clearance-band/2,parts:parts.map(p=>({id:p.id,sourceId:p.sourceId,role:p.role,zone:p.zone,uvMm:p.uvMm,transform:p.transform,flatTransform:p.flatTransform})),atlasChecks:{maxIsometryError:atlas.maxIsometryError,maxContinuityError:atlas.maxContinuityError}};
}
export function endFilmClampTargets(c,problem,progress){
 const scaled={...c,inwardOffsets:c.inwardOffsets.map(v=>v.map(x=>x*(1-progress)))},atlas=endFilmAtlas(scaled,{opening:problem.opening*(1-progress)}),map=new Map(atlas.patches.map(p=>[p.id,p]));
 return problem.nodesUvMm.map((uv,i)=>{const part=problem.parts[problem.members[i][0]],p=map.get(part.sourceId),v=point(p,uv);return add(v,[0,0,problem.sealPlaneZMm*progress]);});
}
function sectionIntervals(atlas,Y){
 const result=[];for(const patch of atlas.patches){const ps=patch.uvMm.map(v=>point({...patch,transform:patch.flatTransform},v)),xs=[];for(let i=0;i<ps.length;i++){const a=ps[i],b=ps[(i+1)%ps.length];if((a[1]<=Y&&b[1]>=Y||a[1]>=Y&&b[1]<=Y)&&Math.abs(a[1]-b[1])>1e-10)xs.push(a[0]+(b[0]-a[0])*(Y-a[1])/(b[1]-a[1]));}if(xs.length)result.push({id:patch.id,role:patch.role,minX:Math.min(...xs),maxX:Math.max(...xs)});}return result;
}
export function endSealLayerRegistry(c,end='front'){
 const atlas=endFilmAtlas(c),p=c.context.net.p,depth=(c.context.net.endDepths?.[end==='front'?0:1]??p.l0)+p.clearance,Y=end==='front'?-depth:p.length+depth,b=c.context.options.heatWidthMm,sections=[];
 for(const y of [Y-b/2+1e-7,Y,Y+b/2-1e-7]){
  const intervals=sectionIntervals(atlas,y),cuts=[...new Set(intervals.flatMap(i=>[i.minX,i.maxX]).map(x=>Math.round(x*1e7)/1e7))].sort((a,b)=>a-b),cells=[];
  for(let i=1;i<cuts.length;i++){const x=(cuts[i]+cuts[i-1])/2,sources=intervals.filter(s=>s.minX<x&&s.maxX>x);if(cuts[i]-cuts[i-1]>1e-6)cells.push({minX:cuts[i-1],maxX:cuts[i],layers:sources.map(s=>s.id),count:sources.length});}
  sections.push({y,cells});
 }
 const cells=sections.flatMap(s=>s.cells),minX=Math.min(...cells.map(c=>c.minX)),maxX=Math.max(...cells.map(c=>c.maxX));
 return {end,referenceSealY:Y,heatedBandWidthMm:b,minX,maxX,sections,counts:[...new Set(cells.map(c=>c.count))].sort(),registryPass:cells.length>0&&cells.every(c=>c.count===2||c.count===4),printedGuideHalfWidthMm:(end==='front'?p.width0:p.width1)/2,
  guideExtensionRequired:Math.max(0,-minX-(end==='front'?p.width0:p.width1)/2,maxX-(end==='front'?p.width0:p.width1)/2),scope:'Material layer registry over the complete transverse band; gusset zones have four intended layers, central skin zones two. This does not certify a nonintersecting finite-thickness approach path.'};
}
export function endFilmAirwayTopology(c,{stepMm=.75,extraBondBands=[]}={}){
 const atlas=endFilmAtlas(c),front=endSealLayerRegistry(c,'front'),rear=endSealLayerRegistry(c,'rear'),p=c.context.net.p,top=atlas.patches.find(p=>p.id==='carrier-3'),uv=[-c.context.net.inlet[0],c.context.net.inlet[1]],inlet=point({...top,transform:top.flatTransform},uv),bounds={minX:-Math.max(p.width0,p.width1)/2,maxX:Math.max(p.width0,p.width1)/2,minY:front.referenceSealY+front.heatedBandWidthMm/2,maxY:rear.referenceSealY-rear.heatedBandWidthMm/2};
 const width=Math.ceil((bounds.maxX-bounds.minX)/stepMm),height=Math.ceil((bounds.maxY-bounds.minY)/stepMm),allowed=new Uint8Array(width*height),polys=atlas.patches.map(p=>({id:p.id,poly:p.uvMm.map(v=>point({...p,transform:p.flatTransform},v).slice(0,2))}));
 for(let j=0;j<height;j++)for(let i=0;i<width;i++){const x=bounds.minX+(i+.5)*stepMm,y=bounds.minY+(j+.5)*stepMm,cover=polys.filter(p=>inPolygon([x,y],p.poly));if(cover.length===2&&cover.some(p=>p.id==='carrier-0')&&cover.some(p=>p.id==='carrier-3')&&!extraBondBands.some(b=>x>=b.minX&&x<=b.maxX&&y>=b.minY&&y<=b.maxY))allowed[j*width+i]=1;}
 const closest=v=>{let id=-1,best=Infinity;for(let k=0;k<allowed.length;k++)if(allowed[k]){const x=bounds.minX+(k%width+.5)*stepMm,y=bounds.minY+(Math.floor(k/width)+.5)*stepMm,d=(x-v[0])**2+(y-v[1])**2;if(d<best){best=d;id=k;}}return {id,distanceMm:Math.sqrt(best)};};
 const start=closest(inlet),goal=closest([0,p.length/2]),seen=new Uint8Array(allowed.length),previous=new Int32Array(allowed.length).fill(-1),queue=start.id>=0?[start.id]:[];if(start.id>=0)seen[start.id]=1;
 for(let t=0;t<queue.length;t++){const k=queue[t],x=k%width,y=Math.floor(k/width);for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const xx=x+dx,yy=y+dy,n=yy*width+xx;if(xx>=0&&xx<width&&yy>=0&&yy<height&&allowed[n]&&!seen[n]){seen[n]=1;previous[n]=k;queue.push(n);}}}
 const connected=goal.id>=0&&!!seen[goal.id]&&start.distanceMm<stepMm*1.5,path=[];if(connected)for(let k=goal.id;k>=0;k=previous[k])path.push([bounds.minX+(k%width+.5)*stepMm,bounds.minY+(Math.floor(k/width)+.5)*stepMm]);
 return {kind:'unbonded-material-corridor',connected,inletReferenceMm:inlet,pathReferenceMm:path.reverse(),stepMm,frontRegistryPass:front.registryPass,rearRegistryPass:rear.registryPass,currentPositiveApertureVerified:false,pressureDrivenFlowVerified:false,
  scope:'Conservative two-skin unbonded corridor from the inlet to the body. Unbonded contact may separate; this is distinct from a positive instantaneous fluid gap or measured flow.'};
}
export function endLongSeamCoverage(c){
 const atlas=endFilmAtlas(c),flatState=wallTuckClosedState({...c,inwardOffsets:c.inwardOffsets.map(()=>[0,0,0])},0,true),f=seamFrame(c,flatState,0,true),a=point({transform:f.transform},f.uv[0]),u=unit(sub(point({transform:f.transform},f.uv[1]),a)),n=[...c.context.normal0,0],front=endSealLayerRegistry(c,'front'),rear=endSealLayerRegistry(c,'rear'),b=c.context.options.heatWidthMm,offset=wallTuckPhysicalPose(c,{phase:'seal',progress:1}).heater.outwardOffsetMm,start=add(a,mul(n,offset));
 const y0=front.referenceSealY-b/2,y1=rear.referenceSealY+b/2,t0=(y0-start[1]-Math.min(0,n[1]*b))/u[1],t1=(y1-start[1]-Math.max(0,n[1]*b))/u[1],band=[[t0,0],[t1,0],[t1,b],[t0,b]].map(([v,w])=>add(start,add(mul(u,v),mul(n,w))));
 const layers=heatedFilmLayers(atlas.patches.map(p=>({id:p.id,pointsMm:p.uvMm.map(v=>point({...p,transform:p.flatTransform},v))})),band),ids=layers.fullyCoveringPatchIds;
 return {...layers,bandReferenceMm:band,covered:ids.includes('long-fin-0-weld')&&ids.includes('long-fin-5-weld'),requiredWorldYRange:[y0,y1],scope:'The existing longitudinal seal must reach beyond both transverse seal bands, not stop at the plastic ends.'};
}
export function minimumEndBlankMargin(c,{upperMm=100,toleranceMm=1e-4}={}){
 const old=c.context.options.marginMm,withMargin=m=>{const d=m-old,b=c.context.bounds;return {...c,context:{...c.context,options:{...c.context.options,marginMm:m},bounds:{minX:b.minX-d,maxX:b.maxX+d,minY:b.minY-d,maxY:b.maxY+d}}};};
 let lo=.01,hi=upperMm;if(!endLongSeamCoverage(withMargin(hi)).covered)return {found:false};for(let k=0;k<40&&hi-lo>toleranceMm;k++){const mid=(lo+hi)/2;if(endLongSeamCoverage(withMargin(mid)).covered)hi=mid;else lo=mid;}
 return {found:true,minimumMarginMm:hi,currentMarginMm:old,currentCovered:endLongSeamCoverage(c).covered};
}
export function endFilmInletClearance(c,{diameterMm=null}={}){
 const atlas=endFilmAtlas(c),p=c.context.net,top=atlas.patches.find(p=>p.id==='carrier-3'),center=point({...top,transform:top.flatTransform},[-p.inlet[0],p.inlet[1]]),f=endSealLayerRegistry(c,'front'),r=endSealLayerRegistry(c,'rear'),front=center[1]-(f.referenceSealY+f.heatedBandWidthMm/2),rear=r.referenceSealY-r.heatedBandWidthMm/2-center[1],distanceToEndSealMm=Math.min(front,rear);
 return {diameterMm,dimensionStatus:diameterMm===null?'unconfirmed':'specified',inletReferenceMm:center,distanceToEndSealMm,maximumDiameterToAvoidEndBandsMm:2*distanceToEndSealMm,pointOutsideEndBands:distanceToEndSealMm>0,diameterClearOfEndBands:diameterMm===null?null:diameterMm/2<distanceToEndSealMm,scope:'Material-reference end-band exclusion only. Hole diameter, port intrusion and flow clearance are not inferred from the word small.'};
}
export function endFilmBodyMeshes(c,frontProblem,rearProblem){
 const atlas=endFilmAtlas(c),meshes=[];for(const p of atlas.patches){const a=clipWorldY(p,frontProblem.rootY,1),b=a?clipWorldY(a,rearProblem.rootY,-1):null;if(!b)continue;meshes.push({id:'body-'+p.id,role:'body-film',sourceId:p.id,verticesMm:b.uvMm.map(v=>point(b,v)),faces:[b.uvMm.map((_,i)=>i)],uvMm:b.uvMm});}return meshes;
}
export function endFilmOverlayProblem(c,options={}){
 if(!Number.isFinite(options.axialGridMm??2)||(options.axialGridMm??2)<=0)throw Error('Axial mesh spacing must be positive.');
 const base=endFilmProblem(c,{...options,subdivisions:0}),parts=base.parts,polys=parts.map(p=>p.uvMm.map(v=>point({transform:p.flatTransform},v).slice(0,2))),all=polys.flat(),bounds={minX:Math.min(...all.map(p=>p[0])),maxX:Math.max(...all.map(p=>p[0])),minY:Math.min(...all.map(p=>p[1])),maxY:Math.max(...all.map(p=>p[1]))};
 const lines=[],lineKeys=new Set();
 for(const poly of polys)for(let i=0;i<poly.length;i++){const a=poly[i],d=sub(poly[(i+1)%poly.length],a);let n=unit([-d[1],d[0]]),v=dot(n,a);if(n[0]<-1e-9||Math.abs(n[0])<1e-9&&n[1]<0){n=mul(n,-1);v=-v;}const key=[...n,v].map(x=>Math.round(x*1e7)).join(',');if(!lineKeys.has(key)){lineKeys.add(key);lines.push({n,v});}}
 for(let y=bounds.minY+(options.axialGridMm??2);y<bounds.maxY-1e-7;y+=options.axialGridMm??2)lines.push({n:[0,1],v:y});
 let cells=[{uvMm:[[bounds.minX,bounds.minY],[bounds.maxX,bounds.minY],[bounds.maxX,bounds.maxY],[bounds.minX,bounds.maxY]]}];
 for(const {n,v} of lines){const next=[];for(const cell of cells){const ds=cell.uvMm.map(p=>dot(n,p)-v);if(Math.min(...ds)<-1e-8&&Math.max(...ds)>1e-8){for(const s of [-1,1]){const p=clipUV(cell,mul(n,v),n,s);if(p)next.push(p);}}else next.push(cell);}cells=next;}
 const nodes=[],initial=[],flat=[],members=[],layoutNodeId=[],uvIndex=new Map(),layoutIndex=new Map(),layoutNodes=[],triangles=[],layoutTriangles=[];
 const key=p=>p.map(x=>Math.round(x*1e8)).join(',');
 const layoutNode=xy=>{const k=key(xy);if(!layoutIndex.has(k)){layoutIndex.set(k,layoutNodes.length);layoutNodes.push(xy);}return layoutIndex.get(k);};
 const materialNode=(xy,j)=>{const p=parts[j],t=p.flatTransform,q=sub([...xy,0],t.origin),uv=[dot(q,t.x),dot(q,t.y)],k=key(uv);let i=uvIndex.get(k);if(i===undefined){i=nodes.length;uvIndex.set(k,i);nodes.push(uv);initial.push(point(p,uv));flat.push([...xy,0]);members.push([]);layoutNodeId.push(layoutNode(xy));}if(!members[i].includes(j))members[i].push(j);return i;};
 function emit(xys,cover,level){if(level){const [a,b,d]=xys,ab=mul(add(a,b),.5),bd=mul(add(b,d),.5),da=mul(add(d,a),.5);for(const t of [[a,ab,da],[ab,b,bd],[da,bd,d],[ab,bd,da]])emit(t,cover,level-1);return;}
  const layout=layoutTriangles.length,layerFaces=[];for(const j of cover){const ids=xys.map(v=>materialNode(v,j));layerFaces.push(triangles.length);triangles.push({nodes:ids,part:j,layout});}layoutTriangles.push({nodes:xys.map(layoutNode),faces:layerFaces});
 }
 for(const cell of cells){const center=mul(cell.uvMm.reduce(add,[0,0]),1/cell.uvMm.length),cover=polys.map((p,j)=>inPolygon(center,p)?j:-1).filter(j=>j>=0);if(!cover.length)continue;for(let i=1;i<cell.uvMm.length-1;i++){const tri=[cell.uvMm[0],cell.uvMm[i],cell.uvMm[i+1]];if(area(tri)>1e-8)emit(tri,cover,options.subdivisions??0);}}
 const edgeMap=new Map();for(const t of triangles)for(let j=0;j<3;j++){const a=t.nodes[j],b=t.nodes[(j+1)%3],k=[a,b].sort((a,b)=>a-b).join(',');edgeMap.set(k,{nodes:[a,b],length:distance(nodes[a],nodes[b])});}
 const sign=base.end==='front'?-1:1,root=[],weld=[],weldMap=new Map(),contactMap=new Map();
 for(let i=0;i<nodes.length;i++){if(Math.abs(flat[i][1]-base.rootY)<1e-6)root.push(i);if(sign*(flat[i][1]-(base.sealY-sign*base.bandWidthMm/2))>=-1e-7)weld.push(i);const k=key(flat[i].slice(0,2));for(const [role,map] of [['fin-weld',weldMap],['fin',contactMap]])if(members[i].some(j=>role==='fin'?parts[j].role.startsWith(role):parts[j].role===role)){if(!map.has(k))map.set(k,[]);map.get(k).push(i);}}
 return {...base,nodesUvMm:nodes,initialMm:initial,flatMm:flat,triangles,edges:[...edgeMap.values()],members,root,weld,priorWeldGroups:[...weldMap.values()].filter(g=>g.length>1),coincidentContactGroups:[...contactMap.values()].filter(g=>g.length>1),layoutNodeId,layoutNodesMm:layoutNodes,layoutTriangles,meshModel:'shared planar overlay across every coincident material layer'};
}
