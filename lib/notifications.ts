import {env} from 'cloudflare:workers';
import {money,type Org,type Entry} from './model';

// Payment email alerts through Resend (the same provider as sign-in emails).
// Every founder hears about each step of a contribution except the person who took that step:
// submitted, verified, returned for correction, provisionally reconciled, resubmitted.
// Alerts never block or fail a save: delivery problems are logged and the record stands.

export type PaymentEvent='submitted'|'resubmitted'|'Verified'|'Rejected'|'Owner reconciled';
type Recipient={email:string;name:string;memberId?:string};
const value=(name:'RESEND_API_KEY'|'MOLA_EMAIL_FROM'|'MOLA_APP_URL'|'MOLA_OWNER_EMAIL')=>String((env as unknown as Record<string,string|undefined>)[name]||(typeof process!=='undefined'?process.env[name]:'')||'').trim();
const escapeHtml=(text:string)=>text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const firstName=(name:string)=>name.trim().split(/\s+/)[0]||name;
const amount=(entry:Entry)=>`${money(entry.amountMinor,entry.currency)} ${entry.currency}`;
export const recordLink=(origin:string,entryId:string)=>`${value('MOLA_APP_URL')||origin}/?record=${encodeURIComponent(entryId)}`;

async function send(to:Recipient,subject:string,lines:string[],url:string){
 const key=value('RESEND_API_KEY'),from=value('MOLA_EMAIL_FROM');
 if(!key||!from)return;
 const text=`Hi ${to.name},\n\n${lines.join('\n\n')}\n\nOpen the payment: ${url}\n\nMola Holdings`;
 const html=`<p>Hi ${escapeHtml(to.name)},</p>${lines.map(l=>`<p>${escapeHtml(l)}</p>`).join('')}<p><a href="${escapeHtml(url)}">Open the payment</a></p><p>Mola Holdings</p>`;
 const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({from,to:[to.email],subject,text,html}),signal:AbortSignal.timeout(8000)});
 if(!response.ok)throw new Error(`Resend ${response.status}`);
}

// All founders with enabled access and an email, except the person who acted. The owner is
// included through MOLA_OWNER_EMAIL when their account is not linked to a founder slot.
export function founderRecipients(org:Org,ownerUserId:string,actorUserId:string):Recipient[]{
 const list:Recipient[]=org.members.filter(m=>m.access?.enabled&&m.access.email&&m.access.userId!==actorUserId).map(m=>({email:m.access!.email,name:firstName(m.name),memberId:m.id}));
 const ownerEmail=value('MOLA_OWNER_EMAIL');
 if(ownerEmail&&ownerUserId!==actorUserId&&!org.members.some(m=>m.access?.userId===ownerUserId))list.push({email:ownerEmail,name:'there'});
 const seen=new Set<string>();
 return list.filter(r=>{const key=r.email.trim().toLowerCase();if(seen.has(key))return false;seen.add(key);return true;});
}

function message(event:PaymentEvent,payment:Entry,owner:string,actor:string,reason:string,yours:boolean){
 const whose=yours?'your':`${owner}’s`,paid=`${amount(payment)} dated ${payment.date}`;
 const already='If someone has already reviewed it, the payment shows who did and when, and nothing more is needed.';
 switch(event){
  case 'submitted':return {subject:`New payment submitted: ${owner} · ${amount(payment)}`,lines:[`${owner} submitted a payment of ${paid}${payment.method?` (${payment.method})`:''}. It is waiting for review.`,`Reviewers: please check it against Mola’s receiving account. ${already}`]};
  case 'resubmitted':return {subject:`Payment corrected and resubmitted: ${owner} · ${amount(payment)}`,lines:[`${owner} corrected and resubmitted a payment of ${paid}. It is waiting for review again.`,`Reviewers: please check it against Mola’s receiving account. ${already}`]};
  case 'Verified':return {subject:`Payment verified: ${owner} · ${amount(payment)}`,lines:[`${actor} verified ${whose} payment of ${paid}. No action is needed.`]};
  case 'Rejected':return {subject:`Payment returned for correction: ${owner} · ${amount(payment)}`,lines:[`${actor} returned ${whose} payment of ${paid} for correction.`,`Their note: ${reason}`,yours?'You can correct the details and resubmit the same payment in the app.':`${owner} can correct and resubmit it.`]};
  case 'Owner reconciled':return {subject:`Payment provisionally reconciled: ${owner} · ${amount(payment)}`,lines:[`${actor} provisionally reconciled ${whose} payment of ${paid}. An independent reviewer may still verify it.`]};
 }
}

export async function notifyPaymentEvent(event:PaymentEvent,org:Org,payment:Entry,ownerUserId:string,actorUserId:string,actorName:string,reason:string,origin:string){
 try{
  const owner=org.members.find(m=>m.id===payment.memberId)?.name||'A founder',url=recordLink(origin,payment.id);
  const results=await Promise.allSettled(founderRecipients(org,ownerUserId,actorUserId).map(r=>{
   const {subject,lines}=message(event,payment,owner,actorName,reason,r.memberId===payment.memberId);
   return send(r,subject,lines,url);
  }));
  for(const r of results)if(r.status==='rejected')console.error('Payment alert email failed',(r.reason as Error)?.message);
 }catch(e){console.error('Payment alert skipped',(e as Error).message);}
}
