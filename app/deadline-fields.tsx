'use client';
import {Select,SelectTrigger,SelectValue,SelectContent,SelectItem} from '@/components/ui/select';
import {captureDeadline,deadlineLabel} from '@/lib/deadlines';
export default function DeadlineFields({date,time,timeZone,onChange}:{date:string;time:string;timeZone:string;onChange:(time:string,timeZone:string)=>void}){
 const zones=[...new Set(['UTC','America/Detroit','America/New_York','America/Chicago','America/Los_Angeles','America/Toronto','Africa/Douala',timeZone].filter(Boolean))];
 let preview='Choose the cutoff time and time zone.';if(time){try{preview=deadlineLabel(captureDeadline(date,time,timeZone));}catch(e){preview=(e as Error).message;}}
 return <div className="deadline-fields"><div className="form-grid"><label className="field">Submission cutoff time<input required type="time" step={60} value={time} onChange={e=>onChange(e.target.value,timeZone)}/></label><label className="field">Deadline time zone<Select value={timeZone} onValueChange={zone=>onChange(time,zone)}><SelectTrigger className="choice" aria-label="Deadline time zone"><SelectValue/></SelectTrigger><SelectContent>{zones.map(zone=><SelectItem key={zone} value={zone}>{zone}</SelectItem>)}</SelectContent></Select></label></div><p className="form-note">Deadline on {date}: {preview} Submissions received by the cutoff are on time. Receipt verification remains separate.</p></div>;
}
