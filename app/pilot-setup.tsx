import {Check,ChevronRight} from 'lucide-react';
import type {Org,Entry} from '@/lib/model';
import {pilotSetupRows} from '@/lib/pilot-setup';

export default function PilotSetup({org,entries,onOpen}:{org:Org;entries:Entry[];onOpen:(view:string)=>void}){
 return <section className="panel"><div className="panel-header"><h2>Before the first cycle</h2><span className="badge neutral">Setup</span></div>{pilotSetupRows(org,entries).map(row=><button type="button" className="setup-row" key={row.id} onClick={()=>onOpen(row.view)}><span className={'setup-circle '+(row.recorded?'complete':'')}>{row.recorded&&<Check size={13}/>}</span><span>{row.title}<small>{row.detail}</small></span><ChevronRight size={15}/></button>)}<p className="setup-caption">These checks reflect saved setup. Browser and member sign-in testing are deferred; bank details and email delivery remain unverified.</p>{org.permissions?.isOwner&&<div className="pilot-setup-shortcut"><button type="button" className="primary" onClick={()=>onOpen('pilotsetup')}>Finish pilot setup <ChevronRight size={15}/></button></div>}</section>;
}
