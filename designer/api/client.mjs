// In-process transport. A worker/HTTP client can implement this same call boundary.
import {handleRequest,API_VERSION} from './dispatch.mjs';
export function call(method,payload={}){
 const result=handleRequest({apiVersion:API_VERSION,method,payload});
 if(!result.ok){const error=new Error(result.errors.map(e=>e.message).join(' '));error.issues=result.errors;throw error;}
 return result.value;
}
