import type {Entry,Org} from './model';
export type ReceiptQueueFilter='actionable'|'pending'|'provisional';
export function receiptQueue(org:Org,entries:Entry[],filter:ReceiptQueueFilter='actionable'){
 const own=entries.filter(e=>e.orgId===org.id&&e.type==='contribution');
 const pending=own.filter(e=>e.status==='Awaiting verification');
 const provisional=own.filter(e=>e.status==='Owner reconciled');
 const actionable=pending.filter(e=>e.canReview||e.canOwnerReconcile);
 const rows=(filter==='pending'?pending:filter==='provisional'?provisional:actionable).slice().sort((a,b)=>a.created.localeCompare(b.created)||a.id.localeCompare(b.id));
 const currencies=[...new Set(rows.map(e=>e.currency))].sort();
 const totals=currencies.map(currency=>{const amounts=rows.filter(e=>e.currency===currency);let amountMinor:number|null=0;for(const e of amounts){if(amountMinor!==null){const sum:number=amountMinor+e.amountMinor;amountMinor=Number.isSafeInteger(sum)?sum:null;}}return {currency,count:amounts.length,amountMinor};});
 return {rows,totals,pending:pending.length,provisional:provisional.length,actionable:actionable.length,independent:pending.filter(e=>e.canReview).length};
}
