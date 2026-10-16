'use client';
import {useState,useEffect,useRef} from 'react';
import {ArrowUpRight} from 'lucide-react';
import {BankIcon,PendingIcon,SpendingIcon,OpportunityIcon,GoalIcon,PaymentsIcon,ScheduleIcon,FoundersIcon} from './mola-icons';
import {type Org,type Entry,money} from '@/lib/model';
import {founderSummary,goalProgress,currentGoal,goalWeekly,duesAlerts} from '@/lib/founder-hub';
import MemberOverview from './member-overview';
import {memberStatement} from '@/lib/statements';
import {RecordTime} from './record-time';
// "Oct 17" style, in the page language; due dates are calendar days, so format at noon UTC.
const shortDate=(day:string)=>new Date(day+'T12:00:00Z').toLocaleDateString(typeof document!=='undefined'&&document.documentElement.lang==='fr'?'fr-FR':'en-US',{month:'short',day:'numeric',timeZone:'UTC'});

// The wallet total counts up when Home opens and eases to new values after a refresh.
function CountUp({minor,currency}:{minor:number;currency:string}){
 const [shown,setShown]=useState(()=>typeof window!=='undefined'&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:minor);
 const from=useRef(shown);
 useEffect(()=>{
  let frame=0;const start=from.current,began=performance.now(),duration=start===0?900:400;
  const tick=(now:number)=>{const p=Math.min(1,(now-began)/duration),value=Math.round(start+(minor-start)*(1-Math.pow(1-p,3)));from.current=value;setShown(value);if(p<1)frame=requestAnimationFrame(tick);};
  frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);
 },[minor]);
 return <>{money(shown,currency)}</>;
}

// Slowly cycles through the summary cards whenever they overflow (always on phones; on wider screens only past three cards).
// Pauses while someone touches, hovers or focuses the strip, and stays still for reduced-motion users.
function useCardRotation(count:number){
 const strip=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  const el=strip.current;if(!el||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  let pausedUntil=0;const pause=()=>{pausedUntil=Date.now()+10000;};
  const events=['pointerdown','pointerenter','focusin','touchstart','wheel'] as const;events.forEach(n=>el.addEventListener(n,pause,{passive:true}));
  const timer=window.setInterval(()=>{
   if(document.hidden||Date.now()<pausedUntil||el.scrollWidth<=el.clientWidth+4)return;
   const cards=[...el.children] as HTMLElement[],at=el.scrollLeft,start=cards[0]?.offsetLeft||0;
   const next=cards.find(c=>c.offsetLeft-start>at+8);
   el.scrollTo({left:next&&el.scrollLeft+el.clientWidth<el.scrollWidth-4?next.offsetLeft-start:0,behavior:'smooth'});
  },4500);
  return()=>{window.clearInterval(timer);events.forEach(n=>el.removeEventListener(n,pause));};
 },[count]);
 return strip;
}

