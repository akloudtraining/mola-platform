import {type Org,type Entry,obligationStanding,money} from './model';
import {obligationPastDue,deadlineLabel,type Deadline} from './deadlines';
export type ActivityEvent={id:string;orgId:string;entryId:string;memberId:string;kind:'submission'|'correction'|'review'|'overdue'|'payout'|'payout-correction'|'instructions';targetView?:'contributions';title:string;description:string;at:string;status:string;read?:boolean;deadline?:Deadline};
export function activityFor(org:Org,entries:Entry[],today=new Date().toISOString()):ActivityEvent[]{
const own=entries.filter(e=>e.orgId===org.id),events:ActivityEvent[]=[];
for(const e of own){const name=org.members.find(m=>m.id===e.memberId)?.name||'Member';const amount=money(e.amountMinor,e.currency)+' '+e.currency;
if(e.type==='contribution'&&e.status!=='Screenshot required'){
events.push({id:e.id+':submitted',orgId:org.id,entryId:e.id,memberId:e.memberId,kind:'submission',title:`${name} · contribution recorded`,description:`${amount} reported for ${e.date}. ${e.receipt?'Private screenshot attached; receiving-account confirmation is still required.':'Legacy record has no screenshot attached.'}`,at:e.created,status:'Submitted'});
(e.corrections||[]).forEach((c,i)=>events.push({id:e.id+':correction:'+i,orgId:org.id,entryId:e.id,memberId:e.memberId,kind:'correction',title:`${name} · rejected payment corrected`,description:`${money(c.updated.amountMinor,c.updated.currency)} ${c.updated.currency} resubmitted for review. Correction: ${c.reason}. This is the same payment record, not a new contribution; the rejection and earlier values remain in history.`,at:c.at,status:'Resubmitted'}));
(e.reviews||[]).forEach((r,i)=>{
 const corrections=e.corrections||[];
 const correctionBefore=[...corrections].filter(c=>c.at<=r.at).sort((a,b)=>a.at.localeCompare(b.at)).at(-1);
 const correctionAfter=[...corrections].filter(c=>c.at>r.at).sort((a,b)=>a.at.localeCompare(b.at))[0];
 const reviewAmount=correctionAfter?.previous||e;
 const reviewedMoney=`${money(reviewAmount.amountMinor,reviewAmount.currency)} ${reviewAmount.currency}`;
 const rejectionBeforeCorrection=correctionBefore?[...(e.reviews||[])].filter(previous=>previous.outcome==='Rejected'&&previous.at<correctionBefore.at).sort((a,b)=>a.at.localeCompare(b.at)).at(-1):undefined;
 const correctedVerification=r.outcome==='Verified'&&!!correctionBefore;
 const title=r.outcome==='Verified'?(correctedVerification?'corrected payment verified':'payment verified'):r.outcome==='Owner reconciled'?'owner reconciliation':r.outcome==='Rejected'?'payment rejected':'returned to pending review';
 const description=r.outcome==='Rejected'
  ?`${reviewedMoney} · ${r.actorName||'Workspace owner'} rejected this payment. Reason: ${r.evidence||'No rejection reason recorded.'} The contributor may correct and resubmit this same record.`
  :correctedVerification
   ?`${reviewedMoney} · ${r.actorName||'Workspace owner'} verified the corrected submission.${rejectionBeforeCorrection?.evidence?` It was previously rejected because: ${rejectionBeforeCorrection.evidence}.`:''} This completes the same payment record; no new contribution was created.`
   :`${reviewedMoney} · ${r.actorName||'Workspace owner'} recorded this review.${i?' Previous review retained in history.':''}${r.outcome==='Owner reconciled'?' This is not independent verification.':''}`;
 events.push({id:e.id+':review:'+i,orgId:org.id,entryId:e.id,memberId:e.memberId,kind:'review',title:`${name} · ${title}`,description,at:r.at,status:r.outcome});
});
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
