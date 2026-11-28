// Application state and transactions. No DOM, cameras, guide stages or rendering.
export function createDesignSession({call,controller,catalog,storage=null}){
 let state={intent:structuredClone(catalog.initialIntent),report:null,validReport:null,bundle:null,handles:null,paper:'A4',phase:'initial',error:null},revision=0,queue=Promise.resolve(),locks=0;
 const listeners=new Set(),undo=[],redo=[];let mergeKey=null,mergeTime=0;
 const emit=patch=>{state={...state,...patch,canUndo:!!undo.length,canRedo:!!redo.length};for(const fn of listeners)fn(state);};
 const persist=()=>{try{storage?.setItem('origami-box-intent/1',JSON.stringify({intent:state.intent,paper:state.paper}));}catch{}};
 function remember(key,origin){
  if(!key||mergeKey!==key||(!key.startsWith('drag-')&&performance.now()-mergeTime>900)){undo.push(structuredClone(origin));if(undo.length>60)undo.shift();redo.length=0;}
  mergeKey=key;mergeTime=performance.now();
 }
 async function accept(report,ticket){
  if(ticket!==revision)return;
  emit({report,intent:report.intent??state.intent,phase:'report',error:null});
  if(report.status!=='resolved'){emit({phase:'conflict'});return;}
  persist();
  const [bundle,handles]=await Promise.all([controller.build(report.spec,state.paper),call('design.handles',{spec:report.spec})]);
  if(ticket!==revision)return;
  emit({validReport:report,bundle,handles,phase:'ready'});
 }
 function transaction(run,changeKind='edit'){
  if(locks)return Promise.resolve(false);
  const ticket=++revision;emit({phase:'pending',error:null,changeKind});
  queue=queue.catch(()=>{}).then(async()=>{try{await run(ticket);}catch(e){if(ticket===revision)emit({phase:'error',error:e.message});}});return queue;
 }
 const api={
  get state(){return state;},
  subscribe(fn){listeners.add(fn);return ()=>listeners.delete(fn);},
  idle:()=>queue,
  lock(){locks++;let released=false;return ()=>{if(!released){released=true;locks--;}};},
  async start(){
   try{const saved=JSON.parse(storage?.getItem('origami-box-intent/1')??'null');if(saved?.intent)state={...state,intent:saved.intent,paper:saved.paper??'A4'};
    else{const old=JSON.parse(storage?.getItem('origami-box-client/1')??'null');if(old?.spec){const r=await call('intent.fromSpec',{spec:old.spec});if(r.status==='resolved')state={...state,intent:r.intent};}}
   }catch{}
   return transaction(ticket=>call('intent.resolve',{intent:state.intent}).then(r=>accept(r,ticket)));
  },
  command(command,key=null,gesture=null){return transaction(async ticket=>{
   const request=gesture?gesture.request(command):{intent:structuredClone(state.intent),command};
   if(!gesture)remember(key,request.intent);
   const result=await call('intent.command',request);
   if(gesture&&result.status!=='resolved'){if(ticket===revision)emit({phase:'rejected',error:result.conflicts?.[0]?.message??'This resize is outside the supported range.'});return;}
   if(gesture)remember(key,request.intent);
   // Keep queued commands cumulative even when a newer render ticket exists.
   state={...state,intent:result.intent??state.intent};await accept(result,ticket);
  });},
  restoreVisible(snapshot){if(!snapshot)return;emit({intent:structuredClone(snapshot.report.intent),report:snapshot.report,validReport:snapshot.report,bundle:snapshot.bundle,handles:snapshot.handles,phase:'restored'});persist();},
  travel(direction){return transaction(async ticket=>{
   const source=direction==='undo'?undo:redo,destination=direction==='undo'?redo:undo;if(!source.length){emit({phase:'ready'});return;}
   destination.push(structuredClone(state.intent));state={...state,intent:source.pop()};mergeKey=null;await accept(await call('intent.resolve',{intent:state.intent}),ticket);
  });},
  newDesign(){return transaction(async ticket=>{remember(null,state.intent);state={...state,intent:structuredClone(catalog.initialIntent)};await accept(await call('intent.resolve',{intent:state.intent}),ticket);},'replace');},
  interpret(text){return transaction(async ticket=>{remember(null,state.intent);const r=await call('intent.interpret',{intent:state.intent,text});state={...state,intent:r.intent??state.intent};await accept(r,ticket);});},
  setPaper(paper){return transaction(async ticket=>{state={...state,paper};await accept(state.report,ticket);});},
  open(value){return transaction(async ticket=>{
   const result=value.schema==='origami-box/project/1'?await call('intent.open',{project:value}):await call('intent.fromSpec',{spec:await controller.import(value)});
   remember(null,state.intent);await accept(result,ticket);
  },'replace');},
  export:()=>call('intent.export',{intent:state.intent})
 };
 return api;
}
