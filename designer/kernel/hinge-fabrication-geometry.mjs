// Four rigid panels, one direct film hinge. Internal coordinates keep the
// remaining small-panel pair on the right; presentation may reflect the result.
import {resolveSpec} from './spec.mjs';
import {parameters,unfold,pose} from './geometry.mjs';
import {add,sub,mul,dot,cross,unit,point,points,area,identity,compileSheetFolds} from './sheet-folds.mjs';
import {compileThickFolds,thickFoldState,panelNormal,thickPanelContacts} from './thick-folds.mjs';
const distance=(a,b)=>Math.hypot(...sub(a,b));
function frame(face,map){
 const uv=face.ids.map(id=>[-face.flat[id][0],face.flat[id][1]]),a=uv[0],u=sub(uv[1],a),v=sub(uv[2],a),d=u[0]*v[1]-u[1]*v[0],A=map[face.ids[0]],w=sub(map[face.ids[1]],A),z=sub(map[face.ids[2]],A),x=mul(sub(mul(w,v[1]),mul(z,u[1])),1/d),y=mul(sub(mul(z,u[0]),mul(w,v[0])),1/d);
 return {origin:sub(A,add(mul(x,a[0]),mul(y,a[1]))),x,y};
}
function ideal(c,opening,inward){
 const net=c.context.net,v=pose({...net.p,opening}).v;
 if(!inward&&opening!==1){const a=v.B,u=unit(sub(v.C,a)),rise=opening===0?[0,0,1]:sub(v.F,a),n=unit(cross(u,rise));for(const id of ['M','N'])v[id]=sub(v[id],mul(n,2*dot(sub(v[id],a),n)));}
 return c.context.program.initial.panels.map((p,i)=>({...p,transform:frame(net.faces[i],v)}));
}
export function hingeFabricationContext(spec,{marginMm=25,heatWidthMm=1,samples=101}={}){
 const r=resolveSpec(spec);if(r.spec.walls.left===r.spec.walls.right)throw Error('Exactly one folding wall must be absent.');
 const net=unfold(parameters(r.parameters)),flat=p=>[-p[0],p[1]],panels=net.faces.map(f=>({id:f.id,uvMm:f.panel.map(flat),transform:identity()}));
 const hinges=net.hinges.map((ids,i)=>{const a=flat(net.faces[i].flat[ids[0]]),b=flat(net.faces[i].flat[ids[1]]),n=[a[1]-b[1],b[0]-a[0]],center=mul(panels[i+1].uvMm.reduce(add,[0,0]),1/panels[i+1].uvMm.length);return {id:'hinge-'+i,axisUvMm:[a,b],parentPanelId:panels[i].id,movingPanelIds:panels.slice(i+1).map(p=>p.id),movingSide:Math.sign(dot(sub(center,a),n))||1};});
 const raw=compileSheetFolds({panels,film:[],hinges},[{id:'half-fold',hingeId:'hinge-1',angleRad:Math.PI*hinges[1].movingSide,title:'Fold at the remaining side-wall middle',instruction:'Fold the upper small panel and large top panel upward together.'}]);
 const program=compileThickFolds(raw,{thicknessMm:net.p.thickness,gapMm:net.p.gap,samples});
 // The first flat pair needs only two solid layers, but the later inward tuck
 // needs four. Reserve that real stack height in the flexible gap now.
 const desired=Math.max(program.steps[0].radiusMm,2*net.p.thickness+1e-5),limit=net.p.gap/Math.PI;
 if(desired>limit)throw Error('The flexible gap is too narrow for the four-layer inward stack.');
 program.steps[0].radiusMm=desired;
 const b={minX:-net.bounds.maxX-marginMm,maxX:-net.bounds.minX+marginMm,minY:net.bounds.minY-marginMm,maxY:net.bounds.maxY+marginMm},uv=net.seam.map(id=>flat(net.faces[0].flat[id])),d=sub(uv[1],uv[0]),center=mul(panels[0].uvMm.reduce(add,[0,0]),1/panels[0].uvMm.length);let normal0=unit([-d[1],d[0]]);if(dot(normal0,sub(center,uv[0]))>0)normal0=mul(normal0,-1);
 const c={context:{net,program:raw,bounds:b,normal0,options:{marginMm,heatWidthMm,sealOffsetMm:0}},program,thicknessMm:net.p.thickness,mirror:r.mirror};
 const end=thickFoldState(program,{step:1}),reference=ideal(c,0,false),H=point(end.panels[3],[0,0])[2];
 c.offsets=end.panels.map((p,i)=>{const q=reference[i],d=sub(p.transform.origin,q.transform.origin);return [dot(d,q.transform.x),dot(d,q.transform.y),dot(d,panelNormal(q))];});
 const inward=ideal(c,0,true),heights=[0,H/2,H/2,H];c.inwardOffsets=inward.map((p,i)=>[0,0,heights[i]/panelNormal(p)[2]]);c.stackHeightMm=H;return c;
}
function edge(c,state,i,ids){
 const f=c.context.net.faces[i],uv=ids.map(id=>[-f.flat[id][0],f.flat[id][1]]),d=sub(uv[1],uv[0]),n=unit([-d[1],d[0]]),center=mul(f.panel.map(p=>[-p[0],p[1]]).reduce(add,[0,0]),1/f.panel.length),side=Math.sign(dot(sub(center,uv[0]),n))||1;return uv.map(v=>point(state.panels[i],add(v,mul(n,side*c.context.net.p.gap/2))));
}
const joints=c=>[...c.context.net.hinges.map((ids,i)=>({ids,i,j:i+1})),{ids:c.context.net.seam,i:0,j:3}];
export function hingeGapAudit(c,state){
 const items=joints(c).map(({ids,i,j},index)=>{const first=edge(c,state,i,ids),second=edge(c,state,j,ids);return {id:index===3?'sealed-long-edge':'hinge-'+index,first,second,chordMm:Math.max(distance(first[0],second[0]),distance(first[1],second[1])),axialSlipMm:Math.abs(dot(sub(first[0],second[0]),unit(sub(first[1],first[0]))))};});
 return {items,maxChordMm:Math.max(...items.map(p=>p.chordMm)),maxAxialSlipMm:Math.max(...items.map(p=>p.axialSlipMm)),availableFilmWidthMm:c.context.net.p.gap,reachable:items.every(p=>p.chordMm<=c.context.net.p.gap+1e-6&&p.axialSlipMm<1e-6)};
}
export function hingeClosedState(c,opening,inward=false){
 const panels=ideal(c,opening,inward),offsets=inward?c.inwardOffsets:c.offsets,state={panels:panels.map((p,i)=>{const v=offsets[i],d=mul(add(add(mul(p.transform.x,v[0]),mul(p.transform.y,v[1])),mul(panelNormal(p),v[2])),1-opening);return {...p,thicknessMm:c.thicknessMm,transform:{...p.transform,origin:add(p.transform.origin,d)}};}),strips:[]};
 const vector=(i,j,v)=>{const row=Array(9).fill(0);for(let k=0;k<3;k++){if(i)row[(i-1)*3+k]+=v[k];if(j)row[(j-1)*3+k]-=v[k];}return row;},basis=[],values=[],js=joints(c);
 for(const {ids,i,j} of js){const a=edge(c,state,i,ids),b=edge(c,state,j,ids),u=unit(sub(a[1],a[0]));let row=vector(i,j,u),rhs=-dot(sub(a[0],b[0]),u);for(let pass=0;pass<2;pass++)for(let k=0;k<basis.length;k++){const d=dot(row,basis[k]);row=sub(row,mul(basis[k],d));rhs-=d*values[k];}const L=Math.hypot(...row);if(L>1e-9){basis.push(mul(row,1/L));values.push(rhs/L);}}
 const apply=delta=>{for(let i=1;i<4;i++)state.panels[i].transform.origin=add(state.panels[i].transform.origin,delta.slice((i-1)*3,i*3));};apply(basis.reduce((s,q,i)=>add(s,mul(q,values[i])),Array(9).fill(0)));
 for(let iteration=0;iteration<240;iteration++){let residual=0;for(const {ids,i,j} of js){const a=edge(c,state,i,ids),b=edge(c,state,j,ids),d=sub(a[0],b[0]),L=Math.hypot(...d),excess=Math.max(0,L-c.context.net.p.gap);residual=Math.max(residual,excess);if(excess>0){let grad=vector(i,j,mul(d,1/L));for(const q of basis)grad=sub(grad,mul(q,dot(grad,q)));const norm=dot(grad,grad);if(norm>1e-12)apply(mul(grad,-excess/norm));}}if(residual<1e-8)break;}
 return state;
}
export function hingeGeometryAudit(c,{samples=101}={}){
 if(!Number.isInteger(samples)||samples<3||samples>1001)throw Error('Use 3..1001 samples.');const collisions=[],gapFailures=[];let maxRigidErrorMm=0,maxTransitionErrorMm=0,maxAreaErrorMm2=0,maxGapExcessMm=0,maxAxialSlipMm=0;
 const check=(state,phase,progress)=>{const pairs=thickPanelContacts(state.panels),g=hingeGapAudit(c,state),items=phase==='half-fold'&&progress<1?g.items.slice(0,3):g.items;maxGapExcessMm=Math.max(maxGapExcessMm,...items.map(p=>Math.max(0,p.chordMm-g.availableFilmWidthMm)));maxAxialSlipMm=Math.max(maxAxialSlipMm,...items.map(p=>p.axialSlipMm));if(pairs.length)collisions.push({phase,progress,pairs});if(items.some(p=>p.chordMm>g.availableFilmWidthMm+1e-6||p.axialSlipMm>1e-6))gapFailures.push({phase,progress,gap:g});for(let i=0;i<4;i++){const ps=points(state.panels[i]),uv=c.context.program.initial.panels[i].uvMm;let twice=[0,0,0];for(let k=0;k<ps.length;k++)twice=add(twice,cross(ps[k],ps[(k+1)%ps.length]));maxAreaErrorMm2=Math.max(maxAreaErrorMm2,Math.abs(Math.hypot(...twice)/2-area(uv)));for(let a=0;a<ps.length;a++)for(let b=a+1;b<ps.length;b++)maxRigidErrorMm=Math.max(maxRigidErrorMm,Math.abs(distance(ps[a],ps[b])-distance(uv[a],uv[b])));}};
 for(let k=0;k<samples;k++){const p=k/(samples-1);check(thickFoldState(c.program,{step:1,progress:p}),'half-fold',p);check(hingeClosedState(c,p,false),'open',p);check(hingeClosedState(c,1-p,true),'inward',p);}
 for(const [a,b] of [[thickFoldState(c.program,{step:1}),hingeClosedState(c,0,false)],[hingeClosedState(c,1,false),hingeClosedState(c,1,true)]])for(let i=0;i<4;i++)for(let k=0;k<a.panels[i].uvMm.length;k++)maxTransitionErrorMm=Math.max(maxTransitionErrorMm,distance(points(a.panels[i])[k],points(b.panels[i])[k]));
 return {samples,collisions,gapFailures,maxRigidErrorMm,maxTransitionErrorMm,maxAreaErrorMm2,maxGapExcessMm,maxAxialSlipMm,finitePanelPathPass:!collisions.length&&!gapFailures.length&&maxRigidErrorMm<1e-7&&maxTransitionErrorMm<1e-7,filmEndIsometryVerified:false,manufacturingReady:false};
}
