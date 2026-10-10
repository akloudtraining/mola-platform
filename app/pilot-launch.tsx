'use client';
import {useState,type ReactNode} from 'react';
import {CheckCircle2,ChevronRight,ClipboardList} from 'lucide-react';
import {Tabs,TabsList,TabsTrigger,TabsContent} from '@/components/ui/tabs';
import {Progress} from '@/components/ui/progress';
import type {Org,Entry} from '@/lib/model';
import {pilotLaunchSteps,type PilotStepId} from '@/lib/pilot-launch';

export default function PilotLaunch({org,entries,panels,disabled,onOpen}:{org:Org;entries:Entry[];panels:Record<PilotStepId,ReactNode>;disabled:boolean;onOpen:(view:string)=>void}){
 const steps=pilotLaunchSteps(org,entries);
 const [selected,setSelected]=useState<PilotStepId>(()=>steps.find(s=>!s.prepared)?.id||'owner');
 if(!org.permissions?.isOwner||org.mode!=='Shared ownership')return null;
 const prepared=steps.filter(s=>s.prepared).length,index=steps.findIndex(s=>s.id===selected);
 const choose=(id:string)=>{if(!disabled&&steps.some(s=>s.id===id))setSelected(id as PilotStepId);};
 return <div className="pilot-launch">
  <section className="panel pilot-launch-summary" aria-labelledby="pilot-launch-title"><div className="panel-header"><div><h2 id="pilot-launch-title"><ClipboardList size={20}/> Workspace setup checklist</h2><p className="muted">Review saved settings and open the page where each is managed.</p></div><span className="badge neutral">{prepared} of {steps.length} setup steps recorded</span></div><Progress value={prepared/steps.length*100} aria-label="Recorded pilot setup"/><p>{prepared===steps.length?'Group setup is recorded. Member access and each founder’s agreement acceptance remain separate.':'Complete the remaining setup at your own pace. You can return to any step.'}</p></section>
  <Tabs value={selected} onValueChange={choose} className="pilot-launch-tabs"><TabsList className="pilot-launch-steps" aria-label="Pilot setup steps">{steps.map((step,i)=><TabsTrigger key={step.id} value={step.id} disabled={disabled} className="pilot-launch-step"><span className="pilot-step-number">{step.prepared?<CheckCircle2 size={17}/>:i+1}</span><span><strong>{step.title}</strong><small>{step.prepared?'Recorded':step.action}</small></span></TabsTrigger>)}</TabsList>{steps.map(step=><TabsContent key={step.id} value={step.id}><p className="pilot-step-detail">{step.detail}</p>{panels[step.id]}</TabsContent>)}</Tabs>
  <div className="pilot-launch-actions"><button type="button" className="secondary" disabled={disabled||index===0} onClick={()=>choose(steps[index-1].id)}>Previous step</button>{index<steps.length-1?<button type="button" className="primary" disabled={disabled} onClick={()=>choose(steps[index+1].id)}>Next step <ChevronRight size={16}/></button>:<button type="button" className="primary" disabled={disabled} onClick={()=>onOpen('overview')}>Return to overview <ChevronRight size={16}/></button>}</div>
 </div>;
}
