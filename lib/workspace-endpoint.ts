// Test identity lives in this tab's URL, never in a shared auth cookie or global
// mutable impersonation state. Invalid test context must never fall back to live.
export function workspaceEndpoint(input:string){
 if(typeof window==='undefined'||!/^\/test(?:\/|$)/.test(window.location.pathname))return input;
 if(input!=='/api/workspace')throw new Error('This operation is unavailable in the test workspace.');
 const query=new URLSearchParams(window.location.search),session=query.get('session'),role=query.get('role');
 if(!session||!role)throw new Error('Open a test workspace and choose a test member first.');
 return `/api/test-workspace?${new URLSearchParams({session,role})}`;
}
