'use client';
import {type Org,type Entry,money} from '@/lib/model';
import {memberStatement} from '@/lib/statements';
import {DeadlineTime} from './record-time';

export default function MemberOverview({org,entries,disabled,onStatement,onOpen,onSetup,onReportDue}:{org:Org;entries:Entry[];disabled:boolean;onStatement:()=>void;onOpen:(entry:Entry)=>void;onSetup:()=>void;onReportDue:(entry:Entry)=>void}){
 const memberId=org.permissions?.memberId;
 const member=org.members.find(m=>m.id===memberId);
 if(org.mode!=='Shared ownership')return null;
 if(!member)return org.permissions?.isOwner?<section className="panel member-overview"><div className="panel-header"><div><h2>My contributions & dues</h2><p className="muted">Link your founder account to see your personal contributions and remaining dues.</p></div><button type="button" className="secondary" disabled={disabled} onClick={()=>{if(!disabled)onSetup();}}>Link my founder account</button></div></section>:null;
 if(member.access?.enabled===false)return null;
 const statement=memberStatement(org,entries,member.id);
 const outstanding=statement.dues.filter(d=>d.remaining>0);
 const ignored=statement.dues.reduce((sum,d)=>sum+d.ignoredCreditCount,0);
 return <section className="panel member-overview" aria-labelledby="member-overview-title">
  <div className="panel-header"><div><h2 id="member-overview-title">My contributions & dues</h2><p className="muted">{member.name} · all recorded dates</p></div><div className="member-overview-actions"><button type="button" className="secondary" disabled={disabled} onClick={()=>{if(!disabled)onStatement();}}>My statement</button></div></div>
  {!statement.summaries.length?<div className="empty compact"><h3>Your record starts here</h3><p>No contributions or obligations have been recorded for you yet. Your remaining dues are not established.</p></div>:<div className="member-overview-currencies">{statement.summaries.map(s=><section className="member-overview-currency" key={s.currency} aria-label={`${s.currency} personal summary`}><h3>{s.currency}</h3><dl><div><dt>Verified contributions</dt><dd>{money(s.verified,s.currency)}</dd></div><div><dt>Awaiting verification</dt><dd>{money(s.pending,s.currency)}</dd></div><div><dt>Owner reconciled · provisional</dt><dd>{money(s.owner,s.currency)}</dd></div><div><dt>Remaining recorded dues</dt><dd>{s.dueCount?money(s.remaining,s.currency):'Not recorded'}</dd></div><div><dt>Overdue portion</dt><dd className={s.overdue>0?'overdue-amount':undefined}>{s.dueCount?money(s.overdue,s.currency):'Not recorded'}</dd></div></dl></section>)}</div>}
  {ignored>0&&<p className="form-error" role="alert">{ignored} credit assignment(s) need review and were excluded from your remaining-dues calculation.</p>}
  {outstanding.length>0?<div className="member-overview-dues"><h3>Next unpaid obligations</h3>{outstanding.slice(0,3).map(d=><div className="member-overview-due" key={d.entry.id}><div><strong>{d.entry.title}</strong><p>Due {d.entry.date} · {money(d.remaining,d.entry.currency)} {d.entry.currency} remaining</p><DeadlineTime entry={d.entry}/></div><span className={'badge '+(d.status==='Behind'?'danger':'pending')}>{d.status==='Behind'?'Overdue':d.status}</span><div className="member-due-actions"><button type="button" className="primary" disabled={disabled} onClick={()=>{if(!disabled)onReportDue(d.entry);}}>Record contribution</button><button type="button" className="secondary" disabled={disabled} onClick={()=>{if(!disabled)onOpen(d.entry);}}>View obligation</button></div></div>)}{outstanding.length>3&&<p className="muted">{outstanding.length-3} more unpaid obligations are listed in your statement.</p>}</div>:statement.dues.length>0&&<p className="member-overview-covered">Your recorded obligations are covered by assigned credits, including provisional owner credits. Future dues may still apply.</p>}
  <p className="member-overview-caption">Remaining dues include explicitly assigned verified and provisional owner credits. Pending payments and unassigned extra contributions do not reduce dues. These figures are not a bank balance or ownership valuation.</p>
 </section>;
}
