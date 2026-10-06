import type {Org,Entry} from './model';
import {acceptanceConsent,currentAgreement} from './agreements';
import {validDate} from './schedule';

export function memberReadiness(org:Org){
 const enabled=org.members.filter(m=>m.access?.enabled);
 const linked=enabled.filter(m=>m.access?.claimed||m.access?.userId);
 const reviewers=linked.filter(m=>m.access?.canReview);
 const configured=enabled.filter(m=>m.role!=='Name pending'&&m.name.trim()&&!/^Founder\s+\d+$/i.test(m.name.trim())&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m.access?.email||''));
 const emails=new Set(configured.map(m=>m.access!.email.trim().toLowerCase()));
 return {enabled:enabled.length,linked:linked.length,reviewers:reviewers.length,configured:configured.length,independentReviewPrepared:emails.size>=2&&configured.some(m=>m.access?.canReview),independentReviewConfigured:linked.length>=2&&reviewers.length>0};
}
export function designatedRuleRecorded(org:Org){
 const policy=org.approvalPolicy,ids=policy?.approverMemberIds;
 return !!policy&&Array.isArray(ids)&&Number.isInteger(policy.requiredApprovals)&&policy.requiredApprovals>=2&&policy.requiredApprovals<org.members.length&&ids.length>=policy.requiredApprovals&&new Set(ids).size===ids.length&&ids.every(id=>org.members.some(m=>m.id===id));
}
export function pilotSetupRows(org:Org,entries:Entry[]){
 const members=memberReadiness(org),current=currentAgreement(org,entries);
 const accepted=new Set(current?.agreement?.acceptances.filter(a=>org.members.some(m=>m.id===a.memberId)&&a.digest===current.agreement!.digest&&a.consent===acceptanceConsent).map(a=>a.memberId));
 const schedule=org.weeklySchedule;
 const scheduled=!!schedule&&validDate(schedule.startDate)&&!!schedule.deadlineRule&&schedule.rates.length>0&&schedule.rates.every(r=>validDate(r.effectiveDate)&&Number.isSafeInteger(r.amountMinor)&&r.amountMinor>0);
 return [
  ...(org.permissions?.isOwner?[{id:'owner',view:'members',title:'Link your own founder account',recorded:!!org.permissions.memberId,detail:org.permissions.memberId?'Your founder account is linked':'Choose your founder slot and use your sign-in email'}]:[]),
  {id:'reviewers',view:'members',title:'Configure independent receipt review',recorded:members.independentReviewConfigured,detail:`${members.linked} accounts linked · ${members.reviewers} active reviewers`},
  {id:'schedule',view:'members',title:'Record weekly dues and cutoff',recorded:scheduled,detail:scheduled?`Schedule begins ${schedule!.startDate} · ${schedule!.deadlineRule!.time} ${schedule!.deadlineRule!.timeZone}`:'Agree the first due date, rate, cutoff and time zone'},
  {id:'account',view:'accounts',title:'Record the collection account',recorded:!!org.accountLabel.trim()&&!!org.accountHolder.trim(),detail:org.accountLabel&&org.accountHolder?'Labels recorded · bank ownership still needs verification':'Record the account label and holder after bank setup'},
  {id:'agreement',view:'agreements',title:'Review membership agreement',recorded:!!current&&accepted.size===org.members.length,detail:current?`Version ${current.agreement!.revision} · ${accepted.size} of ${org.members.length} founders accepted`:org.agreement.trim()?'Working draft saved · no published version':'Prepare the group’s agreed text for member review'},
  {id:'funding',view:'requests',title:'Record funding approvers',recorded:designatedRuleRecorded(org),detail:designatedRuleRecorded(org)?`${org.approvalPolicy!.requiredApprovals} approvals required · ${org.approvalPolicy!.approverMemberIds!.length} designated founders`:'Needed before testing funding authorization'}
 ];
}
