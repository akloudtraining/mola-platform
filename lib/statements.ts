import {type Org,type Entry,obligationStanding} from './model';
import {validDate} from './schedule';
import {obligationPastDue,submissionTiming} from './deadlines';
export function memberStatement(org:Org,entries:Entry[],memberId:string,from='',to='',today=new Date().toISOString()){
 const member=org.members.find(m=>m.id===memberId);if(!member)throw new Error('Choose a member.');
 if((from&&!validDate(from))||(to&&!validDate(to))||(from&&to&&from>to))throw new Error('Choose a valid date range; the end must be on or after the start.');
 const own=entries.filter(e=>e.orgId===org.id&&e.memberId===memberId);
 const inRange=(e:Entry)=>(!from||e.date>=from)&&(!to||e.date<=to);
 const payments=own.filter(e=>e.type==='contribution'&&inRange(e)).sort((a,b)=>b.date.localeCompare(a.date)||b.created.localeCompare(a.created));
 const dues=own.filter(e=>e.type==='obligation'&&inRange(e)).sort((a,b)=>a.date.localeCompare(b.date)).map(entry=>({entry,...obligationStanding(entry,own.filter(e=>e.currency===entry.currency),today)}));
 const unallocated=(e:Entry)=>{const r=e.reviews?.at(-1);return Math.max(0,e.amountMinor-(r?.obligationId?r.creditMinor:0));};
 const currencies=['USD','CAD','XAF'].filter(c=>payments.some(e=>e.currency===c)||dues.some(d=>d.entry.currency===c));
 const summaries=currencies.map(currency=>{const ps=payments.filter(e=>e.currency===currency),ds=dues.filter(d=>d.entry.currency===currency);const sum=(status:string,unassigned=false)=>ps.filter(e=>e.status===status).reduce((n,e)=>n+(unassigned?unallocated(e):e.amountMinor),0);return {currency,verified:sum('Verified'),pending:sum('Awaiting verification'),owner:sum('Owner reconciled'),rejected:sum('Rejected'),verifiedUnallocated:sum('Verified',true),ownerUnallocated:sum('Owner reconciled',true),due:ds.reduce((n,d)=>n+d.entry.amountMinor,0),credited:ds.reduce((n,d)=>n+d.credit,0),remaining:ds.reduce((n,d)=>n+d.remaining,0),overdue:ds.filter(d=>obligationPastDue(d.entry,today)).reduce((n,d)=>n+d.remaining,0),excess:ds.reduce((n,d)=>n+d.excess,0),dueCount:ds.length};});
 const reviews=payments.flatMap(payment=>(payment.reviews||[]).map((review,index)=>({payment,review,index}))).sort((a,b)=>b.review.at.localeCompare(a.review.at));
 return {member,from,to,today,payments,dues,summaries,reviews};
}
export type MemberStatement=ReturnType<typeof memberStatement>;
const decimal=(minor:number,currency:string)=>currency==='XAF'?String(minor):(minor/100).toFixed(2);
export function csvCell(value:unknown){let text=String(value??'');if(/^[\s\u0000-\u001f]*[=+@-]/.test(text)||/^[\t\r\n]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';}
export function statementCsv(org:Org,statement:MemberStatement,generatedAt=new Date().toISOString()){
 const rows:unknown[][]=[['Mola member statement'],['Organization',org.name],['Member',statement.member.name],['Payment / due dates',statement.from||'All earlier dates',statement.to||'All later dates'],['Generated at (UTC)',generatedAt],['Overdue assessed at (UTC)',statement.today],['Timing basis','Submission timing compares the server recording timestamp to the cutoff captured at submission. It does not confirm when the bank received money. Legacy records without a cutoff have no inferred time.'],['Basis','Current loaded review status; not a historical closing balance. Selected dues include current credits from payments on any date. Owner-reconciled amounts are provisional. No ownership units or cash balance are implied.'],[],['SUMMARY','Currency','Verified payments','Pending payments','Owner-reconciled payments','Rejected payments','Verified unallocated','Owner unallocated','Recorded dues','Assigned credit including owner','Remaining dues','Overdue dues','Excess assigned credit']];
 for(const s of statement.summaries)rows.push(['Totals',s.currency,...[s.verified,s.pending,s.owner,s.rejected,s.verifiedUnallocated,s.ownerUnallocated,s.due,s.credited,s.remaining,s.overdue,s.excess].map(n=>decimal(n,s.currency))]);
 rows.push([],['PAYMENTS','Payment date','Label','Currency','Reported amount','Current status','Receipt reference','Recorded at (UTC)','Submission obligation ID','Captured cutoff (UTC)','Captured local cutoff','Deadline time zone','Submission timing','Record ID']);
 for(const e of statement.payments)rows.push(['Payment',e.date,e.title,e.currency,decimal(e.amountMinor,e.currency),e.status,e.reference,e.created,e.submissionObligationId,e.submissionDeadline?.at,e.submissionDeadline?.localDateTime,e.submissionDeadline?.timeZone,submissionTiming(e),e.id]);
 rows.push([],['OBLIGATIONS','Due date','Label','Currency','Agreed amount','Assigned credit including owner','Remaining','Excess assigned credit','Current standing','Recorded at (UTC)','Submission cutoff (UTC)','Local cutoff','Deadline time zone','Record ID']);
 for(const d of statement.dues)rows.push(['Obligation',d.entry.date,d.entry.title,d.entry.currency,...[d.entry.amountMinor,d.credit,d.remaining,d.excess].map(n=>decimal(n,d.entry.currency)),d.status,d.entry.created,d.entry.deadline?.at,d.entry.deadline?.localDateTime,d.entry.deadline?.timeZone,d.entry.id]);
 rows.push([],['REVIEW HISTORY','Review timestamp (UTC)','Payment label','Outcome','Reviewer','Credit currency','Credit in this review','Obligation ID','Evidence / correction reason','Payment ID'],['History basis','All reviews of selected payments, including reviews made after the selected payment-date range. Earlier credits are historical and must not be summed.']);
 for(const {payment,review} of statement.reviews)rows.push(['Review',review.at,payment.title,review.outcome,review.actorName||'Workspace owner',payment.currency,decimal(review.creditMinor,payment.currency),review.obligationId,review.evidence,payment.id]);
 return '\uFEFF'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n');
}
