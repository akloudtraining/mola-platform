import {cloudflareUser} from '@/lib/cloudflare-auth';

// A present email session selects that identity, even when its token has expired.
// Never substitute a different account just because validation returned null.
export function hasEmailSession(req?:Request){
 return (req?.headers.get('cookie')||'').split(';').some(part=>{
  const name=part.split('=',1)[0].trim();
  return ['mola_access_token','mola_refresh_token','better-auth.session_token','__Secure-better-auth.session_token','better-auth-session_token'].includes(name);
 });
}

export async function workspaceIdentity(req?:Request){
 const user=await cloudflareUser(req||new Request('https://mola.invalid/'));
 return user?.emailVerified?user:null;
}
