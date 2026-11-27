// Independent checks of the solved material mesh. Optimizer success is never
// used as proof of rigidity, nonintersection, weld continuity or an open airway.
import {sub,dot,cross,inPolygon} from './sheet-folds.mjs';
import {collide,panelsCoplanar} from './surface-contacts.mjs';
const length=v=>Math.hypot(...v),distance=(a,b)=>length(sub(a,b));
const triangleArea=ps=>length(cross(sub(ps[1],ps[0]),sub(ps[2],ps[0])))/2;
export function validateEndFilm(problem,solution,{metricToleranceMm=1e-5,contactToleranceMm=1e-6}={}){
 const frames=[];
 for(const frame of solution.frames){
  const positions=frame.positionsMm;let maxEdgeErrorMm=0,maxRelativeStrain=0,maxAreaRelativeError=0,maxPrincipalStrain=0,maxPriorWeldGapMm=0,maxRootErrorMm=0;
  for(const edge of problem.edges){const e=Math.abs(distance(...edge.nodes.map(i=>positions[i]))-edge.length);maxEdgeErrorMm=Math.max(maxEdgeErrorMm,e);maxRelativeStrain=Math.max(maxRelativeStrain,e/edge.length);}
  for(const i of problem.root)maxRootErrorMm=Math.max(maxRootErrorMm,distance(positions[i],problem.initialMm[i]));
  for(const group of problem.priorWeldGroups)for(const j of group.slice(1))maxPriorWeldGapMm=Math.max(maxPriorWeldGapMm,distance(positions[group[0]],positions[j]));
  const tris=problem.triangles.map((t,index)=>{
   const ps=t.nodes.map(i=>positions[i]),uv=t.nodes.map(i=>[...problem.nodesUvMm[i],0]),a=triangleArea(uv),b=triangleArea(ps);maxAreaRelativeError=Math.max(maxAreaRelativeError,Math.abs(a-b)/a);
   const u=sub(uv[1],uv[0]),v=sub(uv[2],uv[0]),w=sub(ps[1],ps[0]),z=sub(ps[2],ps[0]),d=u[0]*v[1]-u[1]*v[0],fx=w.map((x,i)=>(x*v[1]-z[i]*u[1])/d),fy=w.map((x,i)=>(z[i]*u[0]-x*v[0])/d),g0=dot(fx,fx),g1=dot(fy,fy),g01=dot(fx,fy),disc=Math.sqrt((g0-g1)**2+4*g01*g01);for(const s of [Math.sqrt(Math.max(0,(g0+g1+disc)/2)),Math.sqrt(Math.max(0,(g0+g1-disc)/2))])maxPrincipalStrain=Math.max(maxPrincipalStrain,Math.abs(s-1));
   return {index,part:t.part,ids:t.nodes,ps,min:[0,1,2].map(k=>Math.min(...ps.map(p=>p[k]))),max:[0,1,2].map(k=>Math.max(...ps.map(p=>p[k])))};
  });
  const intersections=[];
  for(let i=0;i<tris.length;i++)for(let j=i+1;j<tris.length;j++){
   const a=tris[i],b=tris[j];if(a.ids.some(id=>b.ids.includes(id)))continue;
   if([0,1,2].some(k=>a.max[k]<b.min[k]-contactToleranceMm||b.max[k]<a.min[k]-contactToleranceMm))continue;
   if(!panelsCoplanar(a.ps,b.ps,contactToleranceMm)&&collide(a.ps,b.ps,0))intersections.push({triangles:[i,j],sources:[problem.parts[a.part].sourceId,problem.parts[b.part].sourceId]});
  }
  const bandNodes=problem.weld,z=bandNodes.map(i=>positions[i][2]),bandPlanarityMm=frame.progress===1?Math.max(...z)-Math.min(...z):null;
  let plasticAxialClearanceMm=null;if(problem.plasticMeshes){const plasticY=problem.plasticMeshes.flatMap(m=>m.verticesMm.map(p=>p[1])),filmY=positions.map(p=>p[1]);plasticAxialClearanceMm=problem.end==='front'?Math.min(...plasticY)-Math.max(...filmY):Math.min(...filmY)-Math.max(...plasticY);}
  frames.push({progress:frame.progress,maxEdgeErrorMm,maxRelativeStrain,maxPrincipalStrain,maxAreaRelativeError,maxPriorWeldGapMm,maxRootErrorMm,bandPlanarityMm,plasticAxialClearanceMm,intersections,
   metricPass:maxEdgeErrorMm<=metricToleranceMm,layerGeometryPass:intersections.length===0,priorWeldPass:maxPriorWeldGapMm<contactToleranceMm});
 }
 return {schema:'origami-box/end-film-validation/1',metricToleranceMm,contactToleranceMm,frames,allMetricPass:frames.every(f=>f.metricPass),allLayerGeometryPass:frames.every(f=>f.layerGeometryPass),allPriorWeldPass:frames.every(f=>f.priorWeldPass),materialStrainLimit:null,geometricFlowVerified:false,manufacturingReady:false};
}
export function endFilmMeshes(problem,frame){
 const groups=new Map();for(const t of problem.triangles){const p=problem.parts[t.part];if(!groups.has(p.sourceId))groups.set(p.sourceId,[]);groups.get(p.sourceId).push(t.nodes);}
 return [...groups].map(([id,faces])=>{const used=[...new Set(faces.flat())],map=new Map(used.map((x,i)=>[x,i]));return {id:problem.end+'-'+id,role:'end-film',sourceId:id,verticesMm:used.map(i=>frame.positionsMm[i]),faces:faces.map(f=>f.map(i=>map.get(i)))};});
}
function heightAt(problem,frame,x,y,sourceId){
 const zs=[];for(const t of problem.triangles){if(problem.parts[t.part].sourceId!==sourceId)continue;const [a,b,c]=t.nodes.map(i=>frame.positionsMm[i]),u=sub(b,a),v=sub(c,a),q=[x-a[0],y-a[1]],det=u[0]*v[1]-u[1]*v[0];if(Math.abs(det)<1e-12)continue;const s=(q[0]*v[1]-q[1]*v[0])/det,r=(u[0]*q[1]-u[1]*q[0])/det;if(s>=-1e-7&&r>=-1e-7&&s+r<=1+1e-7)zs.push(a[2]+s*u[2]+r*v[2]);}return zs;
}
export function endFilmSection(problem,frame,{x=0}={}){
 const segments=[];
 for(const t of problem.triangles){const vertices=t.nodes.map(i=>frame.positionsMm[i]),hits=[];for(let k=0;k<3;k++){const a=vertices[k],b=vertices[(k+1)%3],d=b[0]-a[0];if(Math.abs(d)<1e-12){if(Math.abs(a[0]-x)<1e-8)hits.push(a,b);continue;}const u=(x-a[0])/d;if(u>=-1e-8&&u<=1+1e-8)hits.push(a.map((v,i)=>v+u*(b[i]-v)));}const unique=hits.filter((p,i)=>hits.slice(0,i).every(q=>distance(p,q)>1e-7));if(unique.length>=2){unique.sort((a,b)=>a[1]-b[1]);segments.push({sourceId:problem.parts[t.part].sourceId,pointsMm:[unique[0],unique.at(-1)]});}}
 return {xMm:x,segments,scope:'Exact intersection of the displayed piecewise-linear film with a constant-X plane.'};
}
export function endCapCenterlineGap(problem,frame,{x=0,samples=80}={}){
 const targetY=(problem.rootY+problem.sealY)/2,points=[];let minimumGapMm=Infinity,complete=true;
 for(let k=0;k<samples;k++){const y=problem.rootY+(targetY-problem.rootY)*k/(samples-1),bottom=heightAt(problem,frame,x,y,'carrier-0'),top=heightAt(problem,frame,x,y,'carrier-3');if(!bottom.length||!top.length){complete=false;continue;}const lo=Math.max(...bottom),hi=Math.min(...top);minimumGapMm=Math.min(minimumGapMm,hi-lo);points.push([x,y,(lo+hi)/2]);}
 return {complete,minimumGapMm:Number.isFinite(minimumGapMm)?minimumGapMm:null,positiveCenterlineGap:complete&&minimumGapMm>1e-6,pathMm:points,scope:'Geometric centre-line height gap only; not a finite-radius port or measured flow certificate.'};
}
// A shared XY triangulation makes the contact certificate local and exact on
// each piecewise-linear face. Coplanar contact is allowed; a layer swap is not.
export function endFilmLayerAudit(problem,frame,{toleranceMm=1e-6}={}){
 if(!problem.layoutTriangles)throw Error('Shared overlay mesh required.');
 const xy=[],groups=new Map();problem.layoutNodeId.forEach((k,i)=>{if(!groups.has(k))groups.set(k,[]);groups.get(k).push(i);});
 let maxProjectionSpreadMm=0,minAreaRatio=Infinity,minOrderedGapMm=Infinity;const layerInversions=[],projectionFolds=[],overlaps=[];
 for(const [k,ids] of groups){xy[k]=frame.positionsMm[ids[0]].slice(0,2);for(const i of ids)maxProjectionSpreadMm=Math.max(maxProjectionSpreadMm,Math.hypot(...sub(frame.positionsMm[i].slice(0,2),xy[k])));}
 const signed=ps=>(ps[1][0]-ps[0][0])*(ps[2][1]-ps[0][1])-(ps[1][1]-ps[0][1])*(ps[2][0]-ps[0][0]);
 const shapes=problem.layoutTriangles.map((t,index)=>{
  const ps=t.nodes.map(i=>xy[i]),ratio=signed(ps)/signed(t.nodes.map(i=>problem.layoutNodesMm[i]));minAreaRatio=Math.min(minAreaRatio,ratio);if(!(ratio>0))projectionFolds.push(index);
  const layers=t.faces.map(i=>problem.triangles[i]).sort((a,b)=>a.nodes.reduce((s,k)=>s+problem.initialMm[k][2],0)-b.nodes.reduce((s,k)=>s+problem.initialMm[k][2],0));
  for(let j=1;j<layers.length;j++)for(let k=0;k<3;k++){const gap=frame.positionsMm[layers[j].nodes[k]][2]-frame.positionsMm[layers[j-1].nodes[k]][2];minOrderedGapMm=Math.min(minOrderedGapMm,gap);if(gap < -toleranceMm)layerInversions.push({layout:index,corner:k,gapMm:gap});}
  return {ps,index,min:[0,1].map(k=>Math.min(...ps.map(p=>p[k]))),max:[0,1].map(k=>Math.max(...ps.map(p=>p[k])))};
 });
 const interiorOverlap=(a,b)=>{for(const ps of [a,b])for(let k=0;k<3;k++){const d=sub(ps[(k+1)%3],ps[k]),n=[-d[1],d[0]],L=Math.hypot(...n),A=a.map(p=>dot(p,n)/L),B=b.map(p=>dot(p,n)/L);if(Math.min(Math.max(...A),Math.max(...B))-Math.max(Math.min(...A),Math.min(...B))<=toleranceMm)return false;}return true;};
 for(let i=0;i<shapes.length;i++)for(let j=i+1;j<shapes.length;j++){const a=shapes[i],b=shapes[j];if([0,1].some(k=>Math.min(a.max[k],b.max[k])-Math.max(a.min[k],b.min[k])<=toleranceMm))continue;if(interiorOverlap(a.ps,b.ps))overlaps.push([i,j]);}
 return {pass:maxProjectionSpreadMm<=toleranceMm&&projectionFolds.length===0&&layerInversions.length===0&&overlaps.length===0,maxProjectionSpreadMm,minAreaRatio,minOrderedGapMm,projectionFolds,layerInversions,overlaps,scope:'Whole piecewise-linear mesh at this frame; zero-thickness film contact is allowed. Not a continuous-time or finite film-thickness certificate.'};
}
// Break at every projected triangle edge. Heights are affine between breaks,
// so checking endpoints (and each cell's midpoint) bounds the whole centreline.
export function endFilmInletPath(problem,frame,inletReferenceMm){
 const x=inletReferenceMm[0],startY=inletReferenceMm[1],lo=Math.min(startY,problem.rootY),hi=Math.max(startY,problem.rootY),ys=[startY,problem.rootY];
 for(const t of problem.triangles){if(!['carrier-0','carrier-3'].includes(problem.parts[t.part].sourceId))continue;const vs=t.nodes.map(i=>frame.positionsMm[i]);for(let k=0;k<3;k++){const a=vs[k],b=vs[(k+1)%3];if(Math.abs(a[0]-b[0])<1e-12)continue;const u=(x-a[0])/(b[0]-a[0]),y=a[1]+u*(b[1]-a[1]);if(u>=0&&u<=1&&y>lo&&y<hi)ys.push(y);}}
 const breaks=[...new Set(ys.map(y=>Math.round(y*1e9)/1e9))].sort((a,b)=>a-b),samples=breaks.flatMap((y,i)=>i?[y,(y+breaks[i-1])/2]:[y]),path=[];let minimumGapMm=Infinity,complete=true;
 for(const y of samples.sort((a,b)=>Math.abs(a-startY)-Math.abs(b-startY))){const bottom=heightAt(problem,frame,x,y,'carrier-0'),top=heightAt(problem,frame,x,y,'carrier-3');if(!bottom.length||!top.length){complete=false;continue;}const a=Math.max(...bottom),b=Math.min(...top);minimumGapMm=Math.min(minimumGapMm,b-a);path.push([x,y,(a+b)/2]);}
 return {complete,positiveGap:complete&&minimumGapMm>1e-6,minimumGapMm,pathMm:path,referenceStartMm:inletReferenceMm,scope:'Piecewise-linear centreline from the reference inlet to the cap root; excludes port hardware, finite hole radius and pressure-driven flow.'};
}
export function endFilmPlasticPath(problem,capPath,{bodyTargetMm,toleranceMm=1e-7}){
 const path=[...capPath.pathMm,bodyTargetMm],blocked=[];
 for(const mesh of problem.plasticMeshes){const vertices=mesh.verticesMm,centroid=[0,1,2].map(k=>vertices.reduce((s,p)=>s+p[k],0)/vertices.length),planes=mesh.faces.map(face=>{const [a,b,c]=face.map(i=>vertices[i]);let n=cross(sub(b,a),sub(c,a)),L=Math.hypot(...n);n=n.map(v=>v/L);if(dot(n,sub(centroid,a))>0)n=n.map(v=>-v);return {a,n};});
  for(let j=1;j<path.length;j++){const a=path[j-1],d=sub(path[j],a);let lo=0,hi=1,out=false;for(const p of planes){const start=dot(p.n,sub(a,p.a)),slope=dot(p.n,d),bound=-toleranceMm;if(Math.abs(slope)<1e-12){if(start>=bound){out=true;break;}}else if(slope>0)hi=Math.min(hi,(bound-start)/slope);else lo=Math.max(lo,(bound-start)/slope);}if(!out&&lo<hi&&hi>0&&lo<1)blocked.push({panelId:mesh.panelId??mesh.id,segment:j-1});}
 }
 return {clearOfPlastic:capPath.complete&&blocked.length===0,blocked,pathMm:path,scope:'Exact segment-versus-convex-solid interior test for this centreline, including actual panel thickness. No finite port radius or flow rate is inferred.'};
}
