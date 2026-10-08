export type AuthMode='login'|'signup'|'recover'|'reset'|'confirm';

// Password reset tokens are passed to the server for one-time redemption.
export function authCallback(url:URL){
 const params=url.searchParams;
 const hash=new URLSearchParams(url.hash.replace(/^#/,''));
 const requested=params.get('mode');
 const type=hash.get('type')||params.get('type')||'';
 const token=hash.get('access_token')||params.get('token')||'';
 const recovery=type==='recovery'||(!type&&requested==='reset');
 const failed=['error','error_code','error_description'].some(key=>hash.has(key)||params.has(key));
 const callback=!!token||!!type||failed||['access_token','refresh_token','token_hash','code'].some(key=>hash.has(key)||params.has(key));
 let mode:AuthMode=requested==='signup'?'signup':requested==='recover'?'recover':requested==='confirm'?'confirm':'login';
 let recoveryToken='',message='',error='';
 if(failed){
  mode=recovery?'recover':'confirm';
  error=recovery?'This reset link is invalid or expired. Request a new reset link.':'This confirmation link is invalid or expired. Request a new confirmation email below.';
 }else if(recovery){
  if(token){mode='reset';recoveryToken=token;}
  else{mode='recover';error='The reset link is missing or expired. Request a new reset link.';}
 }else if(callback){
  mode='login';
  message='Your email link has opened. Sign in with your password to continue.';
 }else if(requested==='confirmed'){
  message='Your email is verified. Sign in with your password to continue.';
 }
 const cleanPath=callback||requested==='reset'?url.pathname+(mode==='reset'?'?mode=reset':mode==='recover'?'?mode=recover':mode==='confirm'?'?mode=confirm':''):null;
 return {mode,recoveryToken,message,error,cleanPath};
}
