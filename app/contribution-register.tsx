'use client';
import {useState,type ReactNode} from 'react';
import {Search} from 'lucide-react';
import {Select,SelectTrigger,SelectValue,SelectContent,SelectItem} from '@/components/ui/select';
import {Org,Entry,money} from '@/lib/model';
const statuses=['Awaiting verification','Verified','Owner reconciled','Rejected'];
const initial={search:'',member:'all',status:'all',currency:'all',from:'',to:'',sort:'newest'};
export default function ContributionRegister({org,payments,renderTable}:{org:Org;payments:Entry[];renderTable:(entries:Entry[])=>ReactNode}){
 const [filters,setFilters]=useState(initial),[limit,setLimit]=useState(50);
 const change=(key:keyof typeof initial,value:string)=>{setFilters(prev=>({...prev,[key]:value}));setLimit(50);};
 const reset=()=>{setFilters(initial);setLimit(50);};
 const invalid=!!filters.from&&!!filters.to&&filters.from>filters.to;
 const needle=filters.search.trim().toLocaleLowerCase();
 const filtered=invalid?[]:payments.filter(e=>{
  const name=org.members.find(m=>m.id===e.memberId)?.name||'';
  return (filters.member==='all'||e.memberId===filters.member)&&(filters.status==='all'||e.status===filters.status)&&(filters.currency==='all'||e.currency===filters.currency)&&(!filters.from||e.date>=filters.from)&&(!filters.to||e.date<=filters.to)&&(!needle||[name,e.title,e.reference].some(v=>v.toLocaleLowerCase().includes(needle)));
 }).sort((a,b)=>filters.sort==='oldest'?a.date.localeCompare(b.date)||a.created.localeCompare(b.created):b.date.localeCompare(a.date)||b.created.localeCompare(a.created));
 const active=Object.keys(initial).some(k=>filters[k as keyof typeof initial]!==initial[k as keyof typeof initial]);
 const select=(key:keyof typeof initial,label:string,options:{value:string;label:string}[])=><label className="field">{label}<Select value={filters[key]} onValueChange={v=>change(key,v)}><SelectTrigger className="choice" aria-label={label}><SelectValue/></SelectTrigger><SelectContent>{options.map(o=><SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select></label>;
 return <section className="panel contribution-register"><div className="panel-header"><h2>Contribution register</h2><span className="badge neutral">{payments.length} records</span></div>
 {!payments.length?<div className="empty"><h3>No payment records yet</h3><p>Start with an external Zelle or bank-transfer payment.</p></div>:<>
 <div className="register-controls"><label className="field register-search">Find a payment<div><Search size={18} aria-hidden="true"/><input type="search" value={filters.search} onChange={e=>change('search',e.target.value)} placeholder="Member, contribution or reference"/></div></label>
 {select('member','Member',[{value:'all',label:'All members'},...org.members.map(m=>({value:m.id,label:m.name}))])}
 {select('status','Payment status',[{value:'all',label:'All statuses'},...statuses.map(s=>({value:s,label:s}))])}
 {select('currency','Currency',[{value:'all',label:'All currencies'},...['USD','CAD','XAF'].map(s=>({value:s,label:s}))])}
 <label className="field">Payment date from<input type="date" value={filters.from} onChange={e=>change('from',e.target.value)}/></label><label className="field">Payment date to<input type="date" value={filters.to} onChange={e=>change('to',e.target.value)}/></label>
 {select('sort','Order',[{value:'newest',label:'Newest payment first'},{value:'oldest',label:'Oldest payment first'}])}
 <button className="secondary" disabled={!active} onClick={reset}>Reset filters</button></div>
 {invalid&&<p className="form-error register-error" role="alert">The end date must be on or after the start date.</p>}
 <div className="register-summary" aria-label="Totals for matching payment records">{statuses.slice(0,3).map(status=>{const rows=filtered.filter(e=>e.status===status);return <div key={status}><span className={'badge '+(status==='Verified'?'green':status==='Awaiting verification'?'pending':'neutral')}>{status}</span><p>{rows.length} {rows.length===1?'record':'records'}</p>{['USD','CAD','XAF'].filter(c=>rows.some(e=>e.currency===c)).map(c=><strong key={c}>{money(rows.filter(e=>e.currency===c).reduce((sum,e)=>sum+e.amountMinor,0),c)} <small>{c}</small></strong>)}{!rows.length&&<strong className="muted">No matching records</strong>}</div>;})}</div>
 <details className="register-caption"><summary>How these totals are calculated</summary><p>Totals cover all matching records, including rows beyond those shown below. Currencies stay separate. These are reported payment amounts, not available cash or remaining dues. Rejected records are excluded from these three totals.</p></details>
 <div className="register-result" aria-live="polite"><strong>{filtered.length} of {payments.length} records match</strong>{filtered.length>limit&&<span>Showing the first {limit}</span>}</div>
 {filtered.length?renderTable(filtered.slice(0,limit)):!invalid&&<div className="empty compact"><Search size={25}/><h3>No matching payments</h3><p>Try a different member, date range, status or reference.</p><button className="secondary" onClick={reset}>Clear filters</button></div>}
 {filtered.length>limit&&<div className="register-more"><button className="secondary" onClick={()=>setLimit(n=>n+50)}>Show more ({filtered.length-limit} remaining)</button></div>}
 </>}
 </section>;
}
