// UI timing and navigation only. Every animation sample comes from the public API.
export function createFabricationPlayer(call,onChange,{nextFrame=()=>new Promise(resolve=>requestAnimationFrame(resolve)),reducedMotion=false}={}){
 let generation=0,state={active:false,busy:false,index:0,guide:null,pose:null},spec=null;
 const emit=patch=>{state={...state,...patch};onChange(state);};
 return {
  get state(){return state;},
  async open(input){
   const ticket=++generation;spec=structuredClone(input);emit({active:true,busy:true,error:null,index:0,pose:null,guide:null});
   try{
    const guide=await call('fabrication.describe',{spec});if(ticket!==generation)return false;
    if(!guide.supported){emit({active:false,busy:false,error:guide.diagnostics[0].message});return false;}
    const [pose,validation]=await Promise.all([call('fabrication.pose',{spec,state:{stageId:guide.stages[0].id}}),call('fabrication.validate',{spec})]);
    if(ticket!==generation)return false;
    if(!validation.numericalPass)throw Error('This fabrication path did not pass its geometry checks.');
    emit({guide,pose,validation,busy:false});return true;
   }catch(e){if(ticket===generation)emit({active:false,busy:false,error:e.message});return false;}
  },
  async step(direction){
   if(!state.active||state.busy||![-1,1].includes(direction))return false;
   const target=state.index+direction;if(target<0||target>=state.guide.stages.length)return false;
   const ticket=generation,previous={index:state.index,pose:state.pose},transition=state.guide.stages[direction>0?target:state.index];
   emit({busy:true,index:target,error:null});
   try{
    const duration=reducedMotion?0:transition.operation==='fold'?1000:240;
    let start=null;
    do{
     const time=await nextFrame();if(ticket!==generation)return false;if(start===null)start=time;
     const fraction=duration?Math.min(1,(time-start)/duration):1,eased=fraction*fraction*(3-2*fraction);
     const pose=await call('fabrication.pose',{spec,state:{stageId:transition.id,progress:direction>0?eased:1-eased}});
     if(ticket!==generation)return false;emit({pose});if(fraction===1)break;
    }while(true);
    // Rewinding the incoming transition ends at the preceding stage's exact
    // metadata/cues too, including the preceding cumulative seal state.
    const pose=await call('fabrication.pose',{spec,state:{stageId:state.guide.stages[target].id}});
    if(ticket!==generation)return false;emit({pose,busy:false});return true;
   }catch(e){if(ticket===generation)emit({...previous,busy:false,error:e.message});return false;}
  },
  close(){generation++;emit({active:false,busy:false,error:null});}
 };
}
