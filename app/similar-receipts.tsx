'use client';
import {money} from '@/lib/model';
import type {SimilarReceipt} from '@/lib/similar-receipts';
export default function SimilarReceipts({matches,captured=false}:{matches:SimilarReceipt[];captured?:boolean}){
 if(!matches.length)return null;
 return <section className="similar-receipts" aria-label="Similar receipt references" role="status"><h3>Check similar receipt references</h3><p>{matches.length} other {matches.length===1?'contribution uses':'contributions use'} this receipt reference. Compare the external evidence before recording or confirming another payment. Matching text alone does not prove a duplicate.</p><ul>{matches.slice(0,5).map(m=><li key={m.id}><strong>{m.memberName} · {money(m.amountMinor,m.currency)} {m.currency}</strong><span>{m.date} · {m.status} · {m.title}</span></li>)}</ul>{matches.length>5&&<p>{matches.length-5} more matches can be found in the contribution register using the receipt reference.</p>}{captured&&<p>Matches were captured when this review opened. Refresh and reopen the review to check newer records.</p>}</section>;
}
