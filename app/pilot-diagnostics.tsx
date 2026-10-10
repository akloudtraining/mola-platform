'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {RefreshCw} from 'lucide-react';
import {workspaceFetch} from '@/lib/workspace-fetch';
import type {PilotCheck,PilotDiagnostics as Report} from '@/lib/pilot-diagnostics';

function reportMatches(value:unknown,organizationId:string):value is Report{
 if(!value||typeof value!=='object')return false;
 const data=value as Partial<Report>;
 const check=(row:PilotCheck)=>!!row&&typeof row.id==='string'&&typeof row.title==='string'&&typeof row.detail==='string'&&['pass','fail','unverified'].includes(row.status);
 return data.organizationId===organizationId&&Number.isInteger(data.organizationVersion)&&typeof data.checkedAt==='string'&&Number.isFinite(Date.parse(data.checkedAt))
  &&Array.isArray(data.setup)&&data.setup.every(row=>!!row&&typeof row.id==='string'&&typeof row.title==='string'&&typeof row.detail==='string'&&typeof row.view==='string'&&typeof row.recorded==='boolean')
  &&Array.isArray(data.provider)&&data.provider.every(check)&&Array.isArray(data.acceptance)&&data.acceptance.every(check)
  &&typeof data.callbacks?.confirmation==='string'&&typeof data.callbacks?.recovery==='string';
}

export default function PilotDiagnostics({organizationId,organizationVersion,onOpen}:{organizationId:string;organizationVersion:number;onOpen:(view:string)=>void}){
 const [report,setReport]=useState<Report|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const sequence=useRef(0),pending=useRef(false),controller=useRef<AbortController|null>(null);
 const run=useCallback(async()=>{
  if(pending.current)return;pending.current=true;const id=++sequence.current;const request=new AbortController();controller.current=request;
  setBusy(true);setError('');setReport(null);
  try{
   const response=await workspaceFetch('/api/pilot/readiness?orgId='+encodeURIComponent(organizationId),{credentials:'same-origin',cache:'no-store',signal:request.signal});
   const data:unknown=await response.json();if(id!==sequence.current)return;
   if(!response.ok)throw new Error(data&&typeof data==='object'&&'error' in data&&typeof data.error==='string'?data.error:'The pilot checks could not complete.');
   if(!reportMatches(data,organizationId))throw new Error('The pilot check response could not be confirmed. Try again.');
   setReport(data);
  }catch(e){if(id===sequence.current&&!request.signal.aborted)setError((e as Error).message||'The pilot checks could not complete.');}
  finally{if(id===sequence.current){pending.current=false;setBusy(false);controller.current=null;}}
 },[organizationId,organizationVersion]);
 useEffect(()=>{void run();return()=>{sequence.current++;controller.current?.abort();controller.current=null;pending.current=false;};},[run]);
 const checks=(rows:PilotCheck[])=>rows.map(row=><div className="pilot-check" key={row.id}><div><strong>{row.title}</strong><span className={'badge '+(row.status==='pass'?'green':row.status==='fail'?'pending':'neutral')}>{row.status==='pass'?'Verified setting':row.status==='fail'?'Needs setup':'Needs acceptance'}</span></div><p>{row.detail}</p></div>);
 return <section className="panel pilot-diagnostics" aria-labelledby="pilot-onboarding-title"><div className="panel-header"><div><h2 id="pilot-onboarding-title">Workspace diagnostics</h2><p className="muted">Saved configuration checks and manually recorded acceptance evidence.</p></div><button type="button" className="secondary" disabled={busy} onClick={run}><RefreshCw size={16}/>{busy?'Checking…':'Check again'}</button></div>
  <div className="pilot-diagnostics-body">{busy&&<p role="status">Checking the saved setup and email service…</p>}{error&&<p className="form-error" role="alert">{error}</p>}{report&&<><p className="muted">Checked {new Date(report.checkedAt).toLocaleString()}. These checks do not certify bank ownership.</p><h3>Email settings</h3>{checks(report.provider)}<h3>Manual acceptance checklist</h3>{checks(report.acceptance)}<details><summary>Email return URLs</summary><p>Confirmation</p><code>{report.callbacks.confirmation}</code><p>Password recovery</p><code>{report.callbacks.recovery}</code></details><a className="text-button" href="https://mola-buildroom.bokobal.chatgpt.site" target="_blank" rel="noreferrer">Record acceptance in Buildroom</a></>}</div>
 </section>;
}
