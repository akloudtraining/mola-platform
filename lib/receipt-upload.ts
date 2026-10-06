import type {Entry} from './model';
import {receiptUrl} from './receipt-url';
export function validateReceipt(file:File){if(file.size>3*1024*1024||!['image/png','image/jpeg'].includes(file.type))throw new Error('Choose a PNG or JPEG screenshot under 3 MB.');}
export async function uploadReceipt(entry:Entry,file:File):Promise<Entry>{
 validateReceipt(file);
 const r=await fetch(receiptUrl(entry.orgId,entry.id),{method:'POST',headers:{'Content-Type':file.type},body:file});const d:any=await r.json();if(!r.ok)throw new Error(d.error||'Upload failed.');if(!d.entry)throw new Error('Upload could not be confirmed. Refresh before retrying.');return d.entry;
}
