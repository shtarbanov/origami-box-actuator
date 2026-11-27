// Plan an explicit material cut; never merge a discontinuous source boundary.
import {endFilmAtlas,endLongSeamCoverage,minimumEndBlankMargin,endSealLayerRegistry} from './end-film.mjs';
import {area,inPolygon,sub,dot} from './sheet-folds.mjs';
export function withEndBlankMargin(c,marginMm){
 if(!Number.isFinite(marginMm)||marginMm<=0)throw Error('Positive blank margin required.');
 const d=marginMm-c.context.options.marginMm,b=c.context.bounds;
 return {...c,context:{...c.context,options:{...c.context.options,marginMm},bounds:{minX:b.minX-d,maxX:b.maxX+d,minY:b.minY-d,maxY:b.maxY+d}}};
}
export function withEndBlankPlan(c,plan){const q=withEndBlankMargin(c,plan.selectedMarginMm);return {...q,context:{...q.context,retainedReferenceYRange:plan.retainedReferenceYRange??null}};}
const rectangle=b=>[[b.minX,b.minY],[b.maxX,b.minY],[b.maxX,b.maxY],[b.minX,b.maxY]];
function materialOutline(atlas){
 const all=atlas.patches.flatMap(p=>p.uvMm),edges=new Map(),key=p=>p.map(x=>Math.round(x*1e7)).join(',');
 for(const p of atlas.patches)for(let j=0;j<p.uvMm.length;j++){
  const a=p.uvMm[j],b=p.uvMm[(j+1)%p.uvMm.length],d=sub(b,a),D=dot(d,d);if(D<1e-16)continue;
  const pool=[...all,a,b].filter(v=>{const q=sub(v,a),t=dot(q,d)/D;return t>=-1e-8&&t<=1+1e-8&&Math.abs(q[0]*d[1]-q[1]*d[0])<1e-7;}).sort((v,w)=>dot(sub(v,a),d)-dot(sub(w,a),d)).filter((v,i,vs)=>i===0||key(v)!==key(vs[i-1]));
  for(let i=1;i<pool.length;i++){const u=pool[i-1],v=pool[i],k=[key(u),key(v)].sort().join('|');if(edges.has(k))edges.get(k).count++;else edges.set(k,{a:u,b:v,count:1});}
 }
 const boundary=[...edges.values()].filter(e=>e.count===1),neighbors=new Map();for(const e of boundary)for(const [a,b] of [[e.a,e.b],[e.b,e.a]]){const k=key(a);if(!neighbors.has(k))neighbors.set(k,[]);neighbors.get(k).push(b);}
 if(!boundary.length||[...neighbors.values()].some(v=>v.length!==2))throw Error('The retained blank boundary is pinched or disconnected.');
 const outline=[boundary[0].a];let previous=null,current=outline[0];for(let i=0;i<=boundary.length;i++){const next=neighbors.get(key(current)).find(v=>key(v)!==key(previous??[Infinity,Infinity]));if(key(next)===key(outline[0]))break;outline.push(next);previous=current;current=next;}
 if(outline.length!==boundary.length)throw Error('The retained material is not one connected, hole-free blank.');
 const patchArea=atlas.patches.reduce((s,p)=>s+area(p.uvMm),0);if(Math.abs(area(outline)-patchArea)>1e-5)throw Error('The cut contour does not conserve the retained material area.');
 return outline;
}
export function planEndFilmBlank(c,{continuityToleranceMm=1e-7,endTrimAllowanceMm=2}={}){
 if(!Number.isFinite(endTrimAllowanceMm)||endTrimAllowanceMm<=0)throw Error('Positive retained end tail required.');
 const original=endFilmAtlas(c),requestedMarginMm=c.context.options.marginMm,min=minimumEndBlankMargin(c),sourceBoundsUvMm={...c.context.bounds};
 if(!min.found||!endLongSeamCoverage(c).covered)throw Error('Blank is too small for the complete weld junctions; enlarge it before folding.');
 const checks=q=>{const a=endFilmAtlas(q);return {continuous:a.maxContinuityError<=continuityToleranceMm,errorMm:a.maxContinuityError,covered:endLongSeamCoverage(q).covered};};
 let selectedMarginMm=requestedMarginMm,upperCompatibleMarginMm=null,retainedReferenceYRange=null,operation='keep-blank';
 if(original.maxContinuityError>continuityToleranceMm){
  let lo=min.minimumMarginMm,hi=requestedMarginMm;
  if(lo<hi&&checks(withEndBlankMargin(c,lo)).continuous){
   for(let k=0;k<40&&hi-lo>1e-5;k++){const mid=(lo+hi)/2;if(checks(withEndBlankMargin(c,mid)).continuous)lo=mid;else hi=mid;}
   upperCompatibleMarginMm=lo;const middle=(min.minimumMarginMm+lo)/2,rounded=Math.ceil(middle);selectedMarginMm=rounded<lo?rounded:middle;operation='trim-distant-waste-before-folding';
  }else{
   // A uniform rectangular crop can remove material needed by the welds. Cut
   // only the mapped end tails instead, retaining every long free margin.
   const [f,r]=['front','rear'].map(e=>endSealLayerRegistry(c,e)),extra=c.context.options.heatWidthMm/2+endTrimAllowanceMm;
   retainedReferenceYRange=[f.referenceSealY-extra,r.referenceSealY+extra];operation='trim-profiled-end-waste-before-folding';
  }
 }
 const plan={selectedMarginMm,retainedReferenceYRange},planned=withEndBlankPlan(c,plan),final=checks(planned),retained=endFilmAtlas(planned),panelsInside=planned.program.initial.panels.every((p,i)=>{const carrier=retained.patches.find(q=>q.id==='carrier-'+i);return carrier&&p.uvMm.every(v=>inPolygon(v,carrier.uvMm));}),registries=['front','rear'].map(e=>endSealLayerRegistry(planned,e));
 if(!final.continuous||!final.covered||!panelsInside||registries.some(r=>!r.registryPass))throw Error('Planned source film failed continuity, panel attachment or weld coverage; another crease layout is required.');
 const limit=2*Math.hypot(sourceBoundsUvMm.maxX-sourceBoundsUvMm.minX,sourceBoundsUvMm.maxY-sourceBoundsUvMm.minY),fullFinAtlas=endFilmAtlas(planned,{retainedLongFinMm:limit}),cutOutlineUvMm=retainedReferenceYRange?materialOutline(fullFinAtlas):rectangle(planned.context.bounds),sourceArea=(sourceBoundsUvMm.maxX-sourceBoundsUvMm.minX)*(sourceBoundsUvMm.maxY-sourceBoundsUvMm.minY);
 const fullInitialError=fullFinAtlas.maxContinuityError;if(fullInitialError>continuityToleranceMm)throw Error('The blank before the long-seal trim is discontinuous.');
 const targetBoundsUvMm={minX:Math.min(...cutOutlineUvMm.map(v=>v[0])),maxX:Math.max(...cutOutlineUvMm.map(v=>v[0])),minY:Math.min(...cutOutlineUvMm.map(v=>v[1])),maxY:Math.max(...cutOutlineUvMm.map(v=>v[1]))};
 return {schema:'origami-box/end-film-blank-plan/1',operation,requestedMarginMm,selectedMarginMm,retainedReferenceYRange,endTrimAllowanceMm,minimumWeldCoverageMarginMm:min.minimumMarginMm,upperCompatibleMarginMm,sourceBoundsUvMm,targetBoundsUvMm,sourceOutlineUvMm:rectangle(sourceBoundsUvMm),cutOutlineUvMm,removedAreaMm2:sourceArea-area(cutOutlineUvMm),originalContinuityErrorMm:original.maxContinuityError,plannedContinuityErrorMm:Math.max(final.errorMm,fullInitialError),conflicts:original.continuityConflicts.map(p=>({...p,outsideRetainedBlank:!inPolygon(p.uvMm,cutOutlineUvMm)})),continuityToleranceMm,panelsInside,sealCoverage:true,oneConnectedBlank:true,reason:operation==='keep-blank'?'Existing blank supports the prescribed crease extension.':'Cut the supplied boundary while flat to remove incompatible distant crease junctions. All plastic, longitudinal margins and complete end heat bands remain. No mismatched material vertices are merged.',scope:'A checked candidate in this crease family. The rectangular bisection bound is local, not a global feasibility theorem for every possible crease layout.'};
}
