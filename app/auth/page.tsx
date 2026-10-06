'use client';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import {LoaderCircle,LockKeyhole,ShieldCheck} from 'lucide-react';
import {authCallback,type AuthMode as Mode} from '@/lib/auth-callback';

export default function AuthPage(){
 const [mode,setMode]=useState<Mode>('login');
 const [email,setEmail]=useState('');
 const [password,setPassword]=useState('');
 const [confirmPassword,setConfirmPassword]=useState('');
 const [displayName,setDisplayName]=useState('');
 const [accessToken,setAccessToken]=useState('');
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [message,setMessage]=useState('');
 const submitting=useRef(false);
 const callbackHandled=useRef(false);

 useEffect(()=>{
  if(callbackHandled.current)return;callbackHandled.current=true;
  const params=new URLSearchParams(window.location.search);
  const callback=authCallback(new URL(window.location.href));
  setMode(callback.mode);setAccessToken(callback.recoveryToken);
  setError(callback.error);setMessage(callback.message);
  if(callback.cleanPath)window.history.replaceState(null,'',callback.cleanPath);
  if(params.get('logout')==='1')void fetch('/api/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'logout'})});
 },[]);

 const chooseMode=(next:Mode)=>{
  if(submitting.current)return;
  setMode(next);setError('');setMessage('');setPassword('');setConfirmPassword('');setAccessToken('');
  window.history.replaceState(null,'',window.location.pathname+(next==='login'?'':`?mode=${next}`));
 };

 const submit=async(e:FormEvent)=>{
  e.preventDefault();if(submitting.current)return;submitting.current=true;setBusy(true);setError('');setMessage('');
  try{
   if(mode==='reset'&&password!==confirmPassword)throw new Error('Passwords do not match.');
   const body:any={action:mode==='reset'?'update_password':mode==='confirm'?'resend_confirmation':mode};
   if(mode==='login'||mode==='signup'||mode==='recover'||mode==='confirm')body.email=email;
   if(mode==='signup')body.displayName=displayName;
   if(mode==='login'||mode==='signup'||mode==='reset')body.password=password;
   if(mode==='reset'&&accessToken)body.accessToken=accessToken;
   const r=await fetch('/api/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
   const d:any=await r.json().catch(()=>({}));
   if(!r.ok||d.ok!==true)throw new Error(d.error||'The request could not be confirmed. Please try again.');
   if(mode==='recover'||mode==='confirm'){setMessage(d.message||(mode==='confirm'?'If an account needs confirmation, check its email for a new link.':'If an account matches, check the email for reset instructions.'));return;}
   if(mode==='reset'){setMessage(d.message||'Password updated. Sign in again.');setMode('login');setPassword('');setConfirmPassword('');setAccessToken('');window.history.replaceState(null,'',window.location.pathname);return;}
   if(d.requiresConfirmation){setMode('confirm');setMessage(d.message||'Check your email to confirm your account.');setPassword('');setConfirmPassword('');window.history.replaceState(null,'',window.location.pathname+'?mode=confirm');return;}
   window.location.href='/';
  }catch(e){setError((e as Error).message);}finally{submitting.current=false;setBusy(false);}
 };

 const recovery=mode==='recover'||mode==='reset'||mode==='confirm';
 const title=mode==='login'?'Welcome back':mode==='signup'?'Create your member account':mode==='recover'?'Recover your account':mode==='confirm'?'Confirm your member email':'Choose a new password';
 const intro=mode==='reset'?'Use the secure link from your email to set a new password.':mode==='recover'?'Enter your member email and we will send reset instructions if an account matches.':mode==='confirm'?'Open the confirmation link in your email. If it expired or did not arrive, enter your account email to request a new link.':'Use the email assigned to your founding member record. Your workspace access is still controlled by the group owner.';
 const submitLabel=mode==='login'?'Sign in':mode==='signup'?'Create account':mode==='recover'?'Send reset link':mode==='confirm'?'Resend confirmation email':'Update password';

 return <main className="auth-shell"><section className="auth-card"><div className="auth-brand"><span className="brand-icon">C</span><span>collective</span></div><div className="auth-icon"><LockKeyhole size={22}/></div><p className="eyebrow">PRIVATE WORKSPACE · MEMBER ACCESS</p><h1>{title}</h1><p className="auth-intro">{intro}</p>{!recovery&&<div className="auth-tabs"><button type="button" className={mode==='login'?'active':''} disabled={busy} onClick={()=>chooseMode('login')}>Sign in</button><button type="button" className={mode==='signup'?'active':''} disabled={busy} onClick={()=>chooseMode('signup')}>Create account</button></div>}<form onSubmit={submit} className="auth-form"><fieldset className="auth-fields" disabled={busy}>{mode==='signup'&&<label className="field">Name (optional)<input value={displayName} onChange={e=>setDisplayName(e.target.value)} autoComplete="name" maxLength={100} placeholder="How members should see you"/></label>}{mode!=='reset'&&<label className="field">Email<input type="email" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" placeholder="you@example.com"/></label>}{mode!=='recover'&&mode!=='confirm'&&<label className="field">Password<input type="password" required minLength={8} maxLength={128} value={password} onChange={e=>setPassword(e.target.value)} autoComplete={mode==='login'?'current-password':'new-password'} placeholder="At least 8 characters"/></label>}{mode==='reset'&&<label className="field">Confirm password<input type="password" required minLength={8} maxLength={128} value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} autoComplete="new-password" placeholder="Repeat your new password"/></label>}{mode==='login'&&<div className="auth-help"><button type="button" className="auth-link" onClick={()=>chooseMode('recover')}>Forgot password?</button><button type="button" className="auth-link" onClick={()=>chooseMode('confirm')}>Resend confirmation email</button></div>}{error&&<p className="form-error" role="alert">{error}</p>}{message&&<p className="auth-message" role="status">{message}</p>}<button className="primary auth-submit" disabled={busy}>{busy?'Working…':submitLabel}{busy&&<LoaderCircle size={16} className="auth-spinner" aria-hidden="true"/>}</button></fieldset></form>{recovery&&<button type="button" className="auth-link auth-back-button" disabled={busy} onClick={()=>chooseMode('login')}>Back to sign in</button>}<div className="auth-note"><ShieldCheck size={18}/><p>Payments are still submitted externally and independently reviewed. The account records who accessed and submitted each workspace action.</p></div><a className="auth-back" href="/">Back to workspace</a></section></main>;
}
