// Optional transport, not required by the kernel or the current UI.
import {handleRequest} from '../api/dispatch.mjs';
self.addEventListener('message',event=>self.postMessage(handleRequest(event.data)));
