import {runAuthEndpoint} from './cloudflare-auth';
import {env} from 'cloudflare:workers';

const json=(data:Record<string,unknown>,status=200,headers?:HeadersInit)=>Response.json(data,{status,headers});
const validEmail=(email:string)=>email.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
async function isEligibleSignup(email:string){
 const configured=String(env.MOLA_OWNER_EMAIL||'').trim().toLowerCase();
 if(configured&&configured===email)return true;
 const db=env.DB;if(!db)return false;
 const row=await db.prepare("SELECT 1 AS eligible FROM organizations o,json_each(o.data,'$.members') m WHERE json_extract(m.value,'$.access.enabled')=1 AND lower(json_extract(m.value,'$.access.email'))=? LIMIT 1").bind(email).first();
 return !!row;
}
function sameOrigin(req:Request){const origin=req.headers.get('origin');return !origin||origin===new URL(req.url).origin;}
function withCookies(source:Response,data:Record<string,unknown>,status=source.status){
 const headers=new Headers({'Cache-Control':'no-store'});
 for(const [key,value] of source.headers){if(key.toLowerCase()!=='set-cookie')headers.set(key,value);}
 for(const cookie of source.headers.getSetCookie?.()||[]){headers.append('Set-Cookie',cookie);}
 return Response.json(data,{status,headers});
}
async function providerMessage(response:Response){
 const body=await response.clone().json().catch(()=>({})) as Record<string,unknown>;
 return typeof body.message==='string'?body.message:typeof body.error==='string'?body.error:'';
}

export async function authAction(req:Request,body:unknown){
 if(!sameOrigin(req))return {response:json({error:'Invalid request origin.'},403)};
 const input=body&&typeof body==='object'&&!Array.isArray(body)?body as Record<string,unknown>:{};
 const action=typeof input.action==='string'?input.action:'';
 // Resolve email callbacks on the auth service's origin, not the host
 // where the request began (root domain, app subdomain or Worker alias).
 try{
  if(action==='logout'){
   const result=await runAuthEndpoint(req,'sign-out',{});
   return {response:withCookies(result,{ok:true},200)};
  }
  if(action==='refresh'){
   const result=await runAuthEndpoint(req,'get-session');
   const session=await result.json().catch(()=>null) as {user?:unknown}|null;
   if(!result.ok||!session?.user)return {response:json({error:'Your session has expired. Please sign in again.'},401)};
   return {response:withCookies(result,{ok:true})};
  }
  if(['signup','login','recover','resend_confirmation'].includes(action)){
   const email=typeof input.email==='string'?input.email.trim().toLowerCase():'';
   if(!validEmail(email))return {response:json({error:'Enter a valid email address.'},400)};
   if(action==='signup'){
    if(!await isEligibleSignup(email))return {response:json({error:'This email is not enabled for a Mola account yet. Ask the workspace owner to add it to the member list.'},403)};
    const password=typeof input.password==='string'?input.password:'';
    const displayName=typeof input.displayName==='string'?input.displayName.trim().slice(0,100):'';
    if(!displayName)return {response:json({error:'Enter your full name.'},400)};
    if(password.length<8||password.length>128)return {response:json({error:'Use a password between 8 and 128 characters.'},400)};
    const result=await runAuthEndpoint(req,'sign-up/email',{name:displayName||email.split('@')[0],email,password,callbackURL:'/auth?mode=confirmed'});
    if(!result.ok){const detail=await providerMessage(result);const message=detail.toLowerCase().includes('email')?'Account could not be created or the verification email could not be sent. Please retry later.':'Account could not be created. Check the details and try again.';return {response:json({error:message},result.status>=500?503:result.status)};}
    return {response:json({ok:true,requiresConfirmation:true,message:'Check your email for a verification link. You can sign in after verifying your email.'})};
   }
   if(action==='login'){
    const password=typeof input.password==='string'?input.password:'';
    if(!password||password.length>128)return {response:json({error:'Enter your email and password.'},400)};
    const result=await runAuthEndpoint(req,'sign-in/email',{email,password});
    if(!result.ok)return {response:json({error:result.status===403?'Verify your email before signing in.':'Email or password is incorrect.'},result.status>=500?503:result.status===403?403:401)};
    return {response:withCookies(result,{ok:true})};
   }
   const confirmation=action==='resend_confirmation';
   const result=confirmation
    ?await runAuthEndpoint(req,'send-verification-email',{email,callbackURL:'/auth?mode=confirmed'})
    :await runAuthEndpoint(req,'request-password-reset',{email,redirectTo:'/auth?mode=reset'});
   if(!result.ok)return {response:json({error:'Email delivery is temporarily unavailable. Please try again later.'},result.status>=500?503:429)};
   return {response:json({ok:true,message:confirmation?'If the account needs verification, check its email for a new link.':'If an account matches, check the email for reset instructions.'})};
  }
  if(action==='update_password'){
   const password=typeof input.password==='string'?input.password:'';
   const token=typeof input.token==='string'?input.token.trim():'';
   if(password.length<8||password.length>128)return {response:json({error:'Use a password between 8 and 128 characters.'},400)};
   if(!token||token.length>512)return {response:json({error:'The reset link is missing or expired. Request a new one.'},401)};
   const result=await runAuthEndpoint(req,'reset-password',{newPassword:password,token});
   if(!result.ok)return {response:json({error:'The reset link is missing or expired. Request a new one.'},401)};
   return {response:json({ok:true,message:'Password updated. Sign in again.'})};
  }
  return {response:json({error:'Unsupported auth action.'},400)};
 }catch(error){
  console.error('Cloudflare auth action failed',error);
  return {response:json({error:'Authentication is temporarily unavailable. Please retry.'},503)};
 }
}
