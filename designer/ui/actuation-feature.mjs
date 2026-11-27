// Independent preview transport and playback. No fabrication stages or form state.
export function createActuationFeature({document,call,controller,onScene,getFrame,onError}){
 const $=id=>document.getElementById(id);let model=null,progress=1,playing=false,animationId=null,revision=0,suspended=false;
 function stop(){playing=false;if(animationId!==null)cancelAnimationFrame(animationId);animationId=null;$('play').textContent='Play';}
 let inFlight=Promise.resolve();
 function refresh(){inFlight=fetchPose();return inFlight;}
 async function fetchPose(){
  if(suspended||!model?.validReport)return;const ticket=++revision,snapshot=model,value=progress,spec=snapshot.validReport.spec;
  try{
   const [pose,frame,handles]=await Promise.all([controller.pose(spec,{mode:'actuation',progress:value}),getFrame()?Promise.resolve(getFrame()):controller.frame(spec,'actuation'),call('design.handles',{spec,state:{mode:'actuation',progress:value}})]);
   if(ticket!==revision||suspended)return;
   onScene({pose,frame,handles,bundle:snapshot.bundle,report:snapshot.validReport,progress:value});
  }catch(e){if(ticket===revision&&!suspended)onError(e.message);}
 }
 function setProgress(value){progress=value;$('progress').value=100*value;$('progress-value').textContent=Math.round(100*value)+'%';}
 $('progress').oninput=()=>{stop();setProgress(+$('progress').value/100);refresh();};
 $('play').onclick=()=>{
  if(playing){stop();return;}if(suspended||!model?.bundle)return;
  playing=true;$('play').textContent='Pause';let last=null,direction=-1;
  function tick(time){if(!playing)return;const dt=last===null?0:Math.min((time-last)/6000,.03);last=time;const lo=model.bundle.validation.actuation.minimumSampledSafeOpening??1;
   progress+=direction*dt;if(progress<=lo){progress=lo;direction=1;}if(progress>=1){progress=1;direction=-1;}setProgress(progress);refresh();animationId=requestAnimationFrame(tick);
  }animationId=requestAnimationFrame(tick);
 };
 return {refresh,stop,idle:()=>inFlight,
  update(next){model=next;return refresh();},
  pending(){stop();++revision;setProgress(1);},
  prepareEdit(){stop();setProgress(1);},
  suspend(){stop();suspended=true;++revision;},
  resume(){suspended=false;},
  get progress(){return progress;}
 };
}
