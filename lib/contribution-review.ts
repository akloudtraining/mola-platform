import {receiptConfirmation} from './bank-receipt';
import {obligationStanding,parseMoney,type Entry,type Org} from './model';
import {similarReceipts,type SimilarReceipt} from './similar-receipts';

export type ReviewDraft={reviewerName?:string;verificationNote?:string;bankReceiptEnabled?:boolean;bankReference?:string;bankConfirmed?:boolean;similarReceipts?:SimilarReceipt[];action:'review';orgId:string;entryId:string;reviewCount:number;outcome:string;independent:boolean;ownerReconcile:boolean;evidence:string;obligationId:string;credit:string;memberId:string;currency:string;reviewSnapshot:{payment:Entry;memberName:string;entries:Entry[]}};
export const creditOutcomes=['Verified','Owner reconciled'];
export const reviewOutcomes=(draft:Pick<ReviewDraft,'independent'|'ownerReconcile'>)=>[...(draft.independent?['Verified']:[]),...(draft.ownerReconcile?['Owner reconciled']:[]),'Rejected','Awaiting verification'];
const amountText=(n:number,currency:string)=>currency==='XAF'?String(n):`${Math.floor(n/100)}.${String(n%100).padStart(2,'0')}`;
const duesFor=(draft:ReviewDraft)=>draft.reviewSnapshot.entries.filter(e=>e.type==='obligation'&&e.orgId===draft.orgId&&e.memberId===draft.memberId&&e.currency===draft.currency);
export function suggestedReviewCredit(draft:ReviewDraft,id:string){
 const due=duesFor(draft).find(e=>e.id===id);if(!due)return '';
 const payment=draft.reviewSnapshot.payment,latest=payment.reviews?.at(-1);
 if(latest?.obligationId===id&&latest.outcome===payment.status&&creditOutcomes.includes(payment.status)&&Number.isSafeInteger(latest.creditMinor)&&latest.creditMinor>0&&latest.creditMinor<=payment.amountMinor)return amountText(latest.creditMinor,payment.currency);
 const withoutPayment=draft.reviewSnapshot.entries.filter(e=>e.id!==payment.id);
 const minor=Math.min(payment.amountMinor,obligationStanding(due,withoutPayment).remaining);
 return minor>0?amountText(minor,payment.currency):'';
}
export function createReviewDraft(org:Org,payment:Entry,entries:Entry[]):ReviewDraft{
 if(payment.type!=='contribution'||payment.orgId!==org.id||(!payment.canReview&&!payment.canOwnerReconcile))throw new Error('Open a contribution you are authorized to review.');
 const snapshot=structuredClone(entries.filter(e=>e.orgId===org.id&&e.memberId===payment.memberId&&e.currency===payment.currency&&['contribution','obligation'].includes(e.type)&&e.id!==payment.id));
 const captured=structuredClone(payment);snapshot.push(captured);
 const draft:ReviewDraft={reviewerName:org.members.find(m=>m.id===org.permissions?.memberId)?.name||'Workspace owner',verificationNote:payment.canReview?'You can independently verify this payment.':org.permissions?.memberId===payment.memberId?'You cannot independently verify your own contribution. Ask a different designated reviewer.':!org.permissions?.canReview?'This account is not a designated independent reviewer.'+(org.id.startsWith('test:')?' Switch to Casey to verify another member’s payment.':' Ask a designated reviewer to verify receipt.'):'You cannot verify a payment you submitted. Ask another designated reviewer.',bankReceiptEnabled:org.mode==='Shared ownership',similarReceipts:similarReceipts(org,entries,payment.reference||'',payment.id),action:'review',orgId:payment.orgId,entryId:payment.id,reviewCount:payment.reviews?.length||0,outcome:payment.canReview?'Verified':'Owner reconciled',independent:!!payment.canReview,ownerReconcile:!!payment.canOwnerReconcile,evidence:'',obligationId:'',credit:'',memberId:payment.memberId,currency:payment.currency,reviewSnapshot:{payment:captured,memberName:org.members.find(m=>m.id===payment.memberId)?.name||'Member',entries:snapshot}};
 const latest=payment.reviews?.at(-1);
 if(latest){
  if(reviewOutcomes(draft).includes(payment.status))draft.outcome=payment.status;
  const due=duesFor(draft).find(e=>e.id===latest.obligationId);
  if(due&&latest.outcome===payment.status&&creditOutcomes.includes(payment.status)&&Number.isSafeInteger(latest.creditMinor)&&latest.creditMinor>0&&latest.creditMinor<=payment.amountMinor){draft.obligationId=due.id;draft.credit=amountText(latest.creditMinor,payment.currency);}
 }else{
  const due=duesFor(draft).find(e=>e.id===payment.submissionObligationId);
  if(due){const credit=suggestedReviewCredit(draft,due.id);if(credit){draft.obligationId=due.id;draft.credit=credit;}}
 }
 return draft;
}
function allocation(draft:ReviewDraft){
 if(!reviewOutcomes(draft).includes(draft.outcome))throw new Error('Choose an allowed review outcome.');
 if(!creditOutcomes.includes(draft.outcome)||!draft.obligationId)return {obligationId:'',creditMinor:0};
 if(!duesFor(draft).some(e=>e.id===draft.obligationId))throw new Error('Choose an obligation for this member in the same currency.');
 const creditMinor=parseMoney(draft.credit,draft.currency);
 if(creditMinor>draft.reviewSnapshot.payment.amountMinor)throw new Error('Credit cannot exceed this payment.');
 return {obligationId:draft.obligationId,creditMinor};
}
export function reviewRequest(draft:ReviewDraft){
 const assigned=allocation(draft);
 const receipt=receiptConfirmation(draft.bankReceiptEnabled?draft.reviewSnapshot.payment.method:'',draft.outcome,draft.bankReference,draft.bankConfirmed);
 if(typeof draft.evidence!=='string'||draft.evidence.trim().length<5||draft.evidence.length>2000)throw new Error('Provide an evidence reference or correction reason of at least five characters.');
 // Captured payment/standing data is for the local preview, not the mutation.
 return {...(receipt.bankReference?{bankReference:receipt.bankReference,bankConfirmed:true}:{}),action:'review',orgId:draft.orgId,entryId:draft.entryId,reviewCount:draft.reviewCount,outcome:draft.outcome,evidence:draft.evidence.trim(),obligationId:assigned.obligationId,credit:amountText(assigned.creditMinor,draft.currency)};
}
export function reviewImpact(draft:ReviewDraft){
 const payment=draft.reviewSnapshot.payment,entries=draft.reviewSnapshot.entries,latest=payment.reviews?.at(-1),dues=duesFor(draft);
 let assigned;try{assigned=allocation(draft);}catch(e){return {error:(e as Error).message,rows:[],creditMinor:0,unallocatedMinor:undefined,warning:''};}
 const updated:Entry={...payment,status:draft.outcome,reviews:[...(payment.reviews||[]),{outcome:draft.outcome,evidence:'Unsaved preview',actor:'',at:'',obligationId:assigned.obligationId,creditMinor:assigned.creditMinor}]};
 const after=entries.map(e=>e.id===payment.id?updated:e);
 const ids=new Set([latest?.obligationId,assigned.obligationId].filter(Boolean));
 const rows=dues.filter(e=>ids.has(e.id)).map(due=>{const before=obligationStanding(due,entries),next=obligationStanding(due,after);return {id:due.id,title:due.title,date:due.date,currency:due.currency,beforeRemaining:before.remaining,afterRemaining:next.remaining,afterExcess:next.excess};});
 const invalidPrevious=!!latest&&creditOutcomes.includes(payment.status)&&(latest.outcome!==payment.status||(!!latest.obligationId&&(!dues.some(e=>e.id===latest.obligationId)||!Number.isSafeInteger(latest.creditMinor)||latest.creditMinor<=0||latest.creditMinor>payment.amountMinor))||(!latest.obligationId&&latest.creditMinor!==0));
 return {error:'',rows,creditMinor:assigned.creditMinor,unallocatedMinor:creditOutcomes.includes(draft.outcome)?payment.amountMinor-assigned.creditMinor:undefined,warning:invalidPrevious?'The earlier credit is inconsistent and was excluded from the balance calculation. Review the history before saving.':''};
}
export function reviewObligations(draft:ReviewDraft){return duesFor(draft);}
