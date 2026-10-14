import {env} from 'cloudflare:workers';
import {money,obligationStanding,type Org,type Entry} from './model';
import {memberStatement} from './statements';
import {sendEmail,emailConfigured} from './email';
import {founderRecipients} from './notifications';

// Hourly Cloudflare cron. Times are Eastern (America/New_York) so they follow daylight saving:
//  - 6 PM the evening before a due: heads-up to that founder, unless already submitted
//  - 9 PM on the due day: last call to founders who still have not submitted
//  - 8 AM the day after: one past-due notice to every founder naming who missed the deadline
//  - 8 AM on the first Monday of a month: each founder's statement for the previous month
// Each email is claimed in scheduled_notifications before sending, so reruns never duplicate.
// Jobs accept a short window after their hour in case a cron run is missed.
const ZONE='America/New_York';
const value=(name:'MOLA_APP_URL')=>String((env as unknown as Record<string,string|undefined>)[name]||'').trim();
const escapeHtml=(text:string)=>text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const firstName=(name:string)=>name.trim().split(/\s+/)[0]||name;

export function eastern(now:Date){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:ZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',weekday:'short',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]));
 return {ymd:`${parts.year}-${parts.month}-${parts.day}`,hour:Number(parts.hour),weekday:parts.weekday as string,day:Number(parts.day)};
}
export const addDays=(ymd:string,days:number)=>new Date(Date.parse(ymd+'T12:00:00Z')+days*86400000).toISOString().slice(0,10);
// 23:59:59 Eastern on a calendar day, as a UTC instant.
export function endOfEasternDay(ymd:string){
 const noon=Date.parse(ymd+'T12:00:00Z'),offset=eastern(new Date(noon)).hour-12;
 return Date.parse(ymd+'T23:59:59Z')-offset*3600000;
}
const prettyDay=(ymd:string)=>new Date(ymd+'T12:00:00Z').toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric',timeZone:'UTC'});
const deadlineOf=(due:Entry)=>due.deadline?.at?Date.parse(due.deadline.at):endOfEasternDay(due.date);

// A founder has submitted for a due if a non-rejected contribution is linked to it, or an
// unlinked contribution of theirs was recorded during that week (people do not always pick the due).
export function submissionFor(due:Entry,entries:Entry[]){
 const weekStart=endOfEasternDay(addDays(due.date,-7));
 return entries.filter(e=>e.type==='contribution'&&e.memberId===due.memberId&&e.currency===due.currency&&!['Rejected','Screenshot required'].includes(e.status)&&(e.submissionObligationId===due.id||(!e.submissionObligationId&&Date.parse(e.created)>weekStart&&Date.parse(e.created)<=deadlineOf(due)+86400000*2))).sort((a,b)=>a.created.localeCompare(b.created))[0];
}

type Context={db:D1Database;org:Org;owner:string;entries:Entry[];appUrl:string};
async function claim(db:D1Database,key:string){
 const result=await db.prepare('INSERT OR IGNORE INTO scheduled_notifications (key,sent_at) VALUES (?,?)').bind(key,new Date().toISOString()).run();
 return result.meta.changes>0;
}
async function mail(to:string,name:string,subject:string,lines:string[],link:{label:string;url:string}){
 await sendEmail(to,subject,`Hi ${name},\n\n${lines.join('\n\n')}\n\n${link.label}: ${link.url}\n\nMola Holdings`,`<p>Hi ${escapeHtml(name)},</p>${lines.map(l=>`<p>${escapeHtml(l)}</p>`).join('')}<p><a href="${escapeHtml(link.url)}">${escapeHtml(link.label)}</a></p><p>Mola Holdings</p>`);
}
const openDues=(ctx:Context,date:string)=>ctx.entries.filter(e=>e.type==='obligation'&&e.date===date&&obligationStanding(e,ctx.entries.filter(x=>x.currency===e.currency)).remaining>0);
const founder=(ctx:Context,memberId:string)=>{const m=ctx.org.members.find(x=>x.id===memberId);return m?.access?.enabled&&m.access.email?m:undefined;};

async function reminders(ctx:Context,date:string,kind:'headsup'|'lastcall'){
 for(const due of openDues(ctx,date)){
  const m=founder(ctx,due.memberId);if(!m||submissionFor(due,ctx.entries))continue;
  if(!await claim(ctx.db,`${kind}:${due.id}`))continue;
  const remaining=money(obligationStanding(due,ctx.entries.filter(x=>x.currency===due.currency)).remaining,due.currency)+' '+due.currency;
  const lines=kind==='headsup'?[`A reminder that your contribution of ${remaining} is due ${prettyDay(due.date)}.`,'Submit it in the app after the meeting. The deadline is midnight Eastern that night.']:[`Last call: your contribution of ${remaining} is due tonight by midnight Eastern.`,'If you have already paid, record it in the app with your screenshot so it counts on time.'];
  await mail(m.access!.email,firstName(m.name),kind==='headsup'?`Contribution due ${prettyDay(due.date)} · ${remaining}`:`Last call: contribution due tonight · ${remaining}`,lines,{label:'Record your payment',url:ctx.appUrl});
 }
}

