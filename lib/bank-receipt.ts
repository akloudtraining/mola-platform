export function bankReferenceKey(reference:string){return reference.normalize('NFKC').trim().toUpperCase().replace(/\s+/g,' ');}
export function receiptConfirmation(method:string,outcome:string,reference:unknown,confirmed:unknown){
 const credited=['Verified','Owner reconciled'].includes(outcome);
 if(!credited)return {bankReference:'',depositKey:''};
 if(reference!==undefined&&(typeof reference!=='string'||reference.length>180))throw new Error('Use a receiving-bank transaction reference of at most 180 characters.');
 const value=typeof reference==='string'?reference.trim():'';
 if(method==='Zelle (external)'||value){if(value.length<3||confirmed!==true)throw new Error('Enter the receiving-bank deposit reference and confirm you checked the full amount, currency and sender in the receiving account.');}
 return {bankReference:value,depositKey:value?bankReferenceKey(value):''};
}
