import {env} from 'cloudflare:workers';

// One Resend sender for sign-in emails, payment alerts and scheduled emails.
// It counts sends per UTC day and month and warns the owner once when either nears the
// Resend free plan (100/day, 3,000/month). Counting never blocks or fails a send.
const DAY_WARNING=80,MONTH_WARNING=2500;
const value=(name:'RESEND_API_KEY'|'MOLA_EMAIL_FROM'|'MOLA_OWNER_EMAIL')=>String((env as unknown as Record<string,string|undefined>)[name]||(typeof process!=='undefined'?process.env[name]:'')||'').trim();
export const emailConfigured=()=>!!value('RESEND_API_KEY')&&!!value('MOLA_EMAIL_FROM');

async function post(to:string,subject:string,text:string,html:string){
 const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${value('RESEND_API_KEY')}`,'Content-Type':'application/json'},body:JSON.stringify({from:value('MOLA_EMAIL_FROM'),to:[to],subject,text,html}),signal:AbortSignal.timeout(8000)});
 if(!response.ok){const detail=await response.text().catch(()=> '');throw new Error(`Resend email delivery failed (${response.status}): ${detail.slice(0,300)}`);}
}

async function track(){
 const db=(env as unknown as {DB?:D1Database}).DB;if(!db)return;
 const now=new Date().toISOString(),day='day:'+now.slice(0,10),month='month:'+now.slice(0,7);
 await db.prepare('CREATE TABLE IF NOT EXISTS email_usage (period TEXT PRIMARY KEY, sent INTEGER NOT NULL DEFAULT 0, warned INTEGER NOT NULL DEFAULT 0)').run();
 const warn:string[]=[];
 for(const [period,limit] of [[day,DAY_WARNING],[month,MONTH_WARNING]] as const){
  await db.prepare('INSERT INTO email_usage (period,sent) VALUES (?,1) ON CONFLICT(period) DO UPDATE SET sent=sent+1').bind(period).run();
  const claimed=await db.prepare('UPDATE email_usage SET warned=1 WHERE period=? AND sent>=? AND warned=0').bind(period,limit).run();
  if(claimed.meta.changes)warn.push(period.startsWith('day:')?`${limit} emails today (Resend free plan: 100 per day, resets at midnight UTC)`:`${limit} emails this month (Resend free plan: 3,000 per month)`);
 }
 const owner=value('MOLA_OWNER_EMAIL');
 for(const message of warn)if(owner)await post(owner,'Mola email usage is nearing the free limit',`Mola has sent ${message}.\n\nEmails beyond the limit are held back until it resets. Upgrading the Resend plan removes the limit.\n\nMola Holdings`,`<p>Mola has sent ${message}.</p><p>Emails beyond the limit are held back until it resets. Upgrading the Resend plan removes the limit.</p><p>Mola Holdings</p>`);
}

export async function sendEmail(to:string,subject:string,text:string,html:string){
 if(!emailConfigured())throw new Error('Resend email delivery is not configured.');
 await post(to,subject,text,html);
 try{await track();}catch(error){console.error('Email usage tracking failed',(error as Error).message);}
}
