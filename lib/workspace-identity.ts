import {getChatGPTUser} from '@/app/chatgpt-auth';
import {requestIdentity} from '@/lib/supabase-session';

// A present email session selects that identity, even when its token has expired.
// Never substitute a different account just because validation returned null.
export function hasEmailSession(req?:Request){
 return (req?.headers.get('cookie')||'').split(';').some(part=>{
  const name=part.split('=',1)[0].trim();
  return name==='mola_access_token'||name==='mola_refresh_token';
 });
}

export async function workspaceIdentity(req?:Request){
 const emailUser=req?await requestIdentity(req):null;
 if(emailUser||hasEmailSession(req))return emailUser;
 return getChatGPTUser();
}