async function pastDue(ctx:Context,date:string){
 const missed=openDues(ctx,date).flatMap(due=>{
  const submitted=submissionFor(due,ctx.entries);
  if(submitted&&Date.parse(submitted.created)<=deadlineOf(due))return [];
  const name=ctx.org.members.find(m=>m.id===due.memberId)?.name||'A founder';
  const amount=money(obligationStanding(due,ctx.entries.filter(x=>x.currency===due.currency)).remaining,due.currency)+' '+due.currency;
  return [`${name}: ${amount}${submitted?` (submitted late, ${new Date(submitted.created).toLocaleString('en-US',{timeZone:ZONE,weekday:'short',hour:'numeric',minute:'2-digit'})} ET)`:' (not submitted)'}`];
 });
 if(!missed.length||!await claim(ctx.db,`pastdue:${ctx.org.id}:${date}`))return;
 for(const r of founderRecipients(ctx.org,ctx.owner,''))
  await mail(r.email,r.name,`Past due: ${missed.length} contribution${missed.length===1?'':'s'} for ${prettyDay(date)}`,[`These contributions were not submitted by the midnight Eastern deadline on ${prettyDay(date)}:`,...missed,'Please settle past-due balances as soon as possible. Late fees follow the group’s agreed rules.'],{label:'Open Mola',url:ctx.appUrl});
}

async function monthly(ctx:Context,today:string){
 const thisMonth=today.slice(0,7),from=addDays(thisMonth+'-01',-1).slice(0,7)+'-01',to=addDays(thisMonth+'-01',-1),label=new Date(from+'T12:00:00Z').toLocaleDateString('en-US',{month:'long',year:'numeric',timeZone:'UTC'});
 const groupVerified=new Map<string,number>();
 for(const e of ctx.entries)if(e.type==='contribution'&&e.status==='Verified'&&e.date>=from&&e.date<=to)groupVerified.set(e.currency,(groupVerified.get(e.currency)||0)+e.amountMinor);
 const group=[...groupVerified].map(([c,v])=>`${money(v,c)} ${c}`).join(', ')||'none recorded';
 for(const m of ctx.org.members){
  if(!m.access?.enabled||!m.access.email||!await claim(ctx.db,`monthly:${ctx.org.id}:${from.slice(0,7)}:${m.id}`))continue;
  const period=memberStatement(ctx.org,ctx.entries,m.id,from,to),overall=memberStatement(ctx.org,ctx.entries,m.id);
  const lines=[`Here is your Mola statement for ${label}.`];
  for(const s of period.summaries)lines.push(`${s.currency} this month: verified ${money(s.verified,s.currency)}, awaiting verification ${money(s.pending,s.currency)}, provisionally reconciled ${money(s.owner,s.currency)}.`);
  if(!period.summaries.length)lines.push('No contributions were recorded for you this month.');
  for(const s of overall.summaries)if(s.dueCount)lines.push(`${s.currency} balance today: remaining recorded dues ${money(s.remaining,s.currency)}, of which overdue ${money(s.overdue,s.currency)}.`);
  lines.push(`Group verified contributions in ${label}: ${group}.`);
  await mail(m.access.email,firstName(m.name),`Your Mola statement · ${label}`,lines,{label:'Open your full statement',url:ctx.appUrl});
 }
}

export async function runScheduledJobs(now=new Date()){
 const db=(env as unknown as {DB?:D1Database}).DB;
 if(!db||!emailConfigured())return;
 const et=eastern(now);
 const jobs={headsup:et.hour>=18&&et.hour<=20,lastcall:et.hour>=21&&et.hour<=23,pastdue:et.hour>=8&&et.hour<=11,monthly:et.weekday==='Mon'&&et.day<=7&&et.hour>=8&&et.hour<=11};
 if(!Object.values(jobs).some(Boolean))return;
 await db.prepare('CREATE TABLE IF NOT EXISTS scheduled_notifications (key TEXT PRIMARY KEY, sent_at TEXT NOT NULL)').run();
 const orgs=await db.prepare('SELECT id,owner,data FROM organizations').all<{id:string;owner:string;data:string}>();
 const appUrl=value('MOLA_APP_URL')||'https://molaholdings.app';
 for(const row of orgs.results){
  try{
   const org:Org=JSON.parse(row.data);if(org.mode!=='Shared ownership')continue;
   const entries=(await db.prepare('SELECT data FROM entries WHERE org_id=?').bind(row.id).all<{data:string}>()).results.map(r=>JSON.parse(r.data) as Entry);
   const ctx={db,org,owner:row.owner,entries,appUrl};
   if(jobs.headsup)await reminders(ctx,addDays(et.ymd,1),'headsup');
   if(jobs.lastcall)await reminders(ctx,et.ymd,'lastcall');
   if(jobs.pastdue)await pastDue(ctx,addDays(et.ymd,-1));
   if(jobs.monthly)await monthly(ctx,et.ymd);
  }catch(error){console.error('Scheduled job failed for organization',row.id,(error as Error).message);}
 }
}
