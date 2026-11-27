// Composition root: connect feature ports. No form markup, folding math or gestures.
import {createWorkerClient} from '../api/worker-client.mjs';
import {createAsyncController} from './async-controller.mjs';
import {createDesignSession} from './design-session.mjs';
import {createParameterFeature} from './parameter-feature.mjs';
import {createViewportFeature} from './viewport-feature.mjs';
import {createActuationFeature} from './actuation-feature.mjs';
import {createFabricationFeature} from './fabrication-feature.mjs';
import {createProjectFeature} from './project-feature.mjs';

const client=createWorkerClient(new Worker(new URL('../adapters/worker.mjs',import.meta.url),{type:'module'}));
const controller=createAsyncController(client.call),catalog=await client.call('intent.describe');
const session=createDesignSession({call:client.call,controller,catalog,storage:sessionStorage});
let viewport,actuation;
const parameters=createParameterFeature({document,catalog,actions:{command:session.command,travel:session.travel,interpret:session.interpret},onSelection:()=>viewport?.paint()});
viewport=createViewportFeature({document,storage:localStorage,getSelection:()=>parameters,
 getDefaultFrame:()=>session.state.validReport?controller.frame(session.state.validReport.spec,'actuation'):null,
 actions:{command:session.command,selectModelPart:parameters.selectModelPart,prepareEdit:()=>actuation.prepareEdit(),refresh:()=>actuation.refresh()}
});
const project=createProjectFeature({document,session});
actuation=createActuationFeature({document,call:client.call,controller,getFrame:()=>viewport.frame,
 onScene:model=>{parameters.setHandles(model.handles);viewport.present(model);},onError:project.showError
});
createFabricationFeature({document,call:client.call,viewport,getDesign:()=>session.state,
 prepare:async()=>{actuation.stop();await parameters.flush();await session.idle();await actuation.idle();},
 acquire(){const release=session.lock();actuation.suspend();return ()=>{release();actuation.resume();};},
 reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches
});
session.subscribe(model=>{
 if(model.phase==='pending')actuation.pending();
 if(['report','ready','restored','conflict'].includes(model.phase))parameters.update(model);
 if(model.phase==='rejected'){
  const shown=viewport.getDisplayed();session.restoreVisible(shown);viewport.restoreVisible(shown);
 }
 project.update(model);
 if(model.phase==='ready'){if(model.changeKind==='replace')viewport.clearFrame();actuation.update(model);}
});
await session.start();
