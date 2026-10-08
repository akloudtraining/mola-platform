import {env} from 'cloudflare:workers';
import type {Identity} from './access';

const ACCESS_COOKIE='mola_access_token';
const REFRESH_COOKIE='mola_refresh_token';
const ACCESS_MAX_AGE=60*60;
const REFRESH_MAX_AGE=60*60*24*30;

type SupabaseUser={id:string;email?:string;user_metadata?:Record<string,unknown>;app_metadata?:Record<string,unknown>};
type AuthTokens={access_token?:string;refresh_token?:string;expires_in?:number;user?:SupabaseUser|null};

function config(){
 const runtime=typeof process!=='undefined'?(process.env||{}):{};
 const url=String((env as any).SUPABASE_URL||runtime.SUPABASE_URL||runtime.NEXT_PUBLIC_SUPABASE_URL||'').trim().replace(/\/$/,'');
 const key=String((env as any).SUPABASE_PUBLISHABLE_KEY||runtime.SUPABASE_PUBLISHABLE_KEY||runtime.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||runtime.NEXT_PUBLIC_SUPABASE_ANON_KEY||'').trim();
 return url&&key?{url,key}:null;
}

function cookies(req:Request){
 const out=new Map<string,string>();
 for(const part of (req.headers.get('cookie')||'').split(';')){
  const i=part.indexOf('=');if(i<0)continue;
  const key=part.slice(0,i).trim(),value=part.slice(i+1).trim();
  if(key)out.set(key,value);
 }
 return out;
}

function identity(user:SupabaseUser|null|undefined):Identity|null{
 if(!user?.id||!user.email)return null;
 const metadata=user.user_metadata||{};
 const displayName=typeof metadata.full_name==='string'&&metadata.full_name.trim()?metadata.full_name.trim():typeof metadata.name==='string'&&metadata.name.trim()?metadata.name.trim():user.email;
 return {userId:`supabase:${user.id}`,email:user.email,displayName};
}

async function authFetch(path:string,init:RequestInit={},redirectTo?:string){
 const c=config();if(!c)return null;
 const headers=new Headers(init.headers);headers.set('apikey',c.key);headers.set('Content-Type','application/json');
 const target=new URL(`${c.url}/auth/v1/${path}`);
 if(redirectTo)target.searchParams.set('redirect_to',redirectTo);
 return fetch(target.toString(),{...init,headers});
}

export async function supabaseUser(req:Request):Promise<Identity|null>{
 const c=config();if(!c)return null;
 const access=cookies(req).get(ACCESS_COOKIE);if(!access)return null;
 const response=await authFetch('user',{headers:{Authorization:`Bearer ${access}`}});
 if(!response?.ok)return null;
 return identity(await response.json() as SupabaseUser);
}

export async function requestIdentity(req:Request):Promise<Identity|null>{
 return supabaseUser(req);
}

export function setAuthCookies(response:Response,tokens:AuthTokens){
 if(tokens.access_token)response.headers.append('Set-Cookie',cookie(ACCESS_COOKIE,tokens.access_token,ACCESS_MAX_AGE));
 if(tokens.refresh_token)response.headers.append('Set-Cookie',cookie(REFRESH_COOKIE,tokens.refresh_token,REFRESH_MAX_AGE));
}

export function clearAuthCookies(response:Response){
 response.headers.append('Set-Cookie',cookie(ACCESS_COOKIE,'',0));
 response.headers.append('Set-Cookie',cookie(REFRESH_COOKIE,'',0));
}

export function supabaseAccessToken(req:Request){
 return cookies(req).get(ACCESS_COOKIE)||'';
}

