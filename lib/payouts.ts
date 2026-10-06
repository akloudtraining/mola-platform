import {parseMoney,type Entry,type Approval} from './model';
import {validDate} from './schedule';
export type ExternalPayout={
 id:string;amountMinor:number;feeMinor:number;currency:string;date:string;reference:string;referenceKey:string;method:string;evidence:string;sentBy:string;
 recordedAt:string;recordedBy:string;recordedName:string;requestToken:string;
 authorization:{revision:number;title:string;amountMinor:number;currency:string;recipient:string;purpose:string;required:number;approvals:Approval[]};
 void?:{at:string;actor:string;actorName:string;reason:string};
};
export function payoutTotals(entry:Entry){
 const active=(entry.payouts||[]).filter(p=>!p.void);
 const principal=active.reduce((n,p)=>n+p.amountMinor,0),fees=active.reduce((n,p)=>n+p.feeMinor,0);
 return {count:active.length,principal,fees,total:principal+fees,remaining:Math.max(0,entry.amountMinor-principal-fees)};
}
export const payoutToken=(entry:Entry)=>JSON.stringify([entry.requestRevision||1,(entry.payouts||[]).map(p=>[p.id,p.void?.at||''])]);
export function payoutInput(body:Record<string,unknown>,currency:string){
 for(const [key,max] of Object.entries({amount:30,fee:30,date:10,reference:180,method:80,evidence:2000,sentBy:100})){
  if(typeof body[key]!=='string'||(body[key] as string).length>max)throw new Error('Check the payment amount, fee, date and receipt details.');
 }
 const amountMinor=parseMoney(body.amount as string,currency),fee=(body.fee as string).trim();
 const feeMinor=/^0(?:\.0{1,2})?$/.test(fee)?0:parseMoney(fee,currency);
 const date=body.date as string,reference=(body.reference as string).trim(),method=(body.method as string).trim(),evidence=(body.evidence as string).trim(),sentBy=(body.sentBy as string).trim();
 if(!validDate(date)||reference.length<3||!method||evidence.length<5||sentBy.length<2)throw new Error('Provide a valid payment date, transfer reference, method, person who sent it and evidence reference.');
 return {amountMinor,feeMinor,currency,date,reference,referenceKey:reference.normalize('NFKC').toLocaleLowerCase('en-US'),method,evidence,sentBy};
}
export function samePayout(p:ExternalPayout,input:ReturnType<typeof payoutInput>,requestToken:string){return p.requestToken===requestToken&&(['amountMinor','feeMinor','currency','date','reference','method','evidence','sentBy'] as const).every(k=>p[k]===input[k]);}
export function publicPayout(p:ExternalPayout):ExternalPayout{return {...p,recordedBy:'',authorization:{...p.authorization,approvals:p.authorization.approvals.map(a=>({...a,actor:''}))},void:p.void?{...p.void,actor:''}:undefined};}
