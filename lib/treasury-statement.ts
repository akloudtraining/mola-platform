import {type Org,type Entry,obligationStanding} from './model';
import {validDate} from './schedule';
import {csvCell} from './statements';
export function treasuryStatement(org:Org,entries:Entry[],from='',to='',asOf=new Date().toISOString()){
 if((from&&!validDate(from))||(to&&!validDate(to))||(from&&to&&from>to))throw new Error('Choose a valid date range; the end must be on or after the start.');
 const own=entries.filter(e=>e.orgId===org.id),inRange=(date:string)=>(!from||date>=from)&&(!to||date<=to);
 const contributions=own.filter(e=>e.type==='contribution'&&inRange(e.date)).sort((a,b)=>b.date.localeCompare(a.date)||b.created.localeCompare(a.created));
 const payouts=own.filter(e=>e.type==='request').flatMap(request=>(request.payouts||[]).filter(p=>inRange(p.date)).map(payout=>({request,payout}))).sort((a,b)=>b.payout.date.localeCompare(a.payout.date)||b.payout.recordedAt.localeCompare(a.payout.recordedAt));
 const dues=own.filter(e=>e.type==='obligation'&&inRange(e.date)).sort((a,b)=>a.date.localeCompare(b.date)).map(entry=>({entry,...obligationStanding(entry,own,asOf)}));
 const currencies=['USD','CAD','XAF'].filter(c=>contributions.some(e=>e.currency===c)||payouts.some(({payout:p})=>p.currency===c)||dues.some(d=>d.entry.currency===c));
 const summaries=currencies.map(currency=>{
  const payments=contributions.filter(e=>e.currency===currency),reports=payouts.filter(({payout:p})=>p.currency===currency&&!p.void),obligations=dues.filter(d=>d.entry.currency===currency);
  const sum=(status:string)=>payments.filter(e=>e.status===status).reduce((n,e)=>n+e.amountMinor,0);
  const principal=reports.reduce((n,{payout:p})=>n+p.amountMinor,0),fees=reports.reduce((n,{payout:p})=>n+p.feeMinor,0);
  return {currency,verified:sum('Verified'),pending:sum('Awaiting verification'),owner:sum('Owner reconciled'),rejected:sum('Rejected'),principal,fees,reportedSpending:principal+fees,recordedMovement:sum('Verified')-principal-fees,dueCount:obligations.length,due:obligations.reduce((n,d)=>n+d.entry.amountMinor,0),remaining:obligations.reduce((n,d)=>n+d.remaining,0),overdue:obligations.filter(d=>d.status==='Behind').reduce((n,d)=>n+d.remaining,0),ignoredCredits:obligations.reduce((n,d)=>n+d.ignoredCreditCount,0)};
 });
 return {from,to,asOf,contributions,payouts,dues,summaries};
}
export type TreasuryStatement=ReturnType<typeof treasuryStatement>;
const amount=(n:number,c:string)=>c==='XAF'?String(n):(n/100).toFixed(2);
export function treasuryCsv(org:Org,s:TreasuryStatement){
 const rows:unknown[][]=[['Group treasury statement'],['Organization',org.name],['Dates',s.from||'All earlier dates',s.to||'All later dates'],['Generated at (UTC)',s.asOf],['Basis','Current loaded statuses, not a historical closing balance. Contribution dates, reported external payment dates and obligation due dates are filtered inclusively. Current credits from any payment date reduce selected dues.'],['Limits','External payments are owner reports, not independent settlement confirmation. Voided reports are excluded from spending. Recorded movement excludes provisional/pending contributions, opening balances, unrecorded transfers and investment valuations; it is not bank cash or profit.'],[],['SUMMARY','Currency','Verified contributions','Pending contributions','Provisional owner contributions','Rejected contributions','Reported recipient payments','Reported fees','Reported spending','Recorded movement','Recorded dues','Remaining dues including provisional credit','Overdue dues','Ignored credit assignments']];
 for(const x of s.summaries)rows.push(['Totals',x.currency,...[x.verified,x.pending,x.owner,x.rejected,x.principal,x.fees,x.reportedSpending,x.recordedMovement,x.due,x.remaining,x.overdue].map(n=>amount(n,x.currency)),x.ignoredCredits]);
 rows.push([],['CONTRIBUTIONS','Payment date','Member','Label','Currency','Amount','Current status','Receipt reference','Record ID']);
 for(const e of s.contributions)rows.push(['Contribution',e.date,org.members.find(m=>m.id===e.memberId)?.name||'Member',e.title,e.currency,amount(e.amountMinor,e.currency),e.status,e.reference,e.id]);
 rows.push([],['EXTERNAL PAYMENT REPORTS','Payment date','Request at authorization','Request version','Recipient','Currency','Recipient amount','Fees','Total','Transfer reference','Method','Sent by (reported)','Recorded by','Recorded at (UTC)','Current report status','Evidence','Void reason','Voided by','Voided at (UTC)','Request ID','Report ID']);
 for(const {request,payout:p} of s.payouts)rows.push(['External payment',p.date,p.authorization.title,p.authorization.revision,p.authorization.recipient,p.currency,amount(p.amountMinor,p.currency),amount(p.feeMinor,p.currency),amount(p.amountMinor+p.feeMinor,p.currency),p.reference,p.method,p.sentBy,p.recordedName,p.recordedAt,p.void?'Voided report':'Owner reported',p.evidence,p.void?.reason,p.void?.actorName,p.void?.at,request.id,p.id]);
 rows.push([],['OBLIGATIONS','Due date','Member','Label','Currency','Agreed amount','Assigned credit including owner','Remaining','Standing','Record ID']);
 for(const d of s.dues)rows.push(['Obligation',d.entry.date,org.members.find(m=>m.id===d.entry.memberId)?.name||'Member',d.entry.title,d.entry.currency,amount(d.entry.amountMinor,d.entry.currency),amount(d.credit,d.entry.currency),amount(d.remaining,d.entry.currency),d.status,d.entry.id]);
 return '\uFEFF'+rows.map(r=>r.map(csvCell).join(',')).join('\r\n');
}
