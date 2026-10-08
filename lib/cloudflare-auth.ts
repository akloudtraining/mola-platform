import {betterAuth} from 'better-auth';
import {drizzleAdapter} from 'better-auth/adapters/drizzle';
import {drizzle} from 'drizzle-orm/d1';
import {env} from 'cloudflare:workers';
import * as schema from '@/db/schema';
import type {Identity} from './access';

const runtime=():Record<string,string|undefined>=>typeof process!=='undefined'?(process.env as Record<string,string|undefined>):{};
function value(name:'MOLA_AUTH_SECRET'|'MOLA_APP_URL'|'MOLA_EMAIL_FROM'){
 const cloudflareValue=name==='MOLA_AUTH_SECRET'?env.MOLA_AUTH_SECRET:name==='MOLA_APP_URL'?env.MOLA_APP_URL:env.MOLA_EMAIL_FROM;
 return String(cloudflareValue||runtime()[name]||'').trim();
}

export function createCloudflareAuth(request:Request){
 const db=env.DB;
 const secret=value('MOLA_AUTH_SECRET');
 if(!db)throw new Error('Cloudflare D1 is not configured for authentication.');
 if(secret.length<32)throw new Error('MOLA_AUTH_SECRET must be set to a random value of at least 32 characters.');
 const origin=value('MOLA_APP_URL')||new URL(request.url).origin;
 const sender=value('MOLA_EMAIL_FROM');
 const emailBinding=env.EMAIL;
 const send=async(to:string,subject:string,text:string,html:string)=>{
  if(!emailBinding||!sender)throw new Error('Cloudflare transactional email is not configured.');
  await emailBinding.send({from:sender,to,subject,text,html});
 };
 return betterAuth({
  appName:'Mola Holdings',baseURL:origin,basePath:'/api/auth',secret,
  trustedOrigins:[origin,new URL(request.url).origin],
  database:drizzleAdapter(drizzle(db,{schema}),{provider:'sqlite',schema:{user:schema.user,session:schema.session,account:schema.account,verification:schema.verification}}),
  emailAndPassword:{enabled:true,requireEmailVerification:true,autoSignIn:false,revokeSessionsOnPasswordReset:true,
   sendResetPassword:async({user,url})=>send(user.email,'Reset your Mola sign-in password',`Use this secure link to reset your password. It expires in one hour.\n\n${url}\n\nIf you did not request a reset, ignore this email.`,`<p>Use this secure link to reset your password. It expires in one hour.</p><p><a href="${url}">Reset password</a></p><p>If you did not request a reset, ignore this email.</p>`)
  },
  emailVerification:{sendOnSignUp:true,sendOnSignIn:false,autoSignInAfterVerification:false,expiresIn:60*60,
   sendVerificationEmail:async({user,url})=>send(user.email,'Verify your Mola member account',`Verify your email to activate sign-in to Mola Holdings. This link expires in one hour.\n\n${url}\n\nIf you did not create a Mola account, ignore this email.`, `<p>Verify your email to activate sign-in to Mola Holdings. This link expires in one hour.</p><p><a href="${url}">Verify email</a></p><p>If you did not create a Mola account, ignore this email.</p>`)
  },
  session:{expiresIn:60*60*24*14,updateAge:60*60*24},
  advanced:{useSecureCookies:true,defaultCookieAttributes:{httpOnly:true,secure:true,sameSite:'lax',path:'/' }},
  rateLimit:{enabled:true,window:60,max:10},
 });
}

export async function cloudflareUser(req:Request):Promise<Identity|null>{
 const auth=createCloudflareAuth(req);
 const session=await auth.api.getSession({headers:req.headers});
 if(!session?.user?.id||!session.user.email)return null;
 return {userId:session.user.id,email:session.user.email,displayName:session.user.name||session.user.email,emailVerified:session.user.emailVerified===true};
}

export async function runAuthEndpoint(req:Request,path:string,body?:Record<string,unknown>){
 const auth=createCloudflareAuth(req),url=new URL(req.url);url.pathname=`/api/auth/${path}`;url.search='';
 const headers=new Headers(req.headers);headers.set('origin',new URL(req.url).origin);
 if(body!==undefined)headers.set('content-type','application/json');
 return auth.handler(new Request(url,{method:body===undefined?'GET':'POST',headers,...(body===undefined?{}:{body:JSON.stringify(body)})}));
}

export const cloudflareSessionCookieNames=['better-auth.session_token','__Secure-better-auth.session_token'];
