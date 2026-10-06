'use client';
import {useState} from 'react';
import {Check,RefreshCw,ShieldCheck,TriangleAlert} from 'lucide-react';

type TableResult={match:boolean;d1Count:number;supabaseCount:number;missingInSupabase:string[];extraInSupabase:string[];changed:string[]};
type ReconciliationResult={configured?:boolean;backend?:string;message?:string;match?:boolean;d1?:{counts:Record<string,number>;digest:string};supabase?:{counts:Record<string,number>;digest:string};tables?:Record<string,TableResult>;error?:string};

const tableLabels:Record<string,string>={installation:'Installation',organizations:'Organizations',entries:'Records',notification_reads:'Notification reads'};

export default function StorageReconciliation(){
 const [result,setResult]=useState<ReconciliationResult|null>(null);
 const [busy,setBusy]=useState(false);
 const run=async()=>{
  setBusy(true);
  try{
   const response=await fetch('/api/storage/reconcile',{cache:'no-store'});
   const body=await response.json().catch(()=>({error:'The reconciliation response could not be read.'})) as ReconciliationResult;
   setResult(response.ok||response.status===409?body:{...body,error:body.error||`Read-only check returned ${response.status}.`});
  }catch{setResult({error:'The read-only check is unavailable. Please retry.'});}
  finally{setBusy(false);}
 };
 const staged=result?.configured===false||(!result&&!busy);
 const matched=result?.configured===true&&result.match===true;
 const mismatch=result?.configured===true&&result.match===false;
 return <section className="panel account" aria-labelledby="storage-reconciliation-title">
  <div className="panel-header"><span className="badge neutral"><ShieldCheck size={14}/> Owner-only</span><span className="muted">Read-only boundary</span></div>
  <h2 id="storage-reconciliation-title">Storage reconciliation</h2>
  <p>Compare the live D1 snapshot with the staged PostgreSQL snapshot before any future storage cutover. This check never writes data or moves funds.</p>
  <div className="reconciliation-status" role="status">
   {matched?<><Check size={18}/><div><strong>Snapshots match</strong><small>D1 and PostgreSQL have the same normalized records.</small></div></>:mismatch?<><TriangleAlert size={18}/><div><strong>Review differences before cutover</strong><small>Counts and table status are shown below; payloads stay private.</small></div></>:result?.error?<><TriangleAlert size={18}/><div><strong>Check unavailable</strong><small>{result.error}</small></div></>:<><ShieldCheck size={18}/><div><strong>{staged?'D1 remains authoritative':'Ready for a read-only check'}</strong><small>{staged?(result?.message||'The PostgreSQL boundary is staged; run this again after it is enabled.'):'No storage comparison has been run yet.'}</small></div></>}
  </div>
  <button className="secondary" type="button" onClick={run} disabled={busy}>{busy?<><RefreshCw size={15} className="spin"/>Running read-only check…</>:<><RefreshCw size={15}/>Run read-only check</>}</button>
  {result?.configured===true&&result.d1&&result.supabase&&<>
   <div className="reconciliation-summary"><div><span>D1 records</span><strong>{Object.values(result.d1.counts).reduce((sum,n)=>sum+n,0)}</strong></div><div><span>PostgreSQL records</span><strong>{Object.values(result.supabase.counts).reduce((sum,n)=>sum+n,0)}</strong></div><div><span>Digest</span><strong>{result.match?'Match':'Different'}</strong></div></div>
   <div className="table-wrap"><table><thead><tr><th scope="col">Table</th><th scope="col">D1</th><th scope="col">PostgreSQL</th><th scope="col">Status</th></tr></thead><tbody>{Object.entries(result.tables||{}).map(([name,table])=><tr key={name}><td>{tableLabels[name]||name}</td><td>{table.d1Count}</td><td>{table.supabaseCount}</td><td><span className={'badge '+(table.match?'green':'pending')}>{table.match?'Match':`${table.missingInSupabase.length+table.extraInSupabase.length+table.changed.length} difference${table.missingInSupabase.length+table.extraInSupabase.length+table.changed.length===1?'':'s'}`}</span></td></tr>)}</tbody></table></div>
   <p className="form-note">SHA-256 digests: D1 <code>{result.d1.digest.slice(0,12)}…</code> · PostgreSQL <code>{result.supabase.digest.slice(0,12)}…</code>. Full payloads are not displayed.</p>
  </>}
 </section>;
}
