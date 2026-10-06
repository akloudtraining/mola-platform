import {formatTimestamp,deadlineLabel,submissionTiming} from '@/lib/deadlines';
import type {Entry} from '@/lib/model';
export function RecordTime({at,zone='UTC'}:{at:string;zone?:string}){
 return <time className="record-timestamp" dateTime={at||undefined} title={at||'Timestamp not recorded'}>{formatTimestamp(at,zone)}</time>;
}
export function DeadlineTime({entry}:{entry:Entry}){
 return entry.deadline?<RecordTime at={entry.deadline.at} zone={entry.deadline.timeZone}/>:<span className="muted">{deadlineLabel()}</span>;
}
export function SubmissionTiming({entry}:{entry:Entry}){
 const status=submissionTiming(entry);
 return <span className={'badge '+(status==='On-time submission'?'green':status==='Late submission'?'pending':'neutral')}>{status}</span>;
}
