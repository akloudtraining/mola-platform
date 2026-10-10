import type {Org,Entry} from './model';
const day=86400000;
const iso=(date:Date)=>date.toISOString().slice(0,10);
function date(value:string){if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new Error('Choose a valid start date.');const result=new Date(value+'T00:00:00Z');if(!Number.isFinite(result.getTime())||iso(result)!==value)throw new Error('Choose a valid start date.');return result;}
export function addMonths(value:string,count:number){const start=date(value),month=new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+count,1)),last=new Date(Date.UTC(month.getUTCFullYear(),month.getUTCMonth()+1,0)).getUTCDate();month.setUTCDate(Math.min(start.getUTCDate(),last));return iso(month);}
const safe=(value:number)=>{if(!Number.isSafeInteger(value))throw new Error('This scenario exceeds the supported amount range.');return value;};
export type ScenarioInput={startDate:string;years:number;months:number;weeklyMinor:number;founders:number;growthPercent:number;growthTiming:'calendar'|'anniversary';collectionPercent:number;openingMinor:number;annualSpendingMinor:number};
export type ScenarioMonth={month:string;from:string;through:string;days:number;weeks:number;weeklyLow:number;weeklyHigh:number;plannedPerFounder:number;collectedPerFounder:number;planned:number;collected:number;spending:number;cumulative:number;paymentDates:string[]};
export type ScenarioYear={year:number;from:string;through:string;partial:boolean;weeks:number;weeklyLow:number;weeklyHigh:number;plannedPerFounder:number;collectedPerFounder:number;monthlyAveragePerFounder:number;monthlyAverage:number;planned:number;collected:number;spending:number;cumulative:number;months:ScenarioMonth[]};
export function calendarScenario(input:ScenarioInput){
 const {startDate,years,months,weeklyMinor,founders,growthPercent,growthTiming,collectionPercent,openingMinor,annualSpendingMinor}=input;
 const start=date(startDate),duration=years*12+months;
 if(!Number.isInteger(years)||years<0||years>10||!Number.isInteger(months)||months<0||months>11||duration<1||duration>120||!Number.isSafeInteger(weeklyMinor)||weeklyMinor<=0||!Number.isInteger(founders)||founders<1||founders>100||!Number.isFinite(growthPercent)||growthPercent<0||growthPercent>100||!['calendar','anniversary'].includes(growthTiming)||!Number.isFinite(collectionPercent)||collectionPercent<0||collectionPercent>100||!Number.isSafeInteger(openingMinor)||openingMinor<0||!Number.isSafeInteger(annualSpendingMinor)||annualSpendingMinor<0)throw new Error('Use 1 month to 10 years, 1–100 founders, positive weekly amounts and percentages from 0–100.');
 const end=date(addMonths(startDate,duration)),byMonth=new Map<string,ScenarioMonth>();
 for(let cursor=new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth(),1));cursor<end;cursor=new Date(Date.UTC(cursor.getUTCFullYear(),cursor.getUTCMonth()+1,1))){
  const next=new Date(Date.UTC(cursor.getUTCFullYear(),cursor.getUTCMonth()+1,1)),from=new Date(Math.max(start.getTime(),cursor.getTime())),until=new Date(Math.min(end.getTime(),next.getTime()));
  byMonth.set(iso(cursor).slice(0,7),{month:iso(cursor).slice(0,7),from:iso(from),through:iso(new Date(until.getTime()-day)),days:(until.getTime()-from.getTime())/day,weeks:0,weeklyLow:0,weeklyHigh:0,plannedPerFounder:0,collectedPerFounder:0,planned:0,collected:0,spending:0,cumulative:0,paymentDates:[]});
 }
 const rate=(payment:Date)=>{let exponent=payment.getUTCFullYear()-start.getUTCFullYear();if(growthTiming==='anniversary'&&iso(payment)<addMonths(startDate,exponent*12))exponent--;return safe(Math.round(weeklyMinor*(1+growthPercent/100)**Math.max(0,exponent)));};
 for(let time=start.getTime();time<end.getTime();time+=7*day){
  const payment=new Date(time),month=byMonth.get(iso(payment).slice(0,7))!,weekly=rate(payment),collected=safe(Math.round(weekly*collectionPercent/100));
  month.weeks++;month.paymentDates.push(iso(payment));month.weeklyLow=month.weeks===1?weekly:Math.min(month.weeklyLow,weekly);month.weeklyHigh=Math.max(month.weeklyHigh,weekly);month.plannedPerFounder=safe(month.plannedPerFounder+weekly);month.collectedPerFounder=safe(month.collectedPerFounder+collected);month.planned=safe(month.plannedPerFounder*founders);month.collected=safe(month.collectedPerFounder*founders);
 }
 const grouped=new Map<number,ScenarioMonth[]>();for(const month of byMonth.values()){const year=Number(month.month.slice(0,4));grouped.set(year,[...(grouped.get(year)||[]),month]);}
 let cumulative=openingMinor;const rows:ScenarioYear[]=[];
 for(const [year,yearMonths] of grouped){
  const yearDays=(Date.UTC(year+1,0,1)-Date.UTC(year,0,1))/day,coveredDays=yearMonths.reduce((sum,m)=>sum+m.days,0),spending=safe(Math.round(annualSpendingMinor*coveredDays/yearDays));
  // Allocate cents by cumulative day shares; monthly spending sums exactly to
  // the prorated year amount, including leap years and partial first/last years.
  let covered=0,allocated=0;
  for(const month of yearMonths){covered+=month.days;const toDate=safe(Math.round(spending*covered/coveredDays));month.spending=toDate-allocated;allocated=toDate;cumulative=safe(cumulative+month.collected-month.spending);month.cumulative=cumulative;}
  const sum=(key:'weeks'|'plannedPerFounder'|'collectedPerFounder'|'planned'|'collected')=>safe(yearMonths.reduce((total,m)=>total+m[key],0));
  const paid=yearMonths.filter(m=>m.weeks>0);
  rows.push({year,from:yearMonths[0].from,through:yearMonths.at(-1)!.through,partial:coveredDays<yearDays,weeks:sum('weeks'),weeklyLow:paid.length?Math.min(...paid.map(m=>m.weeklyLow)):0,weeklyHigh:paid.length?Math.max(...paid.map(m=>m.weeklyHigh)):0,plannedPerFounder:sum('plannedPerFounder'),collectedPerFounder:sum('collectedPerFounder'),monthlyAveragePerFounder:Math.round(sum('plannedPerFounder')/yearMonths.length),monthlyAverage:Math.round(sum('planned')/yearMonths.length),planned:sum('planned'),collected:sum('collected'),spending,cumulative,months:yearMonths});
 }
 return {startDate,endDate:iso(end),through:iso(new Date(end.getTime()-day)),years:rows,months:[...byMonth.values()],totalWeeks:rows.reduce((n,r)=>n+r.weeks,0),planned:safe(rows.reduce((n,r)=>n+r.planned,0)),collected:safe(rows.reduce((n,r)=>n+r.collected,0)),spending:safe(rows.reduce((n,r)=>n+r.spending,0)),cumulative,founders};
}
// Actuals use current verified status and payment dates within the selected
// calendar range. Pending, provisional, foreign-org/currency and future rows
// never enter these totals; forecasts never mutate dues or member records.
export function verifiedInPeriod(org:Org,entries:Entry[],from:string,through:string,memberId?:string,asOf=new Date().toISOString().slice(0,10)){
 return safe(entries.filter(e=>e.orgId===org.id&&e.type==='contribution'&&e.status==='Verified'&&e.currency===org.currency&&e.date>=from&&e.date<=through&&e.date<=asOf&&(!memberId||e.memberId===memberId)).reduce((n,e)=>n+e.amountMinor,0));
}
