// Generic viewer for serialized kernel frames. It never computes a fold or
// interpolates world vertices; camera motion only projects the supplied data.
export function sheetStudySVG(pose,view,frame,width=1000,height=560){
 const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
 const az=view.az*Math.PI/180,el=view.el*Math.PI/180,scale=frame.scale*view.zoom;
 const project=v=>{const q=v.map((x,i)=>x-frame.center[i]),xx=q[0]*Math.cos(az)-q[1]*Math.sin(az),yy=q[0]*Math.sin(az)+q[1]*Math.cos(az);return [width/2+view.x+xx*scale,height/2+view.y+(yy*Math.sin(el)-q[2]*Math.cos(el))*scale,yy*Math.cos(el)+q[2]*Math.sin(el)];};
 const faces=[...(view.film===false?[]:pose.film.map(p=>({...p,kind:'film'}))),...pose.panels.map(p=>({...p,kind:'panel'}))].map(p=>({...p,screen:p.pointsMm.map(project)}));
 faces.sort((a,b)=>a.screen.reduce((s,p)=>s+p[2],0)/a.screen.length-b.screen.reduce((s,p)=>s+p[2],0)/b.screen.length);
 let out=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="white"/>`;
 for(const p of faces){const film=p.kind==='film',moving=pose.operation?.movingPanelIds.includes(p.id),color=p.color??(film?'#a2bdc9':moving?'#f1c37a':'#d4e4ed');
  out+=`<polygon points="${p.screen.map(q=>q.slice(0,2).join(',')).join(' ')}" fill="${color}" fill-opacity="${film?.24:.93}" stroke="${film?(p.color??'#92a8b5'):'#456377'}" stroke-width="${film?.8:1.3}" stroke-linejoin="round"/>`;
 }
 if(pose.bandMm)out+=`<polygon points="${pose.bandMm.map(project).map(q=>q.slice(0,2).join(',')).join(' ')}" fill="#20a87a" fill-opacity=".7" stroke="#07825b" stroke-width="2"/>`;
 for(const cue of pose.cues??[]){if(view.creases===false&&cue.role==='fold')continue;const [a,b]=cue.pointsMm.map(project),active=cue.active,color=cue.role==='seal'?'#15966b':active?'#125be0':'#8a9ead';
  out+=`<path d="M${a[0]} ${a[1]}L${b[0]} ${b[1]}" fill="none" stroke="${color}" stroke-width="${active?3:1.2}" ${cue.role==='seal'?'stroke-dasharray="6 4"':''}/>`;
  if(cue.label){const offset=cue.labelOffsetPx??[8,-8];out+=`<text x="${(a[0]+b[0])/2+offset[0]}" y="${(a[1]+b[1])/2+offset[1]}" font-family="Arial,sans-serif" font-size="17" font-weight="700" fill="${color}" stroke="white" stroke-width="4" paint-order="stroke">${esc(cue.label)}</text>`;}
 }
 return out+'</svg>';
}
export function createSheetStudyPlayer(stages,onChange,{nextFrame=()=>new Promise(r=>requestAnimationFrame(r))}={}){
 let index=0,frame=0,busy=false;
 const state=()=>({index,frame,busy,stage:stages[index],pose:stages[index].frames[frame]});
 const emit=()=>onChange(state());
 async function animate(from,to){let start;const duration=(stages[index].durationMs??1200)*Math.abs(to-from)/Math.max(1,stages[index].frames.length-1);do{const now=await nextFrame();start??=now;const t=duration?Math.min(1,(now-start)/duration):1,e=t*t*(3-2*t);frame=Math.round(from+(to-from)*e);emit();if(t===1)break;}while(true);}
 return {get state(){return state();},show:emit,seek(value){if(busy)return false;frame=Math.max(0,Math.min(stages[index].frames.length-1,Math.round(value)));emit();return true;},async step(direction){
  if(busy||![-1,1].includes(direction)||direction<0&&index===0||direction>0&&index===stages.length-1)return false;
  busy=true;emit();try{
   if(direction>0){if(frame===stages[index].frames.length-1){index++;frame=0;emit();}await animate(frame,stages[index].frames.length-1);}
   else{await animate(frame,0);index--;frame=stages[index].frames.length-1;}
   return true;
  }finally{busy=false;emit();}
 }};
}
export function sheetStudyHTML(data){
 const json=JSON.stringify(data).replaceAll('<','\\u003c'),escape=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;');
 return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(data.title)}</title>
<style>*{box-sizing:border-box}body{margin:0;background:#f6f8fa;color:#193044;font:16px system-ui,sans-serif}main{max-width:1180px;margin:auto;padding:22px}h1{font-size:23px;margin:0 0 6px}p{line-height:1.5}header p{margin:0;color:#526678;font-size:14px}.viewer{position:relative;margin-top:18px;border:1px solid #d5dfe6;border-radius:12px;overflow:hidden;background:white}#scene{touch-action:none;line-height:0}#scene svg{width:100%;height:auto;max-height:65vh;min-height:300px}#display{position:absolute;top:12px;right:12px;display:flex;gap:12px;background:#fffffff0;border-radius:6px;padding:6px 10px;font-size:13px}nav{display:flex;align-items:center;gap:16px;justify-content:center;margin:18px 0}button{border:1px solid #b8c8d5;border-radius:7px;background:white;color:#193044;padding:7px 15px;font:inherit;cursor:pointer}button:disabled{opacity:.35;cursor:default}nav button{font-size:26px;line-height:1}#title{font-size:19px;font-weight:600;text-align:center}#instruction{min-height:48px;max-width:850px;text-align:center;margin:8px auto 14px}#scrub{display:flex;gap:15px;align-items:center;max-width:650px;margin:auto}#angle{min-width:55px}input[type=range]{width:100%}.hint{text-align:center;color:#5e7180;font-size:13px}details{margin-top:22px;border-top:1px solid #d5dfe6;padding-top:12px}pre{white-space:pre-wrap;font-size:13px}#result{background:#e2f4ed;color:#18523c;padding:10px;border-radius:7px;display:none}.small{font-size:13px;color:#5e7180}</style>
<main><header><h1>${escape(data.title)}</h1><p>${escape(data.subtitle)}</p></header><div class="viewer"><div id="scene"></div><div id="display"><label><input id="film" type="checkbox" checked>Film</label><label><input id="creases" type="checkbox" checked>Creases</label><button id="fit" style="padding:0 8px;font-size:13px">Reset view</button></div></div>
<nav><button id="prev" aria-label="Previous step">‹</button><span id="count"></span><button id="next" aria-label="Next step">›</button></nav><div id="title"></div><p id="instruction"></p><div id="scrub"><span class="small">Fold</span><input id="progress" type="range" min="0" value="0" aria-label="Current fold progress"><output id="angle"></output></div><p class="hint">Left drag: pan · Right drag: rotate · Wheel: zoom · Touch: rotate; two fingers pan / zoom</p><p id="result"></p>
<details><summary>Verification and scope</summary><pre>${escape(data.verification)}</pre><p class="small">The viewer receives kernel-generated frames, axes and instructions. It only selects frames and projects them with an orthographic camera. Panel vertices are never interpolated here. This is a first-seal study; complete end sealing and inflation are unverified.</p></details></main>
<script>const DATA=${json};const sheetStudySVG=${sheetStudySVG.toString()};const createSheetStudyPlayer=${createSheetStudyPlayer.toString()};
const $=id=>document.getElementById(id),view={az:-30,el:28,zoom:1,x:0,y:0,film:true,creases:true};let current;
function draw(){if(current)$('scene').innerHTML=sheetStudySVG(current.pose,view,DATA.frame);}
const player=createSheetStudyPlayer(DATA.stages,s=>{current=s;draw();$('count').textContent=s.index+' / '+(DATA.stages.length-1);$('title').textContent=s.stage.title;$('instruction').textContent=s.stage.instruction;$('prev').disabled=s.busy||s.index===0;$('next').disabled=s.busy||s.index===DATA.stages.length-1;$('progress').max=s.stage.frames.length-1;$('progress').value=s.frame;$('progress').disabled=s.busy||s.stage.frames.length<2;$('angle').textContent=s.pose.angleLabel??'';$('result').style.display=s.stage.result?'block':'none';$('result').textContent=s.stage.result??'';});
$('prev').onclick=()=>player.step(-1);$('next').onclick=()=>player.step(1);$('progress').oninput=e=>player.seek(Number(e.target.value));$('film').onchange=e=>{view.film=e.target.checked;draw();};$('creases').onchange=e=>{view.creases=e.target.checked;draw();};$('fit').onclick=()=>{Object.assign(view,{az:-30,el:28,zoom:1,x:0,y:0});draw();};document.onkeydown=e=>{if(e.target.matches('input'))return;if(e.key==='ArrowRight')player.step(1);if(e.key==='ArrowLeft')player.step(-1);};
const host=$('scene'),pointers=new Map();host.oncontextmenu=e=>e.preventDefault();host.onpointerdown=e=>{host.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY,button:e.button,type:e.pointerType});};host.onpointermove=e=>{const old=pointers.get(e.pointerId);if(!old)return;const before=[...pointers.values()],prior={x:old.x,y:old.y};old.x=e.clientX;old.y=e.clientY;const unit=1000/host.getBoundingClientRect().width;if(pointers.size>=2){const after=[...pointers.values()],other=after.find(p=>p!==old),d0=Math.hypot(prior.x-other.x,prior.y-other.y),d1=Math.hypot(old.x-other.x,old.y-other.y);if(d0)view.zoom=Math.max(.2,Math.min(15,view.zoom*d1/d0));view.x+=(old.x-prior.x)*unit/2;view.y+=(old.y-prior.y)*unit/2;}else if(old.type==='touch'||old.button===2){view.az-=(old.x-prior.x)*.45;view.el+=(old.y-prior.y)*.35;}else{view.x+=(old.x-prior.x)*unit;view.y+=(old.y-prior.y)*unit;}draw();};host.onpointerup=host.onpointercancel=e=>pointers.delete(e.pointerId);host.onwheel=e=>{e.preventDefault();view.zoom=Math.max(.2,Math.min(15,view.zoom*Math.exp(-e.deltaY*.001)));draw();};player.show();
</script></html>`;
}
