import type {Org,Entry} from './model';
import {currentAgreement,acceptanceConsent} from './agreements';
import {memberReadiness,pilotSetupRows} from './pilot-setup';

export const pilotStepIds=['owner','reviewers','schedule','account','agreement','funding'] as const;
export type PilotStepId=(typeof pilotStepIds)[number];
export type PilotStep={id:PilotStepId;title:string;prepared:boolean;action:string;detail:string};

// Preparation reflects saved configuration. First sign-ins, bank verification,
// and individual agreement acceptance are deliberately separate observations.
export function pilotLaunchSteps(org:Org,entries:Entry[]):PilotStep[]{
 const rows=pilotSetupRows(org,entries),members=memberReadiness(org),agreement=currentAgreement(org,entries);
 const accepted=new Set(agreement?.agreement?.acceptances.filter(a=>org.members.some(m=>m.id===a.memberId)&&a.digest===agreement.agreement!.digest&&a.consent===acceptanceConsent).map(a=>a.memberId));
 const row=(id:string)=>rows.find(r=>r.id===id);
 return [
  {id:'owner',action:"Link your founder account",title:'Your founder account',prepared:!!org.permissions?.memberId,detail:org.permissions?.memberId?'Your account is linked to your founder entry.':'Choose your own founder entry using your signed-in account.'},
  {id:'reviewers',action:"Add founder emails & a reviewer",title:'Members & receipt review',prepared:members.independentReviewPrepared,detail:`${members.configured} member access entries configured · ${members.linked} accounts linked. Assign a contributor and a different receipt reviewer.`},
  {id:'schedule',action:"Set weekly dues & cutoff",title:'Weekly dues & cutoff',prepared:!!row('schedule')?.recorded,detail:row('schedule')?.detail||'Record the agreed weekly cycle.'},
  {id:'account',action:"Add account label & holder",title:'Collection account',prepared:!!row('account')?.recorded,detail:row('account')?.detail||'Record the agreed collection account.'},
  {id:'agreement',action:"Publish the member agreement",title:'Membership agreement',prepared:!!agreement,detail:agreement?`Version ${agreement.agreement!.revision} published · ${accepted.size} of ${org.members.length} founders accepted. Each founder accepts for themselves.`:'Publish the group’s actual agreement and decision reference.'},
  {id:'funding',action:"Set approvers & approval count",title:'Funding approvers',prepared:!!row('funding')?.recorded,detail:row('funding')?.detail||'Record the agreed internal approval rule.'}
 ];
}
