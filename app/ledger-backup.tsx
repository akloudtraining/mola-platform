'use client';
import {useRef,useState} from 'react';
import {workspaceFetch} from '@/lib/workspace-fetch';

export default function LedgerBackup(){
 const busy=useRef(false);
 const [pending,setPending]=useState(false),[error,setError]=useState(''),[downloaded,setDownloaded]=useState(false);
 async function download(){
  if(busy.current)return;
  busy.current=true;setPending(true);setError('');setDownloaded(false);
  try{
   const response=await workspaceFetch('/api/workspace/export',{cache:'no-store',redirect:'error'});
   if(!response.ok){
    if(response.status===401)throw new Error('Your session has expired. Sign in again, then retry the download.');
    if(response.status===403)throw new Error('Only the account that owns this workspace can download the complete ledger.');
    throw new Error('The backup could not be prepared. Please try again.');
   }
   if(!response.headers.get('Content-Type')?.includes('application/json'))throw new Error('The server did not return a ledger backup. Please sign in again and retry.');
   const blob=await response.blob();
   const url=URL.createObjectURL(blob),link=document.createElement('a');
   link.href=url;link.download=`mola-ledger-${new Date().toISOString().slice(0,10)}.json`;
   document.body.appendChild(link);link.click();link.remove();
   setTimeout(()=>URL.revokeObjectURL(url),60000);setDownloaded(true);
  }catch(e){setError(e instanceof Error?e.message:'Download failed. Please try again.');}
  finally{busy.current=false;setPending(false);}
 }
 return <section className="panel account"><h2>Complete ledger backup</h2><p>Download records for every organization, including member access, review history, and private notification read state. Store this file somewhere private.</p><button className="secondary" disabled={pending} aria-busy={pending} onClick={download}>{pending?'Preparing backup…':'Download owner backup'}</button>{error&&<p role="alert">{error}</p>}{downloaded&&<p role="status">Backup download started. Check your browser’s downloads before closing this page.</p>}<p className="form-note">Downloading does not change records or move funds. Restoring a backup requires a separately reviewed migration.</p></section>;
}
