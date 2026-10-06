import type {Org,Entry} from './model';
import {captureDeadline,type DeadlineRule} from './deadlines';
export type WeeklySchedule={deadlineRule?:DeadlineRule;startDate:string;rates:{effectiveDate:string;amountMinor:number}[];history:{at:string;actor:string;summary:string}[]};
export function validDate(s:unknown):s is string{return typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;}
export function rateOn(schedule:WeeklySchedule,date:string){return [...schedule.rates].filter(r=>r.effectiveDate<=date).sort((a,b)=>b.effectiveDate.localeCompare(a.effectiveDate))[0]?.amountMinor;}
export function previewWeeks(org:Org,existing:Entry[],from:string,weeks:number){
const schedule=org.weeklySchedule;if(!schedule||!validDate(from)||!Number.isInteger(weeks)||weeks<1||weeks>12)throw new Error('Choose a valid starting date and 1–12 weeks.');
const anchor=Date.parse(schedule.startDate),chosen=Date.parse(from),week=604800000;const first=anchor+Math.max(0,Math.ceil((chosen-anchor)/week))*week;
const records:Entry[]=[];let skipped=0;for(let i=0;i<weeks;i++){const date=new Date(first+i*week).toISOString().slice(0,10),amountMinor=rateOn(schedule,date);if(!amountMinor)throw new Error('No weekly rate applies to '+date);for(const member of org.members){if(existing.some(e=>e.type==='obligation'&&e.memberId===member.id&&e.currency===org.currency&&e.date===date)){skipped++;continue;}records.push({id:`${org.id}:weekly:${member.id}:${date}`,orgId:org.id,type:'obligation',title:'Weekly contribution · '+date,memberId:member.id,amountMinor,currency:org.currency,method:'Scheduled obligation',date,reference:'Weekly schedule',purpose:'Generated weekly due. Extra capital is not automatically applied.',status:'Recorded obligation',created:'',deadline:schedule.deadlineRule?captureDeadline(date,schedule.deadlineRule.time,schedule.deadlineRule.timeZone):undefined});}}
return {records,skipped,totalMinor:records.reduce((s,e)=>s+e.amountMinor,0),firstDate:new Date(first).toISOString().slice(0,10)};
}
