import {rateOn,type WeeklySchedule} from './schedule';
import {obligationPastDue,type Deadline,type DeadlineChange} from './deadlines';
export type Member={id:string;name:string;role:string;access?:{email:string;enabled:boolean;canReview:boolean;userId?:string;claimed?:boolean}};
export type Org={savingsGoals?:import("./founder-hub").SavingsGoal[];cashCheckpoints?:import("./founder-hub").CashCheckpoint[];collectionInstructions?:import('./collection-instructions').CollectionInstructions;activeAgreementId?:string;approvalPolicy?:import('./approval-policy').ApprovalPolicy;weeklySchedule?:WeeklySchedule;permissions?:{isOwner:boolean;memberId:string;canManage:boolean;canReview:boolean;role:string};accessHistory?:{at:string;actor:string;memberId:string;summary:string}[];weeklyMinimumMinor?:number;weeklyMinimumHistory?:{previousMinor:number;amountMinor:number;at:string;actor:string}[];id:string;name:string;currency:string;mode:string;members:Member[];accountLabel:string;accountHolder:string;accountLast4:string;recipientLabel:string;recipientCountry:string;recipientCurrency:string;recipientLast4:string;agreement:string;version:number};
export type Review={bankReference?:string;actorName?:string;outcome:string;evidence:string;actor:string;at:string;obligationId:string;creditMinor:number};
export type Approval={actor:string;actorName:string;at:string;memberId?:string};
export type ContributionSnapshot={title:string;memberId:string;amountMinor:number;currency:string;method:string;date:string;reference:string;purpose:string;submissionObligationId?:string;submissionDeadline?:Deadline};
export type ContributionCorrection={actor:string;actorName:string;at:string;reason:string;previous:ContributionSnapshot;updated:ContributionSnapshot};
export type Entry={opportunity?:import("./founder-hub").Opportunity;canEditOpportunity?:boolean;depositKey?:string;receipt?:{key:string;mime:string;size:number;uploadedBy:string;uploadedAt:string};hasReceipt?:boolean;canViewReceipt?:boolean;canUploadReceipt?:boolean;canResubmit?:boolean;payouts?:import('./payouts').ExternalPayout[];agreement?:import('./agreements').AgreementVersion;deadline?:Deadline;deadlineHistory?:DeadlineChange[];submissionObligationId?:string;submissionDeadline?:Deadline;corrections?:ContributionCorrection[];requestRevision?:number;approvalSnapshot?:string;fundingHistory?:import('./funding').FundingRevision[];funding?:import('./funding').FundingState;decisionType?:string;submittedBy?:string;submittedName?:string;canReview?:boolean;canOwnerReconcile?:boolean;canApprove?:boolean;reviews?:Review[];approvals?:Approval[];id:string;orgId:string;type:string;title:string;memberId:string;amountMinor:number;currency:string;method:string;date:string;reference:string;purpose:string;status:string;created:string};
const settings={accountLabel:'',accountHolder:'',accountLast4:'',recipientLabel:'',recipientCountry:'',recipientLast4:'',agreement:'',approvalPolicy:{requiredApprovals:3,effectiveAt:'2026-09-28',history:[]},version:1};
export const templates:Org[]=[{...settings,id:'mola',name:'Mola Holdings',currency:'USD',recipientCurrency:'USD',mode:'Shared ownership',members:Array.from({length:8},(_,i)=>({id:'founder-'+(i+1),name:'Founder '+(i+1),role:'Name pending'}))}];
export function money(n:number,c:string){return new Intl.NumberFormat('en-US',{style:'currency',currency:c,maximumFractionDigits:c==='XAF'?0:2}).format(n/(c==='XAF'?1:100));}
export function parseMoney(v:string,c:string){if(!/^\d+(\.\d{1,2})?$/.test(v))throw new Error('Enter a positive amount with at most two decimals.');if(c==='XAF'&&v.includes('.'))throw new Error('Use whole CFA francs.');const [whole,frac='']=v.split('.');const n=Number(whole)*(c==='XAF'?1:100)+(c==='XAF'?0:Number(frac.padEnd(2,'0')));if(!Number.isSafeInteger(n)||n<=0||n>100000000000)throw new Error('Enter a valid positive amount.');return n;}

export function obligationStanding(obligation:Entry,entries:Entry[],today=new Date().toISOString()) {
 let credit=0,ignoredCreditCount=0;
 for(const payment of entries){
  if(payment.type!=='contribution'||!['Owner reconciled','Verified'].includes(payment.status))continue;
  const review=payment.reviews?.at(-1);
  if(!review||review.obligationId!==obligation.id)continue;
  const valid=payment.orgId===obligation.orgId&&payment.memberId===obligation.memberId&&payment.currency===obligation.currency
   &&review.outcome===payment.status&&Number.isSafeInteger(review.creditMinor)&&review.creditMinor>0
   &&Number.isSafeInteger(payment.amountMinor)&&review.creditMinor<=payment.amountMinor&&Number.isSafeInteger(credit+review.creditMinor);
  if(valid)credit+=review.creditMinor;else ignoredCreditCount++;
 }
 return {credit,ignoredCreditCount,remaining:Math.max(0,obligation.amountMinor-credit),excess:Math.max(0,credit-obligation.amountMinor),status:credit>=obligation.amountMinor?'Covered':obligationPastDue(obligation,today)?'Behind':credit>0?'Part paid':'Due'};
}

export const weeklyMinimum=(org:Org)=>org.weeklySchedule?rateOn(org.weeklySchedule,new Date().toISOString().slice(0,10))??org.weeklyMinimumMinor??10000:org.weeklyMinimumMinor??10000;
