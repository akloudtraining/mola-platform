'use client';
import {useState,type FormEvent} from 'react';
import {AccountIcon,MailIcon,SystemIcon,SunIcon,MoonIcon,AppearanceIcon,LanguageIcon,LockIcon,SignOutIcon} from './mola-icons';
import {THEME_KEY,LANGUAGE_KEY,themeChoice,languageChoice,savePreference,type ThemeChoice,type LanguageChoice} from './preferences';

// Language names stay in their own language, so those options opt out of translation.
function Choice<T extends string>({label,value,options,onChange,fixedLabels=false}:{label:string;value:T;options:{value:T;label:string;icon?:React.ReactNode}[];onChange:(value:T)=>void;fixedLabels?:boolean}){
 return <div className="settings-choice" role="radiogroup" aria-label={label}>{options.map(o=><button key={o.value} type="button" role="radio" aria-checked={value===o.value} onClick={()=>onChange(o.value)}>{o.icon}<span translate={fixedLabels&&o.value!=='system'?'no':undefined}>{o.label}</span></button>)}</div>;
}

function ChangeEmail({email}:{email:string}){
 const [open,setOpen]=useState(false),[next,setNext]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
 async function submit(e:FormEvent){
  e.preventDefault();if(busy)return;setBusy(true);setError('');setMessage('');
  try{
   const response=await fetch('/api/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'change_email',newEmail:next})});
   const data=await response.json().catch(()=>({})) as {error?:string;message?:string};
   if(!response.ok)throw new Error(data.error||'The email update could not be started.');
   setMessage(data.message||'Check your current inbox to approve the change.');setNext('');setOpen(false);
  }catch(err){setError((err as Error).message);}finally{setBusy(false);}
 }
 return <div className="settings-email">
  {!open&&<button type="button" className="secondary" onClick={()=>{setOpen(true);setMessage('');}}><MailIcon size={18}/>Update email</button>}
  {open&&<form onSubmit={submit}>
   <label className="field">New email address<input type="email" required autoComplete="email" maxLength={254} value={next} onChange={e=>setNext(e.target.value)} placeholder="name@example.com"/></label>
   <p className="form-note">For your security we email an approval link to {email||'your current address'} first. After you approve, a final link goes to the new address. Your sign-in email updates only when both are confirmed.</p>
   {error&&<p className="form-error" role="alert">{error}</p>}
   <div className="form-actions"><button type="button" className="secondary" disabled={busy} onClick={()=>{setOpen(false);setError('');}}>Cancel</button><button type="submit" className="primary" disabled={busy||!next.trim()}>{busy?'Sending…':'Send approval link'}</button></div>
  </form>}
  {message&&<p className="form-note settings-success" role="status">{message}</p>}
 </div>;
}

export default function AccountSettings({name,email}:{name:string;email:string}){
 // This screen only renders after the workspace loads in the browser, so stored choices can be read directly.
 const [theme,setTheme]=useState<ThemeChoice>(()=>typeof window==='undefined'?'system':themeChoice()),[language,setLanguage]=useState<LanguageChoice>(()=>typeof window==='undefined'?'en':languageChoice());
 return <section className="settings-page"><div className="settings-grid">
  <section className="panel settings-card"><div className="panel-header"><h2>My profile</h2><AccountIcon size={22}/></div><div className="settings-body">
   <div className="settings-identity"><span className="avatar light">{name.slice(0,1).toUpperCase()||'—'}</span><div><strong>{name||'Signed-in user'}</strong><small translate="no">{email||'Email unavailable'}</small></div></div>
   <ChangeEmail email={email}/>
   <div className="settings-actions"><a className="secondary" href="/auth?mode=recover"><LockIcon size={18}/>Reset my password</a><a className="secondary" href="/auth?logout=1" target="_top"><SignOutIcon size={18}/>Sign out / switch account</a></div>
  </div></section>
  <section className="panel settings-card"><div className="panel-header"><h2>Appearance</h2><AppearanceIcon size={22}/></div><div className="settings-body">
   <p>Choose a theme for this device. System follows your phone or computer setting.</p>
   <Choice label="Theme" value={theme} onChange={v=>{setTheme(v);savePreference(THEME_KEY,v);}} options={[{value:'system',label:'System',icon:<SystemIcon size={18}/>},{value:'light',label:'Light',icon:<SunIcon size={18}/>},{value:'dark',label:'Dark',icon:<MoonIcon size={18}/>}]}/>
  </div></section>
  <section className="panel settings-card"><div className="panel-header"><h2>Language</h2><LanguageIcon size={22}/></div><div className="settings-body">
   <p>English is the default. Device language uses French when your device is set to French.</p>
   <Choice label="Language" value={language} onChange={v=>{setLanguage(v);savePreference(LANGUAGE_KEY,v);}} fixedLabels options={[{value:'en',label:'English'},{value:'fr',label:'Français'},{value:'system',label:'Device language'}]}/>
   <p className="form-note">Names, notes and other details people type stay as entered. Emails from Mola are sent in English.</p>
  </div></section>
  <section className="panel settings-card"><div className="panel-header"><h2>Workspace access</h2><LockIcon size={22}/></div><div className="settings-body"><p>Your verified account can access organizations linked to your founder record. Owners manage member permissions on Founders.</p><p className="form-note">Keep full bank account numbers, credentials and identity documents out of company notes and payment screenshots.</p></div></section>
 </div></section>;
}
