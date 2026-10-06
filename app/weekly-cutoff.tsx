'use client';
import {useState,useRef} from 'react';
import {saveWorkspaceRecord} from '@/lib/workspace-save';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Org} from '@/lib/model';
import DeadlineFields from './deadline-fields';
import {toast} from 'sonner';
export default function WeeklyCutoff({org,reload,onBusy}:{org:Org;reload:()=>Promise<void>;onBusy?:(busy:boolean)=>void}){
 const rule=org.weeklySchedule?.deadlineRule;
 const savingNow=useRef(false);
 const [version,setVersion]=useState(org.version);
 const [open,setOpen]=useState(false),[time,setTime]=useState(rule?.time||''),[zone,setZone]=useState(rule?.timeZone||'UTC'),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function save(e:React.FormEvent){e.preventDefault();if(savingNow.current)return;savingNow.current=true;setBusy(true);onBusy?.(true);setError('');try{
  await saveWorkspaceRecord({action:'scheduleDeadline',orgId:org.id,version,deadlineTime:time,deadlineTimeZone:zone,reason});
  setOpen(false);toast.success('Future weekly cutoff saved');try{await reload();}catch{toast.warning('The cutoff was saved, but the workspace could not refresh. Refresh before editing again.');}
 }catch(e){setError((e as Error).message);}finally{savingNow.current=false;setBusy(false);onBusy?.(false);}}
 return <div className="weekly-cutoff"><strong>Submission cutoff: {rule?rule.time+' · '+rule.timeZone:'Not yet recorded'}</strong><p className="form-note">Each newly generated obligation captures the cutoff on its due date. Existing obligations and payment submissions keep their recorded deadlines.</p>{org.permissions?.canManage&&<button className="secondary" disabled={busy} onClick={()=>{if(savingNow.current)return;setVersion(org.version);setTime(rule?.time||'');setZone(rule?.timeZone||'UTC');setReason('');setError('');setOpen(true);}}>{rule?'Change future cutoff':'Set weekly cutoff'}</button>}<Dialog open={open} onOpenChange={value=>{if(!savingNow.current)setOpen(value);}}><DialogContent className="editor"><DialogHeader><DialogTitle>Future weekly submission cutoff</DialogTitle><DialogDescription>Applies when new weekly obligations are generated. Set individual cutoffs under Standing for existing obligations.</DialogDescription></DialogHeader><form onSubmit={save}><fieldset disabled={busy} style={{border:0,padding:0,margin:0,minWidth:0,display:'grid',gap:15}}><DeadlineFields date={org.weeklySchedule!.startDate} time={time} timeZone={zone} onChange={(t,z)=>{setTime(t);setZone(z);}}/><label className="field">Reason for the rule<textarea required minLength={5} maxLength={2000} rows={3} value={reason} onChange={e=>setReason(e.target.value)}/></label>{error&&<div role="alert"><p className="form-error">{error}</p>{error.includes("session has expired")&&<a className="text-button" href="/auth" target="_blank" rel="noreferrer">Sign in in another tab</a>}</div>}<div className="form-actions"><button type="button" className="secondary" disabled={busy} onClick={()=>setOpen(false)}>Cancel</button><button className="primary" disabled={busy}>{busy?'Saving…':'Save future cutoff'}</button></div></fieldset></form></DialogContent></Dialog></div>;
}
