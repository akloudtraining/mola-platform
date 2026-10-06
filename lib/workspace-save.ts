import {workspaceEndpoint} from './workspace-endpoint';
const uncertain='The save could not be confirmed. Your details are still here. Check the record list before submitting again; the server may already have saved it.';

// Never replay a mutation after a network error or an ambiguous server response.
export async function saveWorkspaceRecord(body:unknown){
 let response:Response;
 try{response=await fetch(workspaceEndpoint('/api/workspace'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});}
 catch{throw new Error(uncertain);}
 if(response.status===401)throw new Error('Your session has expired. Sign in in another tab, then return here to retry. Your details have been kept.');
 if(response.status>=500)throw new Error(uncertain);
 const data:any=await response.json().catch(()=>null);
 if(!response.ok)throw new Error(typeof data?.error==='string'?data.error:'The record was not accepted. Review your details and try again.');
 if(!data||typeof data!=='object'||(!data.entry&&!data.organization))throw new Error(uncertain);
 return data;
}
