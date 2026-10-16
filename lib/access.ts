import type {Org,Entry,Member} from './model';
import {fundingState,eligibleOfficer} from './funding';
import {publicAgreement} from './agreements';
import {publicPayout} from './payouts';
import {publicCollectionInstructions} from './collection-instructions';
export type Identity={userId:string;email:string;displayName:string;emailVerified?:boolean};
export const normalizeEmail=(s:string)=>s.trim().toLowerCase();
// Officers who may publish a membership agreement version for every founder to accept.
export const AGREEMENT_PUBLISHERS=['President','Treasurer','Secretary'];
// Who may report spending on an approved request: the owner, the founder who requested it
// (they usually made the purchase) or an officer. Correcting/voiding stays owner-only.
export function canRecordPayout(p:{isOwner:boolean;memberId:string;role:string},entry:Entry,owner:string,userId:string){return p.isOwner||(!!p.memberId&&((entry.submittedBy||owner)===userId||AGREEMENT_PUBLISHERS.includes(p.role)));}
// Every founder with enabled, linked access may review other founders' payments; the
// checks below still block reviewing a payment that is theirs or that they submitted.
export function accessFor(org:Org,owner:string,user:Identity){
 const member=org.members.find(m=>m.access?.enabled&&m.access.userId===user.userId);
 return {isOwner:owner===user.userId,memberId:member?.id||'',canManage:owner===user.userId,canPublishAgreement:owner===user.userId||AGREEMENT_PUBLISHERS.includes(member?.role||''),canReview:!!member,role:member?.role||'Workspace owner'};
}
export function canIndependentlyReview(org:Org,owner:string,user:Identity,entry:Entry){const p=accessFor(org,owner,user);return p.canReview&&entry.type==='contribution'&&entry.status!=='Screenshot required'&&!!entry.receipt&&entry.memberId!==p.memberId&&(entry.submittedBy||owner)!==user.userId;}
export function canOwnerReconcile(org:Org,owner:string,user:Identity,entry:Entry){const p=accessFor(org,owner,user);return p.isOwner&&entry.type==='contribution'&&entry.status!=='Screenshot required'&&!!entry.receipt&&entry.memberId!==p.memberId&&(entry.submittedBy||owner)!==user.userId&&!entry.reviews?.some(r=>r.outcome==='Verified');}
export function publicOrg(org:Org,owner:string,user:Identity):Org{const permissions=accessFor(org,owner,user);return {...org,collectionInstructions:publicCollectionInstructions(org.collectionInstructions),approvalPolicy:org.approvalPolicy?{...org.approvalPolicy,history:org.approvalPolicy.history?.map(h=>({...h,actor:''}))}:undefined,permissions,accessHistory:permissions.isOwner?org.accessHistory:undefined,members:org.members.map(m=>({...m,access:m.access?{...m.access,userId:undefined,email:permissions.isOwner||m.id===permissions.memberId?m.access.email:'',claimed:!!m.access.userId}:undefined}))};}
export function publicEntry(entry:Entry,org:Org,owner:string,user:Identity):Entry {
 const funding=entry.type==='request'&&org.mode==='Shared ownership'?fundingState(entry,org,owner,user.userId):undefined;
 const p=accessFor(org,owner,user),receiptAccess=p.isOwner||p.canReview||p.memberId===entry.memberId;
 const canResubmit=entry.type==='contribution'&&entry.status==='Rejected'&&(entry.submittedBy||owner)===user.userId;
 return {...entry,canEditOpportunity:entry.type==='opportunity'&&(p.isOwner||(entry.submittedBy===user.userId&&['Idea','Researching'].includes(entry.status))),receipt:undefined,depositKey:undefined,hasReceipt:!!entry.receipt,canViewReceipt:receiptAccess&&!!entry.receipt,canUploadReceipt:entry.type==='contribution'&&!entry.receipt&&['Screenshot required','Awaiting verification'].includes(entry.status)&&(p.isOwner||p.memberId===entry.memberId),canResubmit,payouts:entry.payouts?.map(x=>({...publicPayout(x),canAttachReceipt:!x.receipt&&!x.void&&(p.isOwner||x.recordedBy===user.userId)})),canRecordPayout:entry.type==='request'&&canRecordPayout(p,entry,owner,user.userId),agreement:publicAgreement(entry,org,accessFor(org,owner,user).memberId,user.userId),status:funding?.status||entry.status,funding,canReview:canIndependentlyReview(org,owner,user,entry),canOwnerReconcile:canOwnerReconcile(org,owner,user,entry),canApprove:!!funding&&org.mode==='Shared ownership'&&!!funding.required&&!funding.needsRestart&&!funding.approvedByMe&&funding.status!=='Authorized'&&eligibleOfficer(org,owner,user.userId)&&(entry.submittedBy||owner)!==user.userId,submittedBy:undefined,approvalSnapshot:undefined,deadlineHistory:entry.deadlineHistory?.map(h=>({...h,actor:''})),corrections:entry.corrections?.map(c=>({...c,actor:''})),reviews:entry.reviews?.map(r=>({...r,actor:''})),approvals:entry.approvals?.map(a=>({...a,actor:''})),fundingHistory:entry.fundingHistory?.map(h=>({...h,actor:'',approvals:h.approvals.map(a=>({...a,actor:''}))}))};
}
