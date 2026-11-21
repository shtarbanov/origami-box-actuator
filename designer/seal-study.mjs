// Static Kresling reference net and a proposed three-seal film blank.
// No continuous rigid-foldability or airtight end-wall claim is made here.
export const sealDefaults={n:6,radius:30,height:40,twist:30,gap:3,tail:36,fin:8,trim:6,paper:'A4'};
const dist=(a,b)=>Math.hypot(...a.map((x,i)=>x-b[i]));
const area=p=>p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-a[1]*b[0]},0)/2;
const html=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
function insetTriangle(poly,d){
 // Intersection of the three inward-shifted supporting lines.
 const sign=Math.sign(area(poly)),lines=poly.map((a,i)=>{const b=poly[(i+1)%3],dx=b[0]-a[0],dy=b[1]-a[1],L=Math.hypot(dx,dy),n=[-dy/L*sign,dx/L*sign];return {n,c:n[0]*a[0]+n[1]*a[1]+d};});
 const out=lines.map((a,i)=>{const b=lines[(i+2)%3],den=a.n[0]*b.n[1]-a.n[1]*b.n[0];return[(a.c*b.n[1]-a.n[1]*b.c)/den,(a.n[0]*b.c-a.c*b.n[0])/den];});
 if(out.some(p=>lines.some(l=>l.n[0]*p[0]+l.n[1]*p[1]<l.c-1e-6)))throw Error('패널 간격이 너무 커 삼각형 패널이 사라집니다.');
 return out;
}
export function sealDesign(input={}){
 const p={...sealDefaults,...input};
 if(!Object.values(p).every(v=>typeof v!=='number'||Number.isFinite(v)))throw Error('유효한 숫자를 입력하세요.');
 if(!Number.isInteger(p.n)||p.n<3||p.n>10||p.radius<10||p.height<10||p.tail<5||p.fin<3||p.trim<2||p.gap<1)throw Error('설계 변수의 범위를 확인하세요.');
 const delta=2*Math.PI/p.n,phi=p.twist*Math.PI/180,a=2*p.radius*Math.sin(Math.PI/p.n),C=p.n*a;
 const c=Math.sqrt(p.height**2+2*p.radius**2*(1-Math.cos(phi))),b=Math.sqrt(p.height**2+2*p.radius**2*(1-Math.cos(phi-delta)));
 const u=(a*a+c*c-b*b)/(2*a),v=Math.sqrt(c*c-u*u),k=u/v;
 if(!Number.isFinite(v)||v<1)throw Error('이 기준 자세의 전개도를 만들 수 없습니다.');
 const at=(circ,y)=>[circ+k*y,y],panels=[],triangles=[],vertices={};
 for(let i=0;i<p.n;i++){
 const t=i*delta;vertices['B'+i]=[p.radius*Math.cos(t),p.radius*Math.sin(t),0];vertices['T'+i]=[p.radius*Math.cos(t+phi),p.radius*Math.sin(t+phi),p.height];
 }
 let maxEdgeError=0;
 for(let i=0;i<p.n;i++){
 const A=at(i*a,0),B=at((i+1)*a,0),D=at(i*a,v),E=at((i+1)*a,v),j=(i+1)%p.n;
 for(const [points,ids,name] of [[ [A,B,D],['B'+i,'B'+j,'T'+i],`${i+1}A` ],[ [B,E,D],['B'+j,'T'+j,'T'+i],`${i+1}B` ]]){
  triangles.push({points,ids});panels.push({name,points:insetTriangle(points,p.gap/2)});
  for(let q=0;q<3;q++)maxEdgeError=Math.max(maxEdgeError,Math.abs(dist(points[q],points[(q+1)%3])-dist(vertices[ids[q]],vertices[ids[(q+1)%3]])));
 }
 }
 const y0=-p.tail-p.trim,y1=v+p.tail+p.trim,blank=[at(-p.fin,y0),at(C+p.fin,y0),at(C+p.fin,y1),at(-p.fin,y1)];
 const bounds={x:Math.min(...blank.map(x=>x[0])),y:y0,w:Math.max(...blank.map(x=>x[0]))-Math.min(...blank.map(x=>x[0])),h:y1-y0};
 return {p,a,C,u,v,k,at,panels,triangles,vertices,blank,bounds,maxEdgeError,layFlatWidth:C/2,
 risks:['Kresling actuation path not solved','End-film folding and wrinkling not proved','Fin/cross-seal intersections require leak testing','Straight seals may constrain travel if tails are too short'],
 verification:'Triangle edge lengths are checked at one assembled reference pose only.'};
}
export function sealSvg(input={}){
 const d=sealDesign(input),{p,at,v,C}=d,[PW,PH]=p.paper==='A3'?[420,297]:[297,210];
 const tx=(PW-d.bounds.w)/2-d.bounds.x,ty=(PH-d.bounds.h)/2-d.bounds.y;
 const point=q=>`${(q[0]+tx).toFixed(4)},${(q[1]+ty).toFixed(4)}`;
 const path=(ps,color,w=.25,dash='')=>`<polyline points="${ps.map(point).join(' ')}" fill="none" stroke="${color}" stroke-width="${w}"${dash?` stroke-dasharray="${dash}"`:''}/>`;
 const poly=(ps,fill,stroke='#30474A')=>`<polygon points="${ps.map(point).join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width=".15"/>`;
 let body=`<rect width="${PW}" height="${PH}" fill="white"/><text x="8" y="9" font-size="4" font-weight="bold">Kresling · three-seal fabrication study</text><text x="8" y="15" font-size="2.8">Static reference geometry only. End folding, sealing and actuation are NOT validated. Print at 100%.</text>`;
 body+=poly(d.blank,'#FCFCF9');
 for(const range of [[-p.tail-p.trim,0],[v,v+p.tail+p.trim]])body+=poly([at(0,range[0]),at(C,range[0]),at(C,range[1]),at(0,range[1])],'#F2F0DD','#D8D6BE');
 for(const circ of [-p.fin,C])body+=poly([at(circ,-p.tail-p.trim),at(circ+p.fin,-p.tail-p.trim),at(circ+p.fin,v+p.tail+p.trim),at(circ,v+p.tail+p.trim)],'#F8E4D4','#E6C5A6');
 for(const t of d.triangles)body+=path([...t.points,t.points[0]],'#84999B',.1,'1 1');
 for(const [i,f]of d.panels.entries()){
 body+=poly(f.points,i%2?'#D9E9EA':'#DDE8DB');
 const c=f.points.reduce((s,q)=>[s[0]+q[0]/3,s[1]+q[1]/3],[0,0]);body+=`<text x="${c[0]+tx}" y="${c[1]+ty}" text-anchor="middle" font-size="2.5">${f.name}</text>`;
 }
 // S1a and S1b are the two mating flange marks of ONE physical fin seal.
 for(const [circ,label] of [[-p.fin/2,'S1a'],[C+p.fin/2,'S1b']]){
 body+=path([at(circ,-p.tail-p.trim),at(circ,v+p.tail+p.trim)],'#BF5E26',.45,'2 1');
 const q=at(circ,v/2);body+=`<text x="${q[0]+tx}" y="${q[1]+ty}" text-anchor="middle" font-size="3" fill="#A64C1A">${label}</text>`;
 }
 for(const [y,label] of [[-p.tail,'S2 · END SEAL'],[v+p.tail,'S3 · END SEAL']]){
 body+=path([at(-p.fin,y),at(C+p.fin,y)],'#BF5E26',.45,'2 1');const q=at(C/2,y);
 body+=`<text x="${q[0]+tx}" y="${q[1]+ty-2}" text-anchor="middle" font-size="3" fill="#A64C1A">${label}</text>`;
 }
 for(const circ of [0,C])body+=path([at(circ,-p.tail-p.trim),at(circ,v+p.tail+p.trim)],'#939B99',.15);
 for(const y of [0,v])body+=path([at(0,y),at(C,y)],'#76877C',.15,'1 1');
 // Tail creases place the fin seam at the centre of a broad lay-flat face.
 for(const circ of [C/4,3*C/4])for(const yy of [[-p.tail-p.trim,0],[v,v+p.tail+p.trim]])body+=path([at(circ,yy[0]),at(circ,yy[1])],'#147B78',.25,'3 1 1 1');
 const note=at(C/2,-p.tail/2);body+=`<text x="${note[0]+tx}" y="${note[1]+ty}" text-anchor="middle" font-size="3" fill="#6F735B">FILM ONLY · no rigid panels</text>`;
 const n2=at(C/2,v+p.tail/2);body+=`<text x="${n2[0]+tx}" y="${n2[1]+ty}" text-anchor="middle" font-size="3" fill="#6F735B">FILM ONLY · no rigid panels</text>`;
 body+=`<text x="8" y="${PH-16}" font-size="2.8">Orange: proposed heat seals · Teal: fold ONLY the empty tails · Grey: panel/film crease guides, NOT seals.</text><text x="8" y="${PH-10}" font-size="2.8">S1a + S1b mate into one fin seal. S2/S3 are sealed after flattening each end. Trim outside seals only.</text><text x="8" y="${PH-5}" font-size="2.8">Example: n=${p.n}, R=${p.radius}, h=${p.height}, twist=${p.twist}°, gap=${p.gap}, tail=${p.tail} mm. Sealer settings unspecified.</text>`;
 return {d,fit:d.bounds.w<PW-16&&d.bounds.h<PH-45,svg:`<svg xmlns="http://www.w3.org/2000/svg" width="${PW}mm" height="${PH}mm" viewBox="0 0 ${PW} ${PH}" font-family="Arial,sans-serif" fill="#30474A">${body}</svg>`};
}
export function layFlatSvg(d){
 // Cross-sectional registration diagram; not an isometric membrane simulation.
 const W=760,H=225,cx=150,cy=118,R=70,pts=Array.from({length:d.p.n},(_,i)=>[cx+R*Math.cos(i*2*Math.PI/d.p.n),cy+R*Math.sin(i*2*Math.PI/d.p.n)]);
 const seam=[cx+R,cy];
 return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" font-family="sans-serif"><polygon points="${pts.map(p=>p.join(',')).join(' ')}" fill="#DCE9DF" stroke="#516F61" stroke-width="2"/><circle cx="${seam[0]}" cy="${seam[1]}" r="5" fill="#BF5E26"/><text x="${cx}" y="25" text-anchor="middle" fill="#38534A" font-size="14">Open tube · circumference C</text><text x="${cx}" y="210" text-anchor="middle" fill="#6C7C74" font-size="12">Cross-section registration only</text><path d="M270 115h85m-12-8 12 8-12 8" fill="none" stroke="#738A7E" stroke-width="2"/><path d="M420 112H700M420 124H700" stroke="#516F61" stroke-width="3"/><path d="M420 112Q410 118 420 124M700 112Q710 118 700 124" fill="none" stroke="#147B78" stroke-width="3"/><path d="M560 112v-43h8v43" fill="#F1D4BF" stroke="#BF5E26" stroke-width="2"/><text x="560" y="25" text-anchor="middle" fill="#38534A" font-size="14">Lay-flat end · width C/2 = ${d.layFlatWidth.toFixed(1)} mm</text><text x="573" y="57" fill="#BF5E26" font-size="12">Fin seam at face centre</text><text x="560" y="169" text-anchor="middle" fill="#147B78" font-size="12">Fold the two sides at C/4 and 3C/4</text><text x="560" y="194" text-anchor="middle" fill="#6C7C74" font-size="12">Body-to-flat transition is not simulated.</text></svg>`;
}
