// Research candidate only: a material-coordinate film blank, directed folds,
// external fin flaps and a finite heated footprint. No pneumatic certificate.
import {resolveSpec,DesignError} from './spec.mjs';
import {parameters,unfold,distance} from './geometry.mjs';
import {contacts} from './validate.mjs';
import {panelsCoplanar} from './fabrication-motion.mjs';
const add=(a,b)=>a.map((x,i)=>x+b[i]),sub=(a,b)=>a.map((x,i)=>x-b[i]),mul=(a,s)=>a.map(x=>x*s);
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],norm=v=>Math.hypot(...v),unit=v=>mul(v,1/norm(v));
const rotate=(v,a,u,t)=>{const q=sub(v,a),c=Math.cos(t),s=Math.sin(t);return add(a,add(add(mul(q,c),mul(cross(u,q),s)),mul(u,dot(u,q)*(1-c))));};
const rotateVector=(v,u,t)=>rotate(v,[0,0,0],u,t);
const area=uv=>Math.abs(uv.reduce((sum,a,i)=>{const b=uv[(i+1)%uv.length];return sum+a[0]*b[1]-a[1]*b[0];},0))/2;
const identity=()=>({origin:[0,0,0],x:[1,0,0],y:[0,1,0]});
const point=(patch,p)=>add(patch.transform.origin,add(mul(patch.transform.x,p[0]),mul(patch.transform.y,p[1])));
const points=patch=>patch.uvMm.map(p=>point(patch,p));
function clip(patch,a,n,sign){
 const output=[],uv=patch.uvMm,level=v=>sign*dot(sub(point(patch,v),a),n);
 for(let i=0;i<uv.length;i++){
  const p=uv[i],q=uv[(i+1)%uv.length],d=level(p),e=level(q);if(d>=-1e-9)output.push(p);
  if(d>1e-9&&e < -1e-9||d < -1e-9&&e>1e-9)output.push(p.map((x,j)=>x+(q[j]-x)*d/(d-e)));
 }
 const clean=output.filter((p,i)=>i===0||distance(p,output[i-1])>1e-8);
 if(clean.length>2&&distance(clean[0],clean.at(-1))<1e-8)clean.pop();
 return clean.length>=3&&area(clean)>1e-8?{...patch,uvMm:clean}:null;
}
function turn(patch,a,u,angle){const t=patch.transform;return {...patch,transform:{origin:rotate(t.origin,a,u,angle),x:rotateVector(t.x,u,angle),y:rotateVector(t.y,u,angle)}};}
function flatEdge(face,ids){return ids.map(id=>[-face.flat[id][0],face.flat[id][1],0]);}
function outward(face,edge){const [a,b]=flatEdge(face,edge),u=unit(sub(b,a)),n=cross(u,[0,0,1]),c=face.panel.reduce((s,p)=>add(s,[-p[0]/face.panel.length,p[1]/face.panel.length,0]),[0,0,0]);return dot(n,sub(c,a))>0?mul(n,-1):n;}
function inPolygon(p,poly){let sign=0;for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],d=(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);if(Math.abs(d)<1e-7)continue;const s=Math.sign(d);if(sign&&sign!==s)return false;sign=s;}return true;}
function frameRectangle(u0,u1,d0,d1,base,u,d){return [[u0,d0],[u1,d0],[u1,d1],[u0,d1]].map(([a,b])=>add(base,add(mul(u,a),mul(d,b))));}
function containsRectangle(patch,rectangle){
 const p=points(patch),origin=p[0],u=unit(sub(p[1],origin)),n=unit(cross(sub(p[1],origin),sub(p[2],origin))),v=cross(n,u),project=q=>[dot(sub(q,origin),u),dot(sub(q,origin),v)];
 return rectangle.every(q=>Math.abs(dot(sub(q,origin),n))<1e-6&&inPolygon(project(q),p.map(project)));
}
function overlapPatch(a,b){
 let result=a;const ps=points(b),normal=unit(cross(b.transform.x,b.transform.y)),center=mul(ps.reduce(add,[0,0,0]),1/ps.length);
 for(let i=0;i<ps.length&&result;i++){const origin=ps[i],edge=sub(ps[(i+1)%ps.length],origin),n=cross(normal,edge),sign=Math.sign(dot(sub(center,origin),n))||1;result=clip(result,origin,n,sign);}
 return result;
}
// Convex, zero-thickness film polygons. Unlike motion collision checks, every
// coplanar material patch counts here, including a partially heated third layer.
export function heatedFilmLayers(film,rectangle){
 const origin=rectangle[0],x=unit(sub(rectangle[1],origin)),y=unit(sub(rectangle[3],origin)),transform={origin,x,y};
 const uv=p=>[dot(sub(p,origin),x),dot(sub(p,origin),y)];
 const footprint={uvMm:rectangle.map(uv),transform},touchingPatchIds=[],fullyCoveringPatchIds=[];
 for(const p of film){
  if(!panelsCoplanar(p.pointsMm,rectangle))continue;
  const patch={uvMm:p.pointsMm.map(uv),transform};
  if(overlapPatch(patch,footprint))touchingPatchIds.push(p.id);
  if(containsRectangle(patch,rectangle))fullyCoveringPatchIds.push(p.id);
 }
 return {touchingPatchIds,fullyCoveringPatchIds};
}
export function studyExternalFin(spec,options){
 const required=['marginMm','heatWidthMm','setbackMm'];
 if(!options||typeof options!=='object'||required.some(k=>!Number.isFinite(options[k])||options[k]<=0)||Object.keys(options).some(k=>![...required,'samples','secondFoldDirection','marginTiming'].includes(k)))throw new DesignError('INVALID_OPTIONS','/options','Supply positive marginMm, heatWidthMm and setbackMm; these are study variables, not hardware defaults.');
 const {marginMm:m,heatWidthMm:b,setbackMm:s,samples=61,secondFoldDirection='down',marginTiming='before-close'}=options;
 if(!['down','up'].includes(secondFoldDirection)||!['before-close','after-close'].includes(marginTiming))throw new DesignError('INVALID_OPTIONS','/options','Unknown fold-direction or margin-timing study.');
 if(!Number.isInteger(samples)||samples<3||samples>501)throw new DesignError('INVALID_OPTIONS','/options/samples','Use 3 to 501 samples per fold.');
 const resolved=resolveSpec(spec);if(!resolved.spec.walls.left||!resolved.spec.walls.right)throw new DesignError('UNSUPPORTED_STUDY','/spec','This candidate uses both side pairs.');
 const net=unfold(parameters(resolved.parameters)),failures=[],world=net.faces.map(f=>Object.fromEntries(f.ids.map(id=>[id,[-f.flat[id][0],f.flat[id][1],0]])));
 const seam0=flatEdge(net.faces[0],net.seam),seam5=flatEdge(net.faces[5],net.seam),n0=outward(net.faces[0],net.seam),n5=outward(net.faces[5],net.seam);
 const bounds={minX:-net.bounds.maxX-m,maxX:-net.bounds.minX+m,minY:net.bounds.minY-m,maxY:net.bounds.maxY+m};
 const blank={id:'blank',region:'body',uvMm:[[bounds.minX,bounds.minY],[bounds.maxX,bounds.minY],[bounds.maxX,bounds.maxY],[bounds.minX,bounds.maxY]],transform:identity(),stackLevel:0};
 const flap0=clip(blank,seam0[0],n0,1),flap5=clip(blank,seam5[0],n5,1),body=clip(clip(blank,seam0[0],n0,-1),seam5[0],n5,-1);
 if(!flap0||!flap5||!body)throw new DesignError('INVALID_FILM_BLANK','/spec','The selected film blank does not produce two free margins.');
 flap0.id='free-end-0';flap0.region='end-0';flap5.id='free-end-5';flap5.region='end-5';body.id='body';
 if(clip(flap0,seam5[0],n5,1))failures.push({code:'SOURCE_MARGIN_OVERLAP',message:'The two source margins overlap; this blank needs a different end treatment.'});
 const [h0,h1]=flatEdge(net.faces[1],net.hinges[1]),axis1=unit(sub(h1,h0)),normal1=cross(axis1,[0,0,1]),test=world[2].E;
 const side1=Math.sign(dot(sub(test,h0),normal1))||1;
 let sheet=[flap0,body,flap5],rigidPanels=net.faces.map(f=>({id:f.id,uvMm:f.panel.map(p=>[-p[0],p[1]]),transform:identity()})),steps=[],intersections=[],stackViolations=[],maxIsometryErrorMm=0,maxPanelAttachmentErrorMm=0;
 function record(id,title,items,fold=null,panelItems=rigidPanels){steps.push({id,title,film:items.map(p=>({id:p.id,region:p.region,stackLevel:p.stackLevel,uvMm:p.uvMm.map(v=>[...v]),pointsMm:points(p)})),panels:panelItems.map(p=>({id:p.id,pointsMm:points(p)})),fold});}
 function panelFold(origin,normal,side,axis,angle){
  const before=rigidPanels;
  for(const p of before){const ds=points(p).map(v=>side*dot(sub(v,origin),normal));if(Math.min(...ds)<-1e-6&&Math.max(...ds)>1e-6)failures.push({code:'CREASE_CUTS_RIGID_PANEL',panelId:p.id,message:'A proposed film crease cuts across a rigid panel.'});}
  return t=>before.map(p=>{const center=mul(points(p).reduce(add,[0,0,0]),1/p.uvMm.length);return side*dot(sub(center,origin),normal)>1e-7?turn(p,origin,axis,angle*t):p;});
 }
 function checkPath(id,make,panelMake=()=>rigidPanels){
  const start=make(0),near=make(1e-5),startPolys=start.map(points);
  for(const [i,j] of contacts(startPolys,0)){
   if(!panelsCoplanar(startPolys[i],startPolys[j]))continue;
   const overlap=overlapPatch(start[i],start[j]);if(!overlap)continue;
   const ps=points(overlap),p=mul(ps.reduce(add,[0,0,0]),1/ps.length),velocity=(item,later)=>{const q=sub(p,item.transform.origin),uv=[dot(q,item.transform.x),dot(q,item.transform.y)];return sub(point(later,uv),p)[2];};
   const dz=velocity(start[i],near[i])-velocity(start[j],near[j]),order=start[i].stackLevel-start[j].stackLevel;
   if(dz*order < -1e-10)stackViolations.push({step:id,patchIds:[start[i].id,start[j].id],reason:'A moving sheet would depart through a layer already below/above it.'});
  }
  for(let k=0;k<samples;k++){
   const items=make(k/(samples-1)),polys=items.map(points),pairs=contacts(polys,0).filter(([i,j])=>!panelsCoplanar(polys[i],polys[j]));
   if(pairs.length)intersections.push({step:id,progress:k/(samples-1),pairs:pairs.map(pair=>pair.map(i=>items[i].id))});
   for(const item of items){const p=points(item);for(let i=0;i<p.length;i++)for(let j=i+1;j<p.length;j++)maxIsometryErrorMm=Math.max(maxIsometryErrorMm,Math.abs(distance(p[i],p[j])-distance(item.uvMm[i],item.uvMm[j])));}
   for(const panel of panelMake(k/(samples-1))){
    const uv=[...panel.uvMm,panel.uvMm.reduce((a,p)=>a.map((x,j)=>x+p[j]/panel.uvMm.length),[0,0])];
    for(const v of uv){const attached=items.filter(p=>inPolygon(v,p.uvMm));if(!attached.length)maxPanelAttachmentErrorMm=Infinity;for(const p of attached)maxPanelAttachmentErrorMm=Math.max(maxPanelAttachmentErrorMm,distance(point(p,v),point(panel,v)));}
   }
  }
 }
 record('flat','Film blank and free margins',sheet);
 const pieces=[];
 for(const item of sheet){const stay=clip(item,h0,normal1,-side1),move=clip(item,h0,normal1,side1);if(stay)pieces.push({...stay,id:item.id+'-stay',moving:false});if(move)pieces.push({...move,id:item.id+'-move',moving:true});}
 if(pieces.some(p=>p.region==='end-0'&&p.moving)||pieces.some(p=>p.region==='end-5'&&!p.moving))failures.push({code:'MARGIN_CROSSES_FIRST_FOLD',message:'A free margin crosses the first crease. Additional end-film folds must be planned.'});
 const radial=sub(world[2].E,h0),sign1=Math.sign(cross(axis1,radial)[2])||1;
 const first=t=>pieces.map(p=>p.moving?turn(p,h0,axis1,Math.PI*sign1*t):p),firstPanels=panelFold(h0,normal1,side1,axis1,Math.PI*sign1);checkPath('first-side-up',first,firstPanels);sheet=first(1).map(p=>({...p,stackLevel:p.moving?1:0}));rigidPanels=firstPanels(1);
 record('first-side-up','Fold first side pair upward',sheet,{axisMm:[h0,h1],signedAngleRad:Math.PI*sign1});
 // Prepare the two free margins BEFORE the last small panel closes underneath.
 const u0=unit(sub(seam0[1],seam0[0])),a5=rotate(seam5[0],h0,axis1,Math.PI*sign1),b5=rotate(seam5[1],h0,axis1,Math.PI*sign1),u5=unit(sub(b5,a5)),n5now=rotateVector(n5,axis1,Math.PI*sign1);
 const angle0=-Math.sign(cross(u0,n0)[2])*Math.PI/2,angle5=Math.sign(cross(u5,n5now)[2])*Math.PI/2;
 function bendMargin0(){const before=sheet,fold=t=>before.map(p=>p.region==='end-0'?turn(p,seam0[0],u0,angle0*t):p);checkPath('first-margin-down',fold);sheet=fold(1);record('first-margin-down','Fold the first free margin downward',sheet);}
 if(marginTiming==='before-close'){
  bendMargin0();const before=sheet,fold=t=>before.map(p=>p.region==='end-5'?turn(p,a5,u5,angle5*t):p);checkPath('last-margin-up',fold);sheet=fold(1);record('last-margin-up','Pre-fold the far free margin upward',sheet);
 }
 const edge2=net.hinges[4],a2=rotate(world[4][edge2[0]],h0,axis1,Math.PI*sign1),b2=rotate(world[4][edge2[1]],h0,axis1,Math.PI*sign1),u2=unit(sub(b2,a2)),n2=cross(u2,[0,0,1]);
 const edge5=rotate(world[5][net.seam[0]],h0,axis1,Math.PI*sign1),side2=Math.sign(dot(sub(edge5,a2),n2))||1;
 const downSign=-Math.sign(cross(u2,sub(edge5,a2))[2])||-1,sign2=secondFoldDirection==='down'?downSign:-downSign;
 const pieces2=[];
 for(const item of sheet){
  if(item.region!=='body'){
   const distances=points(item).map(p=>side2*dot(sub(p,a2),n2)),moving=item.region==='end-5';
   if(moving&&Math.min(...distances)<-1e-6||!moving&&Math.max(...distances)>1e-6)failures.push({code:'MARGIN_CROSSES_SECOND_FOLD',message:'A pre-folded margin straddles the next fold; this plan is not valid for that blank.'});
   pieces2.push({...item,moving});continue;
  }
  const stay=clip(item,a2,n2,-side2),move=clip(item,a2,n2,side2);if(stay)pieces2.push({...stay,id:item.id+'-stay2',moving:false});if(move)pieces2.push({...move,id:item.id+'-move2',moving:true});
 }
 const second=t=>pieces2.map(p=>p.moving?turn(p,a2,u2,Math.PI*sign2*t):p),secondPanels=panelFold(a2,n2,side2,u2,Math.PI*sign2);checkPath('second-side-'+secondFoldDirection,second,secondPanels);
 record('second-side-'+secondFoldDirection+'-mid','Second side pair moving '+secondFoldDirection,second(.5),{axisMm:[a2,b2],signedAngleRad:Math.PI*sign2/2},secondPanels(.5));
 sheet=second(1).map(p=>({...p,stackLevel:p.moving?(secondFoldDirection==='down'?-1:2):p.stackLevel}));rigidPanels=secondPanels(1);record('second-side-'+secondFoldDirection,'Close second side pair '+secondFoldDirection,sheet,{axisMm:[a2,b2],signedAngleRad:Math.PI*sign2});
 if(marginTiming==='after-close'){
  bendMargin0();const endA=rotate(a5,a2,u2,Math.PI*sign2),endB=rotate(b5,a2,u2,Math.PI*sign2),endU=unit(sub(endB,endA)),endNormal=rotateVector(n5now,u2,Math.PI*sign2),angle=-Math.sign(cross(endU,endNormal)[2])*Math.PI/2;
  const before=sheet,fold=t=>before.map(p=>p.region==='end-5'?turn(p,endA,endU,angle*t):p);checkPath('last-margin-after-close',fold);sheet=fold(1);record('last-margin-after-close','Try extracting the last margin after closing',sheet);
 }
 const down=[0,0,-1],L=distance(...seam0),band=frameRectangle(0,L,s,s+b,seam0[0],u0,down),target=sheet.filter(p=>p.region==='end-0'||p.region==='end-5');
 // Count all film, including coplanar body layers, for the heated footprint.
 const thermal=heatedFilmLayers(sheet.map(p=>({id:p.id,pointsMm:points(p)})),band),covering=sheet.filter(p=>thermal.fullyCoveringPatchIds.includes(p.id));
 const marginNormals=target.map(p=>unit(cross(p.transform.x,p.transform.y))),opposedMarginNormals=marginNormals.length===2&&dot(...marginNormals)<-1+1e-6;
 if(!opposedMarginNormals)failures.push({code:'MARGIN_ORIENTATION',message:'The two free margins do not present opposing material faces.'});
 if(m<s+b)failures.push({code:'INSUFFICIENT_MARGIN',message:'The free margin must be at least setback + heated-band width.'});
 if(!covering.some(p=>p.region==='end-0')||!covering.some(p=>p.region==='end-5'))failures.push({code:'HEATED_BAND_NOT_COVERED',message:'Both free margins do not cover the entire chosen heated band.'});
 if(thermal.touchingPatchIds.length!==2)failures.push({code:'HEATED_LAYER_COUNT',message:'The heated footprint must overlap exactly two material patches, including partial overlaps.'});
 const nonTarget=sheet.filter(p=>p.region==='body'),bodyMinZ=Math.min(...nonTarget.flatMap(points).map(p=>p[2]));
 if(bodyMinZ < -1e-6)failures.push({code:'BODY_FILM_IN_FIN_REGION',message:'Non-target film extends below the body plane into the fin region.'});
 if(intersections.length)failures.push({code:'FILM_CROSSING',message:'Non-adjacent film patches cross during this proposed folding sequence.'});
 if(stackViolations.length)failures.push({code:'STACK_ORDER_VIOLATION',message:'The proposed extraction passes through a film layer already deposited underneath.'});
 if(maxPanelAttachmentErrorMm>1e-6)failures.push({code:'PANEL_FILM_ATTACHMENT',message:'The proposed film folds do not carry each rigid panel continuously.'});
 const totalArea=sheet.reduce((sum,p)=>sum+area(p.uvMm),0),areaErrorMm2=Math.abs(totalArea-area(blank.uvMm));
 record('heat-fin','Heat only the two external margins',sheet);
 return {schema:'origami-box/film-seal-study/1',status:'candidate',parameters:{marginMm:m,heatWidthMm:b,setbackMm:s,secondFoldDirection,marginTiming},blankMm:bounds,steps,
  heater:{bandMm:band,approachAxis:unit(cross(u0,down)),targetRegions:['end-0','end-5'],coveringPatchIds:covering.map(p=>p.id),touchingPatchIds:thermal.touchingPatchIds,bodyMinimumZMm:bodyMinZ,opposedMarginNormals},
  seamRootConstraint:{coincidenceEnforcedByWeld:false,maximumSeparationMm:2*s,evidence:'For corresponding cross-section material paths, each root is s from the first bonded edge. Triangle inequality bounds root separation by 2s; this is an allowance, not a predicted motion.'},
  checks:{candidatePass:failures.length===0&&maxIsometryErrorMm<1e-6&&areaErrorMm2<1e-6,sampledFilmPathPass:intersections.length===0&&stackViolations.length===0&&maxIsometryErrorMm<1e-6&&maxPanelAttachmentErrorMm<1e-6,localHeaterIsolationPass:covering.length===2&&thermal.touchingPatchIds.length===2&&bodyMinZ>=-1e-6&&m>=s+b&&opposedMarginNormals,materialAreaPreserved:areaErrorMm2<1e-6,maxIsometryErrorMm,maxPanelAttachmentErrorMm,areaErrorMm2,intersections,stackViolations,failures},
  manufacturingReady:false,limitations:['This is a local longitudinal-seal candidate, not an approved complete fabrication guide.','Only the heated band over the rigid-panel axial span is checked; end-seal junctions are not certified.','A nonzero setback leaves seam-root separation freedom; the welded fin does not impose the ideal coincident-root linkage.','The full sealer housing, positive thickness, post-seal membrane motion and pressure-driven behavior are unverified.']};
}