function cookie(name:string,value:string,maxAge:number){
 return `${name}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

function sameOrigin(req:Request){
 const origin=req.headers.get('origin');
 return !origin||origin===new URL(req.url).origin;
}

export async function authAction(req:Request,body:any){
 if(!sameOrigin(req))return {response:Response.json({error:'Invalid request origin.'},{status:403})};
 const c=config();if(!c)return {response:Response.json({error:'Email sign-in is not configured yet.'},{status:503})};
 const action=typeof body?.action==='string'?body.action:'';
 if(action==='logout'){
  const access=cookies(req).get(ACCESS_COOKIE);if(access)await authFetch('logout',{method:'POST',headers:{Authorization:`Bearer ${access}`}}).catch(()=>{});
  const response=Response.json({ok:true});clearAuthCookies(response);return {response};
 }
 if(action==='signup'){
  const email=typeof body.email==='string'?body.email.trim().toLowerCase():'';
  const password=typeof body.password==='string'?body.password:'';
  const displayName=typeof body.displayName==='string'?body.displayName.trim():'';
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return {response:Response.json({error:'Enter a valid email address.'},{status:400})};
  if(password.length<8||password.length>128)return {response:Response.json({error:'Use a password between 8 and 128 characters.'},{status:400})};
  const redirectTo=new URL('/auth?mode=confirmed',req.url).toString();
  const result=await authFetch('signup',{method:'POST',body:JSON.stringify({email,password,data:displayName?{full_name:displayName}:undefined})},redirectTo);
  const data=await result?.json().catch(()=>({})) as AuthTokens&{msg?:string;message?:string;error_description?:string};
  if(!result?.ok)return {response:Response.json({error:data?.msg||data?.message||data?.error_description||'Account could not be created.'},{status:result?.status||502})};
  const response=Response.json({ok:true,requiresConfirmation:!data.access_token,message:data.access_token?'Account created.':'Check your email to confirm the account.'});setAuthCookies(response,data);return {response};
 }
 if(action==='login'){
  const email=typeof body.email==='string'?body.email.trim().toLowerCase():'';
  const password=typeof body.password==='string'?body.password:'';
  if(!email||!password)return {response:Response.json({error:'Enter your email and password.'},{status:400})};
  const result=await authFetch('token?grant_type=password',{method:'POST',body:JSON.stringify({email,password})});
  const data=await result?.json().catch(()=>({})) as AuthTokens&{msg?:string;message?:string;error_description?:string};
  if(!result?.ok)return {response:Response.json({error:data?.msg||data?.message||data?.error_description||'Sign-in failed.'},{status:result?.status||502})};
  const response=Response.json({ok:true});setAuthCookies(response,data);return {response};
 }
 if(action==='refresh'){
  const refresh=cookies(req).get(REFRESH_COOKIE)||'';
  if(!refresh)return {response:Response.json({error:'Your session has expired. Please sign in again.'},{status:401})};
  const result=await authFetch('token?grant_type=refresh_token',{method:'POST',body:JSON.stringify({refresh_token:refresh})});
  const data=await result?.json().catch(()=>({})) as AuthTokens&{msg?:string;message?:string;error_description?:string};
  // Preserve the selected email identity on refresh failure. Clearing these
  // cookies would let the next request fall back to the legacy account.
  if(!result?.ok)return {response:Response.json({error:'Your session has expired. Please sign in again.'},{status:401})};
  const response=Response.json({ok:true});setAuthCookies(response,data);return {response};
 }
 if(action==='recover'||action==='resend_confirmation'){
  const email=typeof body.email==='string'?body.email.trim().toLowerCase():'';
  if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return {response:Response.json({error:'Enter a valid email address.'},{status:400})};
  const confirmation=action==='resend_confirmation';
  const redirectTo=new URL(confirmation?'/auth?mode=confirmed':'/auth?mode=reset',req.url).toString();
  const result=await authFetch(confirmation?'resend':'recover',{method:'POST',body:JSON.stringify(confirmation?{email,type:'signup'}:{email})},redirectTo).catch(()=>null);
  if(!result||result.status>=500)return {response:Response.json({error:'We could not confirm the email request. Please try again later.'},{status:503})};
  const fault=result.ok?null:await result.json().catch(()=>null) as {code?:string;error_code?:string}|null;
  const code=fault?.code||fault?.error_code;
  if(result.status===429||code==='over_email_send_rate_limit'||code==='over_request_rate_limit'){
   const response=Response.json({error:'Too many email requests. Wait before trying again.'},{status:429});
   const retry=result.headers.get('Retry-After');
   if(retry&&/^\d{1,5}$/.test(retry)&&Number(retry)>0&&Number(retry)<=3600)response.headers.set('Retry-After',retry);
   return {response};
  }
  if(result.status===401||result.status===403||code==='email_address_not_authorized'||code==='email_provider_disabled'||code==='otp_disabled')return {response:Response.json({error:'Email delivery is not available for this request. Contact the workspace owner.'},{status:503})};
  // Account-specific outcomes stay indistinguishable, including unknown and
  // already-confirmed addresses. Only delivery/service failures are exposed.
  return {response:Response.json({ok:true,message:confirmation?'If an account needs confirmation, check its email for a new link.':'If an account matches, check the email for reset instructions.'})};
 }
 if(action==='update_password'){
  const password=typeof body.password==='string'?body.password:'';
  const accessToken=typeof body.accessToken==='string'&&body.accessToken.trim()?body.accessToken.trim():cookies(req).get(ACCESS_COOKIE)||'';
  if(password.length<8||password.length>128)return {response:Response.json({error:'Use a password between 8 and 128 characters.'},{status:400})};
  if(!accessToken||accessToken.length>4096)return {response:Response.json({error:'The reset link is missing or expired. Request a new one.'},{status:401})};
  const result=await authFetch('user',{method:'PUT',headers:{Authorization:`Bearer ${accessToken}`},body:JSON.stringify({password})});
  if(!result?.ok){const response=Response.json({error:'The reset link is missing or expired. Request a new one.'},{status:401});clearAuthCookies(response);return {response};}
  const response=Response.json({ok:true,message:'Password updated. Sign in again.'});clearAuthCookies(response);return {response};
 }
 return {response:Response.json({error:'Unsupported auth action.'},{status:400})};
}

export const authCookieNames={ACCESS_COOKIE,REFRESH_COOKIE};
