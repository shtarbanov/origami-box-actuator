import {API_VERSION} from './protocol.mjs';
// Transport correlation only. Kernel/API remain independent of browser workers.
export function createWorkerClient(worker){
 let sequence=0,closed=false;const pending=new Map();
 function rejectAll(error){for(const task of pending.values())task.reject(error);pending.clear();}
 worker.addEventListener('message',({data})=>{
  const task=pending.get(data.id);if(!task)return;pending.delete(data.id);
  if(data.ok)task.resolve(data.value);else{const error=new Error(data.errors.map(e=>e.message).join(' '));error.issues=data.errors;task.reject(error);}
 });
 worker.addEventListener('error',()=>{closed=true;rejectAll(Error('The calculation worker stopped. Reload to restart it.'));});
 return {
  call(method,payload={}){if(closed)return Promise.reject(Error('Worker client is closed.'));const id=++sequence;
   return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});try{worker.postMessage({apiVersion:API_VERSION,id,method,payload});}catch(error){pending.delete(id);reject(error);}});
  },
  close(){closed=true;rejectAll(Error('Worker client closed.'));worker.terminate();}
 };
}
