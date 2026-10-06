'use client';
import {useRef,useState} from 'react';
import type {Entry} from '@/lib/model';
import {uploadReceipt} from '@/lib/receipt-upload';
import {receiptUrl} from '@/lib/receipt-url';
export default function ReceiptAttachment({entry,onSaved,onBusy,initialFile=null,initialError=''}:{initialFile?:File|null;initialError?:string;entry:Entry;onSaved?:(e:Entry)=>void;onBusy?:(busy:boolean)=>void}){
 const [file,setFile]=useState<File|null>(initialFile),[busy,setBusy]=useState(false),[error,setError]=useState(initialError);const latch=useRef(false);
 async function upload(){if(!file||latch.current)return;latch.current=true;setBusy(true);onBusy?.(true);setError('');try{const updated=await uploadReceipt(entry,file);setFile(null);onSaved?.(updated);}catch(e){setError((e as Error).message);}finally{latch.current=false;setBusy(false);onBusy?.(false);}}
 return <section className="receipt-attachment"><h3>Private payment screenshot</h3><p>A screenshot supports the report. A reviewer must still check the deposit in Mola’s receiving account.</p>{entry.canViewReceipt?<a className="secondary" href={receiptUrl(entry.orgId,entry.id)} target="_blank" rel="noreferrer">View attached screenshot</a>:entry.hasReceipt?<p>Attachment visible only to the contributor, owner and designated reviewers.</p>:<p>No screenshot attached.</p>}{entry.canUploadReceipt&&onSaved&&<><label className="field">Optional screenshot · PNG or JPEG, up to 3 MB<input type="file" accept="image/png,image/jpeg" disabled={busy} onChange={e=>{setFile(e.target.files?.[0]||null);setError('');}}/></label><p>Crop out balances, full account numbers and unrelated transactions before uploading. One attachment per report; it cannot be replaced after upload.</p>{file&&<p>Selected: {file.name}</p>}<button type="button" className="secondary" disabled={!file||busy} onClick={upload}>{busy?'Uploading…':'Attach screenshot'}</button></>}{error&&<p className="form-error" role="alert">{error}</p>}</section>;
}