export default function FounderHub({org,entries,asOf,disabled,onNavigate,onOpen,onRecord}:{org:Org;entries:Entry[];asOf:string;disabled:boolean;onNavigate:(view:string)=>void;onOpen:(entry:Entry)=>void;onRecord:()=>void}){
 const summary=founderSummary(org,entries,asOf||undefined),checkpoint=org.cashCheckpoints?.at(-1),goal=currentGoal(org),progress=goal?goalProgress(goal,entries,org.id):null,pace=goal?goalWeekly(goal,org.members.length):null;
 const memberId=org.permissions?.memberId,nextDue=memberId&&org.members.some(m=>m.id===memberId)?memberStatement(org,entries,memberId).dues.find(d=>d.remaining>0):undefined;
 const alerts=duesAlerts(org,entries),cardCount=3+(alerts.behind.length?1:0)+(alerts.next?1:0),strip=useCardRotation(cardCount);
 const pending=entries.filter(e=>e.type==='contribution'&&e.status==='Awaiting verification'),opportunities=entries.filter(e=>e.type==='opportunity'),recent=entries.filter(e=>e.type==='contribution').slice(0,5);
 return <div className="founder-home">
  <section className="capital-hero" aria-labelledby="capital-title"><div className="capital-hero-copy"><span className="eyebrow">BUILDING TOGETHER</span><h2 id="capital-title">Small commitments.<br/>A bigger future.</h2><div className="hero-actions"><button className="secondary hero-record" disabled={disabled} onClick={()=>{if(!disabled)onRecord();}}><PaymentsIcon size={18}/>Record a payment</button>{nextDue&&<span className="hero-next-due">Next due <b>{money(nextDue.remaining,nextDue.entry.currency)}</b> · <time dateTime={nextDue.entry.date}>{shortDate(nextDue.entry.date)}</time></span>}<button type="button" className="hero-goals-link" disabled={disabled} onClick={()=>onNavigate('goals')}>Savings goals <ArrowUpRight size={14}/></button></div></div><div className="capital-total"><span><PaymentsIcon size={16}/>VERIFIED CONTRIBUTIONS · {org.currency}</span><strong><CountUp minor={summary.verified} currency={org.currency}/></strong><div className="capital-total-foot">{goal&&pace?<><span>Weekly to reach goal</span><b>{money(pace.group,goal.currency)}</b></>:<><span>Group weekly expectation</span>{summary.weekly===null?<b className="not-set">Not set yet</b>:<b>{money(summary.weekly*org.members.length,org.currency)}</b>}</>}</div></div></section>
  <div ref={strip} className={'hub-metrics'+(cardCount>3?' hub-metrics-more':'')}><section className="hub-metric metric-pending"><PendingIcon size={20}/><span>Awaiting verification</span><strong>{money(summary.pending,org.currency)}</strong><small>{pending.length} pending payment record{pending.length===1?'':'s'} · all currencies</small><button className="text-button" disabled={disabled} onClick={()=>onNavigate('contributions')}>View contributions <ArrowUpRight size={14}/></button></section><section className="hub-metric metric-spending"><SpendingIcon size={20}/><span>Reported spending</span><strong>{money(summary.spending,org.currency)}</strong><small>External payout reports, including fees.</small><button className="text-button" disabled={disabled} onClick={()=>onNavigate('statements')}>Group statement <ArrowUpRight size={14}/></button></section><section className="hub-metric metric-bank"><BankIcon size={20}/><span>Bank balance checkpoint</span><strong>{checkpoint?money(checkpoint.amountMinor,checkpoint.currency):'Not recorded'}</strong><small>{checkpoint?`Human checked · ${checkpoint.asOf}`:'Record a dated balance after checking the bank.'}</small><button className="text-button" disabled={disabled} onClick={()=>onNavigate('goals')}>{checkpoint?'View checkpoints':'Record a balance'} <ArrowUpRight size={14}/></button></section>
   {alerts.behind.length>0&&<section className="hub-metric metric-behind"><FoundersIcon size={20}/><span>Behind on dues</span><strong>{alerts.behind.length===1?alerts.behind[0].name:`${alerts.behind.length} founders`}</strong><small>{alerts.behind.length>1?alerts.behind.map(b=>b.name).join(', ')+' · ':''}{money(alerts.behindMinor,org.currency)} overdue</small><button className="text-button" disabled={disabled} onClick={()=>onNavigate('projects')}>See dues <ArrowUpRight size={14}/></button></section>}
   {alerts.next&&<section className="hub-metric metric-due"><ScheduleIcon size={20}/><span>Weekly contribution due</span><strong>{shortDate(alerts.next.date)}</strong><small>{alerts.next.paid} of {alerts.next.total} founders paid · {money(alerts.next.remainingMinor,org.currency)} still to come in</small><button className="text-button" disabled={disabled} onClick={()=>onNavigate('projects')}>View schedule <ArrowUpRight size={14}/></button></section>}</div>
  {summary.provisional>0&&<p className="hub-caption">{money(summary.provisional,org.currency)} in provisional owner-reconciled contributions is excluded from verified capital.</p>}
  <MemberOverview org={org} entries={entries} disabled={disabled} onStatement={()=>onNavigate('statements')} onSetup={()=>onNavigate('members')} onOpen={onOpen}/>
  <section className="panel savings-highlight"><div className="panel-header"><div><span className="eyebrow">SHARED DIRECTION</span><h2>{goal?.title||'Your first capital goal'}</h2></div><GoalIcon size={21}/></div><div className="hub-panel-body">{goal&&progress?<><div className="goal-big-number">{money(progress.verified,goal.currency)} <small>of {money(goal.targetMinor,goal.currency)}</small></div><progress max="100" value={progress.percent} aria-label={`${goal.title} contribution progress`}/><div className="goal-meta"><span>{progress.percent.toFixed(1)}% contributed</span><span>Target {goal.targetDate}</span></div>{pace&&<p className="goal-weekly"><strong>{money(pace.perFounder,goal.currency)}</strong> <span>per founder each week</span> · {money(pace.group,goal.currency)} <span>for the group</span> · {pace.weeks} <span>weeks</span>{goal.currency===org.currency&&summary.weekly!==null&&pace.perFounder!==summary.weekly&&<><br/><small><span>Scheduled weekly dues:</span> {money(summary.weekly,org.currency)} <span>per founder</span></small></>}</p>}<p>{goal.status==='Planning'?'Planning target':progress.onTrack?'On track against a straight-line contribution plan':'Behind the straight-line contribution plan'} · contributions since {goal.startDate}.</p></>:<><h3>Give your weekly commitments a destination.</h3><p>Create a shared savings target and explore how different contribution schedules could get you there.</p></>}<button className="secondary" disabled={disabled} onClick={()=>onNavigate('goals')}>{goal?'Open savings & planning':'Set the first goal'} <ArrowUpRight size={15}/></button><small className="hub-caption">Goal progress measures verified contributions. It does not reserve cash.</small></div></section>
  <div className="hub-two-column"><section className="panel"><div className="panel-header"><h2>Recent contributions</h2><button className="text-button" onClick={()=>onNavigate('contributions')}>View all <ArrowUpRight size={15}/></button></div>{recent.length?<div className="founder-list">{recent.map(entry=><button key={entry.id} className="recent-payment" disabled={disabled} onClick={()=>onOpen(entry)}><div><strong>{org.members.find(m=>m.id===entry.memberId)?.name||'Founder'}</strong><small>{entry.date} · {entry.title}</small></div><div><b>{money(entry.amountMinor,entry.currency)}</b><span className={'badge '+(entry.status==='Verified'?'green':entry.status==='Rejected'?'danger':'pending')}>{entry.status}</span></div></button>)}</div>:<div className="empty compact"><p>Your first payment will appear here after submission.</p></div>}</section><section className="hub-next"><button disabled={disabled} onClick={()=>onNavigate('opportunities')}><OpportunityIcon size={24}/><div><h3>Explore possibilities</h3><p>{opportunities.length?`${opportunities.length} ideas in your shared opportunity register.`:'Save a SaaS idea, property or business opportunity for discussion.'}</p></div><ArrowUpRight size={18}/></button><p className="hub-caption">Workspace loaded <RecordTime at={asOf}/> · forecasts and investment ideas are separate from actual funds.</p></section></div>
 </div>;
}
