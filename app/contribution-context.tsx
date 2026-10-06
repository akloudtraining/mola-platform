'use client';
import {type Org,type Entry,money,obligationStanding} from '@/lib/model';
import {pendingForDue} from '@/lib/due-contribution';
export default function ContributionContext({org,entries,memberId,currency,obligationId}:{org:Org;entries:Entry[];memberId:string;currency:string;obligationId:string}){
 if(!obligationId)return null;
 const due=entries.find(e=>e.id===obligationId&&e.orgId===org.id&&e.type==='obligation'&&e.memberId===memberId&&e.currency===currency);
 if(!due)return <p className="form-error" role="alert">This obligation is no longer available for the selected member and currency. Choose it again after refreshing.</p>;
 const standing=obligationStanding(due,entries.filter(e=>e.orgId===org.id)),pending=pendingForDue(org,entries,due.id,memberId,currency);
 return <div className="contribution-context"><strong>{due.title}</strong><p>{money(standing.remaining,currency)} {currency} remains based on assigned credits, including provisional owner credits. Report only the amount actually paid; partial or extra amounts can be entered.</p>{pending.length>0&&<p className="pending-contribution-warning" role="status">{pending.length} existing {pending.length===1?'report is':'reports are'} awaiting verification for this obligation: {money(pending.reduce((n,e)=>n+e.amountMinor,0),currency)} {currency}. Check those reports before making or recording another payment. Pending reports have not reduced the remaining dues.</p>}<p>Saving a report does not transfer money or automatically assign credit.</p></div>;
}
