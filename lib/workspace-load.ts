import {workspaceFetch} from './workspace-fetch';
export class WorkspaceLoadError extends Error{
 constructor(message:string,public status:number){super(message);}
}
export async function readWorkspace(){
 let response:Response;
 try{response=await workspaceFetch('/api/workspace');}
 catch{throw new WorkspaceLoadError('Connection interrupted. Try refreshing when you are back online.',0);}
 if(response.status===401)throw new WorkspaceLoadError('Sign in again to open the workspace.',401);
 if(response.status===410)throw new WorkspaceLoadError('This test workspace has been deleted. Return to Test workspace to create a fresh one.',410);
 if(response.status===403)throw new WorkspaceLoadError('This account no longer has access to the workspace.',403);
 if(!response.ok)throw new WorkspaceLoadError('The workspace could not be refreshed. Please try again.',response.status);
 const data:any=await response.json().catch(()=>null);
 if(!data||!Array.isArray(data.organizations)||!Array.isArray(data.entries)||typeof data.name!=='string'||(data.activity!==undefined&&!Array.isArray(data.activity)))throw new WorkspaceLoadError('The server returned an incomplete workspace. Please retry.',502);
 return data;
}
