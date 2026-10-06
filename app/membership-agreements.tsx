'use client';
import {useRef,useState,type FormEvent} from 'react';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Checkbox} from '@/components/ui/checkbox';
import {Table,TableHeader,TableHead,TableBody,TableRow,TableCell} from '@/components/ui/table';
import {saveWorkspaceRecord} from '@/lib/workspace-save';
import {acceptanceConsent,currentAgreement} from '@/lib/agreements';
import type {Entry,Org} from '@/lib/model';
import {RecordTime} from './record-time';

type Draft={action:'publishAgreement'|'acceptAgreement';orgId:string;version:number;submissionId?:string;entryId?:string;digest?:string;title:string;body:string;decisionReference:string;typedName:string;acknowledged:boolean};
export default function MembershipAgreements({org,entries,editDraft,onSaved,onBusy,reload}:{org:Org;entries:Entry[];editDraft:()=>void;onSaved:(data:{entry:Entry;organization?:Org})=>void;onBusy:(busy:boolean)=>void;reload:()=>Promise<void>}){
 const [draft,setDraft]=useState<Draft|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const pending=useRef(false),current=currentAgreement(org,entries),owner=org.permissions?.canManage;
 const versions=entries.filter(e=>e.orgId===org.id&&e.type==='agreement'&&e.agreement).sort((a,b)=>b.agreement!.revision-a.agreement!.revision);
 const member=org.members.find(m=>m.id===org.permissions?.memberId);
 const startPublish=()=>{setError('');setMessage('');setDraft({action:'publishAgreement',orgId:org.id,version:org.version,submissionId:crypto.randomUUID(),title:'Membership agreement · '+org.name,body:org.agreement,decisionReference:'',typedName:'',acknowledged:false});};
 const startAcceptance=()=>{if(!current?.agreement?.canAccept)return;setError('');setMessage('');setDraft({action:'acceptAgreement',orgId:org.id,version:org.version,entryId:current.id,digest:current.agreement.digest,title:current.title,body:current.agreement.body,decisionReference:current.agreement.decisionReference,typedName:'',acknowledged:false});};
 const submit=async(e:FormEvent)=>{
  e.preventDefault();if(!draft||pending.current)return;pending.current=true;setBusy(true);onBusy(true);setError('');
  try{
   const data=await saveWorkspaceRecord(draft);
   if(data.entry?.type!=='agreement'||!data.entry.agreement?.digest)throw new Error('The save could not be confirmed. Keep this form open and check the agreement list before trying again.');
   onSaved(data);setDraft(null);setMessage(draft.action==='publishAgreement'?`Version ${data.entry.agreement.revision} published for member review.`:'Your acceptance was recorded for this exact agreement version.');
   try{await reload();}catch{setMessage(previous=>previous+' The save is confirmed, but the workspace could not refresh. Use Refresh to load the latest records.');}
  }catch(e){setError((e as Error).message);}finally{pending.current=false;setBusy(false);onBusy(false);}
 };
 return <>
  <section className="panel agreement-panel"><div className="panel-header"><h2>Membership agreement</h2><span className="badge neutral">{current?'Version '+current.agreement!.revision:'No published version'}</span></div>
   <div className="agreement-body">
    {message&&<p className="agreement-confirmation" role="status">{message}</p>}
    {current?<><h3>{current.title}</h3><p className="muted">Published <RecordTime at={current.agreement!.publishedAt}/> · {current.agreement!.decisionReference}</p><div className="agreement-document">{current.agreement!.body}</div>
     <p className="agreement-state">{current.agreement!.acceptances.length} of {org.members.length} founders have recorded acceptance.</p>
     {current.agreement!.acceptedByMe?<p className="agreement-confirmation">You accepted this version. Your original name and acceptance date remain in its record.</p>:current.agreement!.canAccept?<button className="primary" type="button" onClick={startAcceptance}>Review and accept this version</button>:<p className="form-note">{!member?'Link your own enabled founder account to record acceptance. The owner cannot accept for another founder.':'An acceptance is already recorded for this founder; its history is preserved.'}</p>}
     <div className="table-wrap"><Table><TableHeader><TableRow><TableHead>Founder</TableHead><TableHead>Acceptance</TableHead><TableHead>Recorded at</TableHead></TableRow></TableHeader><TableBody>{org.members.map(m=>{const a=current.agreement!.acceptances.find(a=>a.memberId===m.id);return <TableRow key={m.id}><TableCell><strong>{m.name}</strong>{a&&a.memberName!==m.name&&<small>Accepted as {a.memberName}</small>}</TableCell><TableCell>{a?'Accepted':'Awaiting acceptance'}</TableCell><TableCell>{a?<RecordTime at={a.at}/>: '—'}</TableCell></TableRow>;})}</TableBody></Table></div>
    </>:<p>No agreement version has been published. Prepare the working draft and record the group’s decision reference before requesting member acceptance.</p>}
    <p className="form-note">Acceptance records this member’s stated agreement to the displayed version. It does not enforce penalties, issue ownership units, or activate payments.</p>
   </div>
  </section>
  {owner&&<section className="panel agreement-panel"><div className="panel-header"><h2>Working draft</h2><span className="badge neutral">Unpublished</span></div><div className="agreement-body"><p>Draft edits do not change published versions or existing acceptance records. Publishing a replacement requests fresh acceptance.</p>{org.agreement?<details><summary>Read the saved draft</summary><div className="agreement-document">{org.agreement}</div></details>:<p className="muted">No working draft is saved.</p>}<div className="agreement-actions"><button className="secondary" type="button" onClick={editDraft}>Edit working draft</button><button className="primary" type="button" disabled={org.agreement.trim().length<10} onClick={startPublish}>Publish for member acceptance</button></div></div></section>}
  {!!versions.length&&<section className="panel agreement-panel"><div className="panel-header"><h2>Version history</h2><span className="badge neutral">{versions.length} {versions.length===1?'version':'versions'}</span></div><div className="agreement-body">{versions.map(entry=><details className="agreement-version" key={entry.id}><summary>Version {entry.agreement!.revision} · {entry.title} · {entry.id===org.activeAgreementId?'Current':'Previous'}</summary><p>Published <RecordTime at={entry.agreement!.publishedAt}/> · {entry.agreement!.decisionReference}</p><div className="agreement-document">{entry.agreement!.body}</div><ul className="agreement-receipts">{entry.agreement!.acceptances.map(a=><li key={a.memberId}><strong>{a.memberName}</strong> · <RecordTime at={a.at}/><p>Entered name: {a.typedName}</p><p>{a.consent}</p></li>)}</ul>{!entry.agreement!.acceptances.length&&<p className="muted">No acceptance recorded for this version.</p>}<details className="agreement-proof"><summary>Content reference</summary><code>{entry.agreement!.digest}</code><p>This reference identifies the exact title, text and group decision reference accepted.</p></details></details>)}</div></section>}
  <Dialog open={!!draft} onOpenChange={open=>{if(!open&&!pending.current)setDraft(null);}}><DialogContent className="editor agreement-editor"><DialogHeader><DialogTitle>{draft?.action==='publishAgreement'?'Publish an agreement version':'Accept this agreement version'}</DialogTitle><DialogDescription>{draft?.action==='publishAgreement'?'Review the exact saved text and its group decision reference. Publication preserves this version.':'Your acceptance belongs only to the text below and your linked founder account.'}</DialogDescription></DialogHeader>{draft&&<form onSubmit={submit}><fieldset disabled={busy} className="agreement-fields">
   {draft.action==='publishAgreement'?<><label className="field">Version title<input required maxLength={180} value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})}/></label><label className="field">Group decision / meeting reference<input required minLength={5} maxLength={500} value={draft.decisionReference} onChange={e=>setDraft({...draft,decisionReference:e.target.value})} placeholder="Meeting date or agreed decision reference"/></label></>:<><h3>{draft.title}</h3><p className="muted">{draft.decisionReference}</p></>}
   <div className="agreement-document" tabIndex={0} aria-label="Exact agreement text">{draft.body}</div>
   {draft.action==='acceptAgreement'&&<label className="field">Your member name<input required maxLength={100} autoComplete="name" value={draft.typedName} onChange={e=>setDraft({...draft,typedName:e.target.value})} placeholder={member?.name||'Your name'}/></label>}
   <label className="check-field"><Checkbox checked={draft.acknowledged} onCheckedChange={value=>setDraft({...draft,acknowledged:value===true})}/>{draft.action==='publishAgreement'?'I confirm this is the version agreed by the group for member review.':acceptanceConsent}</label>
   {error&&<div className="save-error" role="alert"><p>{error}</p>{/session has expired/i.test(error)&&<a href="/auth" target="_blank" rel="noreferrer">Sign in in another tab</a>}</div>}
   <div className="editor-footer"><button className="secondary" type="button" disabled={busy} onClick={()=>setDraft(null)}>Cancel</button><button className="primary" type="submit" disabled={busy||!draft.acknowledged}>{busy?'Saving…':draft.action==='publishAgreement'?'Publish version':'Record my acceptance'}</button></div>
  </fieldset></form>}</DialogContent></Dialog>
 </>;
}
