import {createWorkerClient} from '../api/worker-client.mjs';
import {frameFromPoints,cameraForFrame} from './camera.mjs';
import {sceneSVG} from './render.mjs';
import {defaultView,bindViewControls,orbitAngles,zoomAt} from '../view-controls.mjs';
const $=id=>document.getElementById(id),client=createWorkerClient(new Worker(new URL('../adapters/worker.mjs',import.meta.url),{type:'module'}));
const spec=(await client.call('describe')).defaultSpec;spec.footprint={length:75,frontWidth:70,rearWidthRatio:.7};spec.rise={front:40,rearRatio:.7};
const refs=await client.call('design.referencePoses',{spec,options:{mode:'actuation'}}),frame=frameFromPoints(refs.flatMap(p=>p.panels.flatMap(f=>f.pointsMm)));
let view=defaultView(),az=-38,el=28,lastPose=null,revision=0,playing=false,animationRevision=0;
function paint(){if(lastPose)$('scene').innerHTML=sceneSVG(lastPose,cameraForFrame(frame,az,el),view);}
async function update(){const ticket=++revision,progress=+$('fold').value/100,yawDeg=+$('yaw').value;
 $('fold-value').textContent=Math.round(progress*100)+'%';$('yaw-value').textContent=yawDeg.toFixed(2)+'°';
 try{const result=await client.call('research.orientation',{spec,state:{progress,yawDeg}});if(ticket!==revision)return;lastPose=result;paint();$('error').textContent='';$('checks').textContent=`Rigid-distance error: ${result.maxRigidErrorMm.toExponential(2)} mm. Panel contacts: ${result.contacts.length}. Red marks interference in the symmetric thickness model.`;}
 catch(e){if(ticket===revision)$('error').textContent=e.message;}
}
for(const id of ['fold','yaw'])$(id).oninput=()=>{playing=false;animationRevision++;$('play').textContent='Play alternate path';update();};
const reset=()=>{view=defaultView();az=-38;el=28;paint();};$('reset').onclick=reset;
bindViewControls($('scene'),{rotate(dx,dy){const q=orbitAngles(az,el,dx,dy);az=q.azimuth;el=q.elevation;paint();},pan(dx,dy){view.panX+=dx;view.panY+=dy;paint();},zoom(f,x,y){view=zoomAt(view,f,x,y);paint();},reset});
$('play').onclick=()=>{playing=!playing;const animationTicket=++animationRevision;$('play').textContent=playing?'Pause':'Play alternate path';if(!playing)return;const start=performance.now();
 async function tick(t){if(!playing||animationTicket!==animationRevision)return;const f=(1-Math.cos((t-start)/1600))/2,progress=.3+.6*f;
  $('fold').value=progress*100;$('yaw').value=1.3*Math.sin(Math.PI*f);await update();requestAnimationFrame(tick);
 }requestAnimationFrame(tick);
};
await update();
