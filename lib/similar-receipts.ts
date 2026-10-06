import type {Org,Entry} from './model';
export type SimilarReceipt={id:string;memberName:string;title:string;date:string;currency:string;amountMinor:number;status:string};
const key=(value:string)=>value.trim().normalize('NFKC').toLocaleLowerCase('en-US');
export function similarReceipts(org:Org,entries:Entry[],reference:string,excludeId=''):SimilarReceipt[]{
 const target=key(reference);if(!target)return [];
 return entries.filter(e=>e.orgId===org.id&&e.id!==excludeId&&e.type==='contribution'&&['Awaiting verification','Verified','Owner reconciled'].includes(e.status)&&typeof e.reference==='string'&&key(e.reference)===target).sort((a,b)=>b.created.localeCompare(a.created)).map(e=>({id:e.id,memberName:org.members.find(m=>m.id===e.memberId)?.name||'Member',title:e.title,date:e.date,currency:e.currency,amountMinor:e.amountMinor,status:e.status}));
}
