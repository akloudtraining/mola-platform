import type {Entry,Org,Approval} from './model';
import {payoutTotals} from './payouts';
export const officerRoles=['President','Treasurer','Secretary','Designated reviewer'];
export type FundingRevision={at:string;actor:string;actorName:string;reason:string;title:string;amountMinor:number;currency:string;reference:string;purpose:string;date:string;revision:number;approvals:Approval[]};
export type FundingState={token:string;revision:number;required:number;count:number;availableApprovers:number;status:string;needsRestart:boolean;approvedByMe:boolean;canEdit:boolean};
export function requiredApprovals(org:Org){const n=org.approvalPolicy?.requiredApprovals??3;return Number.isInteger(n)&&n>=2&&n<=org.members.length?n:0;}
export function fundingToken(entry:Entry,org:Org){const fields:unknown[]=[entry.id,entry.requestRevision||1,entry.title,entry.amountMinor,entry.currency,entry.reference,entry.purpose,entry.date,requiredApprovals(org),org.approvalPolicy?.effectiveAt||'pilot'];if(org.approvalPolicy?.approverMemberIds)fields.push(org.approvalPolicy.version,[...org.approvalPolicy.approverMemberIds].sort());return JSON.stringify(fields);}
export function eligibleOfficer(org:Org,owner:string,actor:string){const ids=org.approvalPolicy?.approverMemberIds;if(ids)return org.members.some(m=>ids.includes(m.id)&&m.access?.enabled&&m.access.userId===actor);return actor===owner||org.members.some(m=>m.access?.enabled&&m.access.userId===actor&&officerRoles.includes(m.role));}
export function currentApprovals(entry:Entry,org:Org,owner:string){
 if(entry.approvalSnapshot!==fundingToken(entry,org))return [];
 const actors=new Set<string>(),members=new Set<string>();
 return (entry.approvals||[]).filter(a=>{const member=org.members.find(m=>m.access?.enabled&&m.access.userId===a.actor);if(!a.actor||actors.has(a.actor)||(a.memberId&&members.has(a.memberId))||a.actor===(entry.submittedBy||owner)||!eligibleOfficer(org,owner,a.actor)||(a.memberId&&member?.id!==a.memberId))return false;actors.add(a.actor);if(a.memberId)members.add(a.memberId);return true;});
}
export function fundingState(entry:Entry,org:Org,owner:string,actor:string):FundingState {
 const token=fundingToken(entry,org),required=requiredApprovals(org),approvals=currentApprovals(entry,org,owner);
 const needsRestart=!!entry.approvals?.length&&entry.approvalSnapshot!==token;
 const candidates=new Set(org.members.filter(m=>m.access?.enabled&&m.access.userId&&eligibleOfficer(org,owner,m.access.userId)).map(m=>m.access!.userId!));if(eligibleOfficer(org,owner,owner))candidates.add(owner);candidates.delete(entry.submittedBy||owner);
 return {token,revision:entry.requestRevision||1,required,count:approvals.length,availableApprovers:candidates.size,status:needsRestart?'Review required':required&&approvals.length>=required?'Authorized':approvals.length?'Awaiting approvals':'Draft',needsRestart,approvedByMe:approvals.some(a=>a.actor===actor),canEdit:payoutTotals(entry).count===0&&(actor===owner||actor===(entry.submittedBy||owner))};
}
