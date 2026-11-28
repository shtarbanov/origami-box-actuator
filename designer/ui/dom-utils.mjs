export const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const fmt=value=>Number.isFinite(value)?Number(value.toFixed(4)).toString():'—';
export function download(document,name,value,type){const url=URL.createObjectURL(new Blob([value],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export function createInputDebounce(){
 let timer=null,pending=null;
 function cancel(){globalThis.clearTimeout(timer);timer=null;pending=null;}
 return {cancel,schedule(fn,delay){cancel();pending=fn;timer=globalThis.setTimeout(()=>{pending=null;timer=null;fn();},delay);return timer;},flush(){const fn=pending;cancel();return fn?.();}};
}
