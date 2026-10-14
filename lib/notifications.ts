import {env} from 'cloudflare:workers';
import {money,type Org,type Entry} from './model';

// Payment email alerts through Resend (the same provider as sign-in emails).
// Alerts never block or fail a save: delivery problems are logged and the record stands.
// Volume for an 8-founder group with weekly dues stays far inside Resend's free daily cap,
// because review alerts go only to designated reviewers (or the owner when none are set).

type Recipient={email:string;name:string};
const value=(name:'RESEND_API_KEY'|'MOLA_EMAIL_FROM'|'MOLA_APP_URL'|'MOLA_OWNER_EMAIL')=>String((env as unknown as Record<string,string|undefined>)[name]||(typeof process!=='undefined'?process.env[name]:'')||'').trim();
const escapeHtml=(text:string)=>text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const memberName=(org:Org,id:string)=>org.members.find(m=>m.id===id)?.name||'A founder';
const amount=(entry:Entry)=>`${money(entry.amountMinor,entry.currency)} ${entry.currency}`;
export const recordLink=(origin:string,entryId:string)=>`${value('MOLA_APP_URL')||origin}/?record=${encodeURIComponent(entryId)}`;

async function send(to:Recipient,subject:string,lines:string[],link:{label:string;url:string}){
 const key=value('RESEND_API_KEY'),from=value('MOLA_EMAIL_FROM');
 if(!key||!from)return;
 const text=`Hi ${to.name},\n\n${lines.join('\n\n')}\n\n${link.label}: ${link.url}\n\nMola Holdings`;
 const html=`<p>Hi ${escapeHtml(to.name)},</p>${lines.map(l=>`<p>${escapeHtml(l)}</p>`).join('')}<p><a href="${escapeHtml(link.url)}">${escapeHtml(link.label)}</a></p><p>Mola Holdings</p>`;
 const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({from,to:[to.email],subject,text,html}),signal:AbortSignal.timeout(8000)});
 if(!response.ok)throw new Error(`Resend ${response.status}`);
}

async function deliver(jobs:Promise<void>[]){
 const results=await Promise.allSettled(jobs);
 for(const r of results)if(r.status==='rejected')console.error('Payment alert email failed',(r.reason as Error)?.message);
}

// Designated reviewers who could act on this payment: never the contributor or the submitter.
export function reviewRecipients(org:Org,payment:Entry):Recipient[]{
 const reviewers=org.members.filter(m=>m.access?.enabled&&m.access.canReview&&m.access.email&&m.id!==payment.memberId&&(!payment.submittedBy||m.access.userId!==payment.submittedBy)).map(m=>({email:m.access!.email,name:m.name.split(/\s+/)[0]||m.name}));
 if(reviewers.length)return reviewers;
 const owner=value('MOLA_OWNER_EMAIL');
 return owner?[{email:owner,name:'there'}]:[];
}

export async function notifyReviewNeeded(org:Org,payment:Entry,origin:string){
 try{
  const who=memberName(org,payment.memberId),url=recordLink(origin,payment.id);
  await deliver(reviewRecipients(org,payment).map(r=>send(r,`Payment to review: ${who} · ${amount(payment)}`,[
   `${who} reported a payment of ${amount(payment)} dated ${payment.date}${payment.method?` (${payment.method})`:''}, with a screenshot attached.`,
   'Please check it against Mola’s receiving account and record your review in the app.',
   'Several reviewers get this email. If someone has already reviewed it, the payment will show who did and when, and nothing more is needed from you.',
  ],{label:'Open the payment',url})));
 }catch(e){console.error('Payment alert skipped',(e as Error).message);}
}

export async function notifyReviewOutcome(org:Org,payment:Entry,outcome:string,reviewerName:string,reason:string,origin:string){
 try{
  const contributor=org.members.find(m=>m.id===payment.memberId);
  if(!contributor?.access?.enabled||!contributor.access.email)return;
  const to={email:contributor.access.email,name:contributor.name.split(/\s+/)[0]||contributor.name},url=recordLink(origin,payment.id);
  const lines=outcome==='Verified'?[`${reviewerName} verified your payment of ${amount(payment)} dated ${payment.date}.`,'Any credit they assigned now shows in your dues.']
   :outcome==='Rejected'?[`${reviewerName} could not verify your payment of ${amount(payment)} dated ${payment.date}.`,`Their note: ${reason}`,'You can correct the details and resubmit the same payment in the app.']
   :outcome==='Owner reconciled'?[`The workspace owner provisionally reconciled your payment of ${amount(payment)} dated ${payment.date}.`,'An independent reviewer may still verify it.']
   :null;
  if(!lines)return;
  const subject=outcome==='Verified'?`Your payment was verified · ${amount(payment)}`:outcome==='Rejected'?`Your payment needs a correction · ${amount(payment)}`:`Your payment was provisionally reconciled · ${amount(payment)}`;
  await deliver([send(to,subject,lines,{label:'View your payment',url})]);
 }catch(e){console.error('Payment alert skipped',(e as Error).message);}
}
