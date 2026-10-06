'use client';
import {useState} from 'react';
import {type Org,type Entry} from '@/lib/model';
import MemberStatements from './member-statements';
import TreasuryStatement from './treasury-statement';
export default function StatementsWorkspace(props:{org:Org;entries:Entry[];onOpen:(entry:Entry)=>void}){
 const [view,setView]=useState('member');
 if(props.org.mode!=='Shared ownership')return <MemberStatements {...props}/>;
 return <><div className="statement-switch" role="group" aria-label="Statement type"><button type="button" className="secondary" aria-pressed={view==='member'} onClick={()=>setView('member')}>Member statement</button><button type="button" className="secondary" aria-pressed={view==='group'} onClick={()=>setView('group')}>Group treasury statement</button></div>{view==='group'?<TreasuryStatement {...props}/>:<MemberStatements {...props}/>}</>;
}
