import {workspaceEndpoint} from './workspace-endpoint';
// Only read requests may be replayed. Mutations always require an explicit retry.
let refreshing:Promise<boolean>|null=null;
let generation=0;
const readable=new Set(['/api/workspace','/api/workspace/export','/api/storage/reconcile']);
const pilotRead=(input:string)=>input==='/api/pilot/readiness'||input.startsWith('/api/pilot/readiness?');
async function renew(){
 if(!refreshing){
  refreshing=(async()=>{
   try{
    const response=await fetch('/api/auth',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'refresh'}),signal:AbortSignal.timeout(15000)});
    if(!response.ok)return false;
    const data=await response.json();
    if(!data||typeof data!=='object'||!('ok' in data)||data.ok!==true)return false;
    generation++;return true;
   }catch{return false;}
  })().finally(()=>{refreshing=null;});
 }
 return refreshing;
}
export async function workspaceFetch(input:string,init:RequestInit={}){
 const target=workspaceEndpoint(input);
 const started=generation;
 const response=await fetch(target,init);
 if(response.status!==401||(!readable.has(input)&&!pilotRead(input))||(init.method||'GET').toUpperCase()!=='GET'||init.signal?.aborted)return response;
 if(started!==generation||await renew()){
  if(init.signal?.aborted)return response;
  return fetch(target,init);
 }
 return response;
}
