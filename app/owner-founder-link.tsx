'use client';
import {useRef,useState} from 'react';
import type {Org,Member} from '@/lib/model';
import {founderSlotAvailable} from '@/lib/founder-link';
import {saveWorkspaceRecord} from '@/lib/workspace-save';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Select,SelectTrigger,SelectValue,SelectContent,SelectItem} from '@/components/ui/select';
import {Checkbox} from '@/components/ui/checkbox';
import {CheckCircle2,UserRound} from 'lucide-react';

type Draft={orgId:string;version:number;email:string;slots:Member[];memberId:string;name:string;acknowledged:boolean};
type Props={org:Org;email:string;disabled?:boolean;onBusy:(busy:boolean)=>void;onSaved:(org:Org)=>void;reload:()=>Promise<void>};
export default function OwnerFounderLink({org,email,disabled=false,onBusy,onSaved,reload}:Props){
 const [draft,setDraft]=useState<Draft|null>(null),[pending,setPending]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const busy=useRef(false);
 if(!org.permissions?.isOwner||org.mode!=='Shared ownership')return null;
 const own=org.members.find(m=>m.id===org.permissions?.memberId);
 const available=org.members.filter(m=>founderSlotAvailable(m,email));
 const open=()=>{if(busy.current||disabled)return;setError('');setMessage('');setDraft({orgId:org.id,version:org.version,email,slots:available.map(m=>({...m})),memberId:'',name:'',acknowledged:false});};
 const submit=async(event:React.FormEvent)=>{
  event.preventDefault();if(busy.current||disabled||!draft)return;
  const captured=draft;if(!captured.memberId||!captured.name.trim()||!captured.acknowledged){setError('Choose your slot, enter your name and confirm it belongs to you.');return;}
  busy.current=true;setPending(true);setError('');onBusy(true);
  try{
   const data=await saveWorkspaceRecord({action:'linkOwnerFounder',orgId:captured.orgId,version:captured.version,memberId:captured.memberId,name:captured.name,acknowledged:captured.acknowledged});
   if(data.organization?.id!==captured.orgId||data.organization?.permissions?.memberId!==captured.memberId)throw new Error('The account link could not be confirmed. Your details remain here. Refresh Members before trying again.');
   onSaved(data.organization);setDraft(null);setMessage('Your founder account is linked. You can now record your own contribution and agreement acceptance.');
   try{await reload();}catch{setMessage('Your founder account link is confirmed. The workspace could not refresh; try refreshing before your next action.');}
  }catch(e){setError((e as Error).message);}
  finally{busy.current=false;setPending(false);onBusy(false);}
 };
 return <>
  <section className="owner-founder-link" aria-labelledby="owner-founder-title">
   {own?<CheckCircle2 size={22}/>:<UserRound size={22}/>}
   <div><h3 id="owner-founder-title">{own?'Your founder account':'Link your founder account'}</h3><p>{own?`${own.name} · ${own.access?.email||email}`:'Choose the founder slot that belongs to you and use your signed-in account.'}</p>{!own&&!email&&<p className="form-error">Your signed-in email is unavailable. Refresh or sign in again.</p>}{!own&&email&&!available.length&&<p>No unassigned slot is available for this account. Review the member configurations below.</p>}</div>
   {!own&&<button type="button" className="secondary" onClick={open} disabled={disabled||pending||!email||!available.length}>Link my founder account</button>}
  </section>
  {message&&<p className="form-note" role="status">{message}</p>}
  <Dialog open={!!draft} onOpenChange={next=>{if(!next&&!busy.current)setDraft(null);}}><DialogContent className="editor"><DialogHeader><DialogTitle>Link your founder account</DialogTitle><DialogDescription>Choose your own slot. Review permissions are managed separately in member configuration.</DialogDescription></DialogHeader>{draft&&<form onSubmit={submit}><fieldset className="owner-founder-fields" disabled={pending||disabled}>
   <div className="owner-founder-email"><span>Signed-in account</span><strong>{draft.email}</strong></div>
   <label className="field">Your founder slot<Select value={draft.memberId} onValueChange={id=>{const member=draft.slots.find(m=>m.id===id);if(!member)return;setDraft({...draft,memberId:id,name:member.role==='Name pending'?'':member.name,acknowledged:false});}}><SelectTrigger aria-label="Your founder slot" className="choice"><SelectValue placeholder="Choose your slot"/></SelectTrigger><SelectContent>{draft.slots.map(m=><SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent></Select></label>
   <label className="field">Your member name<input autoComplete="name" value={draft.name} required maxLength={100} onChange={event=>setDraft({...draft,name:event.target.value,acknowledged:false})}/></label>
   <label className="check-field"><Checkbox checked={draft.acknowledged} onCheckedChange={value=>setDraft({...draft,acknowledged:value===true})}/>I confirm this is my own founder slot and member name.</label>
   {error&&<div role="alert"><p className="form-error">{error}</p>{error.includes('session has expired')&&<a href="/auth" target="_blank" rel="noreferrer" className="text-button">Sign in in another tab</a>}</div>}
   <div className="form-actions"><button type="button" className="secondary" disabled={pending} onClick={()=>setDraft(null)}>Cancel</button><button type="submit" className="primary" disabled={pending||!draft.memberId||!draft.name.trim()||!draft.acknowledged}>{pending?'Linking…':'Link my account'}</button></div>
  </fieldset></form>}</DialogContent></Dialog>
 </>;
}
