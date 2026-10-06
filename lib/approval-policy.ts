import type {Org} from './model';
export type PolicyChange={requiredApprovals:number;at:string;actor:string;actorName?:string;reason?:string;approverMemberIds?:string[];previousRequired?:number;previousApproverMemberIds?:string[];version?:number};
export type ApprovalPolicy={requiredApprovals:number;effectiveAt:string;version?:number;approverMemberIds?:string[];history?:PolicyChange[]};
export function configuredPolicy(org:Org,input:{requiredApprovals:unknown;approverMemberIds:unknown;reason:unknown;acknowledged:unknown},actor:string,actorName:string,at:string):ApprovalPolicy{
 const n=input.requiredApprovals,ids=input.approverMemberIds;
 if(!Number.isInteger(n)||Number(n)<2||Number(n)>org.members.length-1)throw new Error('Choose at least two approvals and leave one founder available as requester.');
 if(!Array.isArray(ids)||ids.length<Number(n)||ids.length>org.members.length||new Set(ids).size!==ids.length||!ids.every(id=>typeof id==='string'&&org.members.some(m=>m.id===id)))throw new Error('Choose distinct founders, at least as many as the required approvals.');
 if(typeof input.reason!=='string'||input.reason.trim().length<5||input.reason.length>2000)throw new Error('Record the decision reference or reason for this change.');
 if(input.acknowledged!==true)throw new Error('Acknowledge that existing approvals will require fresh review.');
 const previous=org.approvalPolicy,version=(previous?.version||0)+1;
 return {requiredApprovals:Number(n),approverMemberIds:[...ids].sort(),effectiveAt:at,version,history:[...(previous?.history||[]),{requiredApprovals:Number(n),approverMemberIds:[...ids].sort(),previousRequired:previous?.requiredApprovals||3,previousApproverMemberIds:previous?.approverMemberIds,version,at,actor,actorName,reason:input.reason.trim()}]};
}
