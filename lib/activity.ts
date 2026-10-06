import {type Org,type Entry,obligationStanding,money} from './model';
import {obligationPastDue,deadlineLabel,type Deadline} from './deadlines';
export type ActivityEvent={id:string;orgId:string;entryId:string;memberId:string;kind:'submission'|'review'|'overdue'|'payout'|'payout-correction'|'instructions';targetView?:'contributions';title:string;description:string;at:string;status:string;read?:boolean;deadline?:Deadline};
export function activityFor(org:Org,entries:Entry[],today=new Date().toISOString()):ActivityEvent[]{
const own=entries.filter(e=>e.orgId===org.id),events:ActivityEvent[]=[];
for(const e of own){const name=org.members.find(m=>m.id===e.memberId)?.name||'Member';const amount=money(e.amountMinor,e.currency)+' '+e.currency;
if(e.type==='contribution'){
events.push({id:e.id+':submitted',orgId:org.id,entryId:e.id,memberId:e.memberId,kind:'submission',title:`${name} · contribution recorded`,description:`${amount} reported for ${e.date}. Receipt was not confirmed at submission.`,at:e.created,status:'Submitted'});
(e.reviews||[]).forEach((r,i)=>events.push({id:e.id+':review:'+i,orgId:org.id,entryId:e.id,memberId:e.memberId,kind:'review',title:`${name} · ${r.outcome==='Verified'?'payment verified':r.outcome==='Owner reconciled'?'owner reconciliation':r.outcome==='Rejected'?'payment rejected':'returned to pending review'}`,description:`${amount} · ${r.actorName||'Workspace owner'} recorded this review.${i?' Previous review retained in history.':''}${r.outcome==='Owner reconciled'?' This is not independent verification.':''}`,at:r.at,status:r.outcome}));
}
if(e.type==='request')for(const p of e.payouts||[]){
 events.push({id:e.id+':payout:'+p.id,orgId:org.id,entryId:e.id,memberId:e.memberId,kind:'payout',title:`${p.recordedName} · external payment reported`,description:`${money(p.amountMinor,p.currency)} ${p.currency} to ${p.authorization.recipient}; fees ${money(p.feeMinor,p.currency)} ${p.currency}. Sent by ${p.sentBy} (reported). Request: ${p.authorization.title}. This is an owner report, not independent settlement confirmation.`,at:p.recordedAt,status:'Payment reported'});
 if(p.void)events.push({id:e.id+':payout-void:'+p.id,orgId:org.id,entryId:e.id,memberId:e.memberId,kind:'payout-correction',title:`${p.void.actorName} · payment report voided`,description:`Report ${p.reference} for ${money(p.amountMinor+p.feeMinor,p.currency)} ${p.currency} was excluded from reported spending. Reason: ${p.void.reason}. This does not reverse a bank payment.`,at:p.void.at,status:'Report voided'});
}
if(e.type==='obligation'&&obligationPastDue(e,today)){const standing=obligationStanding(e,own,today);if(standing.remaining>0)events.push({id:e.id+':overdue:'+standing.remaining,orgId:org.id,entryId:e.id,memberId:e.memberId,kind:'overdue',title:`${name} · overdue obligation`,description:`${money(standing.remaining,e.currency)} ${e.currency} remains on the obligation due ${e.date}. ${e.deadline?'Submission cutoff: '+deadlineLabel(e.deadline)+'. ':''}Based on recorded credits, including provisional owner credits.`,at:e.deadline?.at||e.date+'T23:59:59.000Z',status:'Overdue',deadline:e.deadline});}
}
for(const h of org.collectionInstructions?.history||[])events.push({id:org.id+':instructions:'+h.version,orgId:org.id,entryId:'',memberId:'',kind:'instructions',targetView:'contributions',title:`${h.actorName} · contribution instructions updated`,description:`${h.text?'New contribution instructions were recorded.':'Contribution instructions were cleared.'} Reason: ${h.reason}. Check the current instructions with the group before sending money.`,at:h.at,status:'Instructions updated'});
return events.sort((a,b)=>b.at.localeCompare(a.at)||a.id.localeCompare(b.id));
}
