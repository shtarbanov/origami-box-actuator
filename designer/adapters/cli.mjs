// node adapters/cli.mjs request.json, or pipe one JSON request to stdin.
import {readFile} from 'node:fs/promises';
import {handleRequest,API_VERSION} from '../api/dispatch.mjs';
let response;
try{
 let text='';if(process.argv[2])text=await readFile(process.argv[2],'utf8');else for await(const chunk of process.stdin)text+=chunk;
 response=handleRequest(JSON.parse(text));
}catch{response={apiVersion:API_VERSION,id:null,ok:false,errors:[{code:'INVALID_JSON',path:'',message:'Could not read a valid JSON request.'}]};}
process.stdout.write(JSON.stringify(response)+'\n');process.exitCode=response.ok?0:1;
