'use client';
import {Org,Entry,money,obligationStanding} from '@/lib/model';
import ObligationDeadline from './obligation-deadline';
import {RecordTime} from './record-time';
import MemberAvatar from './member-avatar';
import {Table,TableHeader,TableHead,TableBody,TableRow,TableCell} from '@/components/ui/table';
const CURRENCIES=['USD','CAD','XAF'];
const dueLabel=(date:string)=>new Date(date+'T12:00:00Z').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',year:date.slice(0,4)===String(new Date().getFullYear())?undefined:'numeric',timeZone:'UTC'});
const sumBy=(rows:Entry[],c:string)=>rows.filter(e=>e.currency===c).reduce((s,e)=>s+e.amountMinor,0);
const amounts=(rows:Entry[])=>CURRENCIES.map(c=>sumBy(rows,c)?`${money(sumBy(rows,c),c)} ${c}`:'').filter(Boolean).join(' · ');

// One row per founder: who they are, what has been paid and reviewed, what they still owe, and whether anything is overdue.
export function FounderRoster({org,entries}:{org:Org;entries:Entry[]}){
 const dues=entries.filter(e=>e.type==='obligation'),payments=entries.filter(e=>e.type==='contribution');
 return <section className="panel founder-roster"><div className="panel-header"><h2>{org.members.length} founders</h2></div><div className="table-wrap"><Table><TableHeader><TableRow><TableHead>Founder</TableHead><TableHead>Paid</TableHead><TableHead>Still owed</TableHead><TableHead>Standing</TableHead></TableRow></TableHeader><TableBody>{org.members.map(m=>{
  const mine=payments.filter(e=>e.memberId===m.id),verified=mine.filter(e=>e.status==='Verified'),owner=mine.filter(e=>e.status==='Owner reconciled'),waiting=mine.filter(e=>['Awaiting verification','Screenshot required'].includes(e.status));
  const rows=dues.filter(e=>e.memberId===m.id),late=rows.filter(e=>obligationStanding(e,entries).status==='Behind').length;
  const owed=CURRENCIES.map(c=>{const n=rows.filter(e=>e.currency===c).reduce((s,e)=>s+obligationStanding(e,entries).remaining,0);return n?`${money(n,c)} ${c}`:'';}).filter(Boolean).join(' · ');
  return <TableRow key={m.id}><TableCell><div className="member-name"><MemberAvatar orgId={org.id} member={m}/><span><strong>{m.name}</strong><small>{[m.role,m.profile?.location].filter(Boolean).join(' · ')}</small>{m.profile?.bio&&<small className="member-bio">{m.profile.bio}</small>}</span></div></TableCell>
   <TableCell><span><strong>{amounts(verified)||'None verified'}</strong>{owner.length>0&&<small>Owner reconciled: {amounts(owner)}</small>}{waiting.length>0&&<small>Awaiting review: {amounts(waiting)}</small>}</span></TableCell>
   <TableCell>{owed||'None'}</TableCell>
   <TableCell><span className={'badge '+(late?'danger':rows.length?'green':'neutral')}>{late?`${late} overdue`:!rows.length?'No dues yet':owed?'On track':'Paid up'}</span></TableCell></TableRow>;
 })}</TableBody></Table></div></section>;
}

