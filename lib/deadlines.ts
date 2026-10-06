export type Deadline={at:string;localDateTime:string;timeZone:string};
export type DeadlineRule={time:string;timeZone:string};
export type DeadlineChange={at:string;actor:string;actorName:string;reason:string;previous?:Deadline;deadline:Deadline};
export function validTimeZone(zone:unknown):zone is string{
 if(typeof zone!=='string'||!zone||zone.length>100)return false;
 try{new Intl.DateTimeFormat('en-US',{timeZone:zone}).format(0);return true;}catch{return false;}
}
export function deadlineRule(time:unknown,timeZone:unknown):DeadlineRule{
 if(typeof time!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)||!validTimeZone(timeZone))throw new Error('Choose a cutoff time and a valid time zone.');
 return {time,timeZone};
}
function localClock(instant:number,zone:string){
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(instant);
 const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));
 return p.year.padStart(4,'0')+'-'+p.month+'-'+p.day+'T'+p.hour+':'+p.minute+':'+p.second;
}
export function captureDeadline(date:string,time:unknown,timeZone:unknown):Deadline|undefined{
 if(time===undefined&&timeZone===undefined)return undefined;
 const rule=deadlineRule(time,timeZone),localDateTime=date+'T'+rule.time,wanted=Date.parse(localDateTime+':00.000Z');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(wanted)||new Date(wanted).toISOString().slice(0,10)!==date)throw new Error('Choose a valid deadline date.');
 const offsets=new Set([-36,-12,0,12,36].map(h=>{const t=wanted+h*3600000;return Date.parse(localClock(t,rule.timeZone)+'Z')-t;}));
 const matches=[...offsets].map(offset=>wanted-offset).filter(t=>localClock(t,rule.timeZone)===localDateTime+':00');
 if(matches.length!==1)throw new Error(matches.length?'This cutoff repeats when the clocks change. Choose a different time.':'This cutoff does not exist when the clocks change. Choose a different time.');
 return {at:new Date(matches[0]).toISOString(),localDateTime,timeZone:rule.timeZone};
}
export function formatTimestamp(value:string,zone='UTC'){
 const at=Date.parse(value);if(!value||!Number.isFinite(at))return 'Timestamp not recorded';
 const timeZone=validTimeZone(zone)?zone:'UTC';
 return new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',second:'2-digit',timeZoneName:'short'}).format(at)+' ('+timeZone+')';
}
export function deadlineLabel(deadline?:Deadline){return deadline?formatTimestamp(deadline.at,deadline.timeZone):'Cutoff time not captured';}
export function obligationPastDue(entry:{date:string;deadline?:Deadline},asOf=new Date().toISOString()){
 if(entry.deadline){const at=Date.parse(asOf.length===10?asOf+'T00:00:00.000Z':asOf);return Number.isFinite(at)&&at>Date.parse(entry.deadline.at);}
 return entry.date<asOf.slice(0,10);
}
export function submissionTiming(entry:{created:string;submissionObligationId?:string;submissionDeadline?:Deadline}){
 if(!entry.submissionObligationId)return 'No obligation selected';
 if(!entry.submissionDeadline)return 'Cutoff time not captured';
 const recorded=Date.parse(entry.created),cutoff=Date.parse(entry.submissionDeadline.at);
 if(!Number.isFinite(recorded)||!Number.isFinite(cutoff))return 'Timestamp unavailable';
 return recorded<=cutoff?'On-time submission':'Late submission';
}
