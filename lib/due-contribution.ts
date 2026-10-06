import {type Org,type Entry,obligationStanding} from './model';
export function canReportForDue(org:Org,due:Entry){return org.mode==='Shared ownership'&&org.members.some(m=>m.id===due.memberId)&&due.orgId===org.id&&due.type==='obligation'&&(!!org.permissions?.canManage||!!org.permissions?.memberId&&due.memberId===org.permissions.memberId);}
export function pendingForDue(org:Org,entries:Entry[],dueId:string,memberId:string,currency:string){return entries.filter(e=>e.orgId===org.id&&e.type==='contribution'&&e.status==='Awaiting verification'&&e.memberId===memberId&&e.currency===currency&&e.submissionObligationId===dueId);}
export function dueContribution(org:Org,due:Entry,entries:Entry[],submissionId:string,date=new Date().toISOString().slice(0,10)){
 if(!canReportForDue(org,due))throw new Error('Choose an obligation you are allowed to report a contribution for.');
 const standing=obligationStanding(due,entries.filter(e=>e.orgId===org.id));
 if(standing.remaining<=0)throw new Error('This recorded obligation is already covered. Use an extra contribution if that is your intention.');
 return {action:'contribution',orgId:org.id,submissionId,title:('Contribution · '+due.title).slice(0,180),memberId:due.memberId,currency:due.currency,amount:due.currency==='XAF'?String(standing.remaining):(standing.remaining/100).toFixed(2),method:'Zelle (external)',date,reference:'',purpose:'',submissionObligationId:due.id};
}