// Every recorded due, grouped by due date so a weekly cycle reads as one line. Opens the earliest week that still has money owed.
export default function DuesLedger({org,entries,onAdd,reload,onBusy}:{org:Org;entries:Entry[];onAdd:()=>void;reload:()=>Promise<void>;onBusy?:(busy:boolean)=>void}){
 const dues=entries.filter(e=>e.type==='obligation'),currencies=CURRENCIES.filter(c=>dues.some(e=>e.currency===c));
 const invalidCredits=dues.reduce((total,due)=>total+obligationStanding(due,entries).ignoredCreditCount,0);
 const groups=[...dues].sort((a,b)=>a.date.localeCompare(b.date)||(org.members.findIndex(m=>m.id===a.memberId)-org.members.findIndex(m=>m.id===b.memberId))).reduce<{key:string;date:string;currency:string;rows:Entry[]}[]>((list,e)=>{const key=e.date+e.currency,last=list[list.length-1];if(last?.key===key)last.rows.push(e);else list.push({key,date:e.date,currency:e.currency,rows:[e]});return list;},[]);
 const firstOpen=groups.find(g=>g.rows.some(e=>obligationStanding(e,entries).remaining>0))?.key;
 return <section className="panel standing"><div className="panel-header"><div><h2>Dues & balances</h2><p className="muted">Extra payments don’t cover future dues automatically. Record a one-off amount only if it isn’t already part of the weekly schedule.</p></div>{org.permissions?.canManage&&<button className="secondary" onClick={onAdd}>Add obligation</button>}</div>
  {invalidCredits>0&&<div className="notice" role="alert"><p>{invalidCredits} credit assignment(s) need review and were excluded from balances. Check the member, currency, organization, amount and latest review before relying on these totals.</p></div>}
  {currencies.length>0&&<div className="standing-totals">{currencies.map(c=>{const rows=dues.filter(e=>e.currency===c);const sum=(key:'credit'|'remaining'|'excess')=>rows.reduce((s,e)=>s+obligationStanding(e,entries)[key],0);return <div key={c}><strong>{c} · all recorded dues</strong><p>Due: {money(rows.reduce((s,e)=>s+e.amountMinor,0),c)}</p><p>Credited: {money(sum('credit'),c)}</p><p>Remaining: {money(sum('remaining'),c)}</p>{sum('excess')>0&&<p>Excess assigned credit: {money(sum('excess'),c)}</p>}</div>;})}</div>}
  {groups.length?<div className="dues-weeks">{groups.map(g=>{const st=g.rows.map(e=>obligationStanding(e,entries)),behind=st.filter(s=>s.status==='Behind').length,covered=st.filter(s=>s.status==='Covered').length,remaining=st.reduce((s,x)=>s+x.remaining,0);
   return <details key={g.key} className="dues-week" open={g.key===firstOpen}><summary><span><strong>Due {dueLabel(g.date)}</strong><small>{g.rows.length} {g.rows.length===1?'founder':'founders'} · {money(g.rows.reduce((s,e)=>s+e.amountMinor,0),g.currency)} {g.currency} due · {money(remaining,g.currency)} remaining</small></span><span className={'badge '+(behind?'danger':covered===g.rows.length?'green':'pending')}>{behind?`${behind} overdue`:covered===g.rows.length?'Covered':`${covered} of ${g.rows.length} paid`}</span></summary>
    <div className="table-wrap"><Table><TableHeader><TableRow><TableHead>Founder</TableHead><TableHead>Submission cutoff</TableHead><TableHead>Amount</TableHead><TableHead>Credit / remaining</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{g.rows.map((e,i)=>{const s=st[i];return <TableRow key={e.id}><TableCell><strong>{org.members.find(m=>m.id===e.memberId)?.name}</strong><small>{e.title}{e.reference?' · '+e.reference:''}</small><small>Recorded <RecordTime at={e.created}/></small></TableCell><TableCell><div className="dues-cutoff"><ObligationDeadline org={org} entry={e} reload={reload} onBusy={onBusy}/></div></TableCell><TableCell>{money(e.amountMinor,e.currency)} {e.currency}</TableCell><TableCell className={s.status==='Behind'?'overdue-amount':undefined}>{money(s.credit,e.currency)} / {money(s.remaining,e.currency)}{s.excess>0&&<small>Excess credit {money(s.excess,e.currency)}</small>}</TableCell><TableCell><span className={'badge '+(s.status==='Covered'?'green':s.status==='Behind'?'danger':'pending')}>{s.status}</span></TableCell></TableRow>;})}</TableBody></Table></div>
   </details>;})}</div>:<div className="empty compact"><h3>No dues recorded</h3><p>Create weekly dues above, or add a one-off amount and due date for a founder.</p></div>}
 </section>;
}
