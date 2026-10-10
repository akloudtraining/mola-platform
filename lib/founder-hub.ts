import {type Org,type Entry,money,weeklyMinimum} from './model';
import {treasuryStatement} from './treasury-statement';
import {memberStatement} from './statements';

export type SavingsGoal={id:string;title:string;targetMinor:number;currency:string;startDate:string;targetDate:string;status:'Planning'|'Active'|'Archived';description:string;updated:string;history:{at:string;actorName:string;summary:string}[]};
export type CashCheckpoint={amountMinor:number;currency:string;asOf:string;accountLabel:string;note:string;recordedAt:string;recordedName:string};
export const opportunityStages=['Idea','Researching','Under review','Approved','Passed'] as const;
export const opportunityCategories=['SaaS','Real estate','Business acquisition','Other'] as const;
export type Opportunity={category:string;location:string;sourceUrl:string;risks:string;nextStep:string;revision:number;history:{at:string;actorName:string;stage:string}[]};
export function founderSummary(org:Org,entries:Entry[],asOf=new Date().toISOString()){
 const statement=treasuryStatement(org,entries,'','',asOf);
 const summary=statement.summaries.find(s=>s.currency===org.currency);
 const verified=summary?.verified||0,pending=summary?.pending||0,provisional=summary?.owner||0,spending=summary?.reportedSpending||0;
 const members=org.members.map(member=>memberStatement(org,entries,member.id,'','',asOf));
 return {verified,pending,provisional,spending,recordedMovement:verified-spending,weekly:weeklyMinimum(org),members,asOf};
}
export function forecast(input:{weeklyMinor:number;founders:number;years:number;growthPercent:number;collectionPercent:number;openingMinor:number;annualSpendingMinor:number}){
 const {weeklyMinor,founders,years,growthPercent,collectionPercent,openingMinor,annualSpendingMinor}=input;
 if(!Number.isSafeInteger(weeklyMinor)||weeklyMinor<=0||!Number.isInteger(founders)||founders<1||founders>100||!Number.isInteger(years)||years<1||years>10||!Number.isFinite(growthPercent)||growthPercent<0||growthPercent>100||!Number.isFinite(collectionPercent)||collectionPercent<0||collectionPercent>100||!Number.isSafeInteger(openingMinor)||openingMinor<0||!Number.isSafeInteger(annualSpendingMinor)||annualSpendingMinor<0)throw new Error('Check the scenario amounts, founder count, years and percentages.');
 let cumulative=openingMinor;
 return Array.from({length:years},(_,index)=>{const weekly=Math.round(weeklyMinor*(1+growthPercent/100)**index),planned=weekly*founders*52,collected=Math.round(planned*collectionPercent/100);cumulative+=collected-annualSpendingMinor;if(!Number.isSafeInteger(cumulative)||!Number.isSafeInteger(planned))throw new Error('This scenario exceeds the supported amount range.');return {year:index+1,weekly,planned,collected,spending:annualSpendingMinor,cumulative};});
}
export function goalProgress(goal:SavingsGoal,entries:Entry[],orgId:string,today=new Date().toISOString().slice(0,10)){
 const verified=entries.filter(e=>e.orgId===orgId&&e.type==='contribution'&&e.status==='Verified'&&e.currency===goal.currency&&e.date>=goal.startDate&&e.date<=today).reduce((n,e)=>n+e.amountMinor,0);
 const start=Date.parse(goal.startDate+'T00:00:00Z'),end=Date.parse(goal.targetDate+'T00:00:00Z'),now=Date.parse(today+'T00:00:00Z');
 const elapsed=Math.max(0,Math.min(1,(now-start)/Math.max(86400000,end-start))),planned=Math.round(goal.targetMinor*elapsed);
 return {verified,percent:Math.min(100,verified/goal.targetMinor*100),remaining:Math.max(0,goal.targetMinor-verified),planned,onTrack:verified>=planned};
}
// Construct facts explicitly: never pass the raw organization or entries to a model.
export function companyFacts(org:Org,entries:Entry[],asOf=new Date().toISOString()){
 const summary=founderSummary(org,entries,asOf),memberId=org.permissions?.memberId;
 const personal=memberId?memberStatement(org,entries,memberId,'','',asOf):null;
 return {asOf,organization:org.name,currency:org.currency,founderCount:org.members.length,weeklyPerFounder:money(summary.weekly,org.currency),weeklyGroup:money(summary.weekly*org.members.length,org.currency),verifiedContributions:money(summary.verified,org.currency),pendingContributions:money(summary.pending,org.currency),provisionalContributions:money(summary.provisional,org.currency),reportedSpending:money(summary.spending,org.currency),bankCheckpoint:org.cashCheckpoints?.at(-1)?{amount:money(org.cashCheckpoints.at(-1)!.amountMinor,org.currency),asOf:org.cashCheckpoints.at(-1)!.asOf,basis:'Human-checked historical report, not live cash'}:null,personal:personal?.summaries.map(s=>({currency:s.currency,verified:money(s.verified,s.currency),pending:money(s.pending,s.currency),remainingRecordedDues:s.dueCount?money(s.remaining,s.currency):'Not established',overdue:s.dueCount?money(s.overdue,s.currency):'Not established'}))||[],goals:(org.savingsGoals||[]).filter(g=>g.status!=='Archived').map(g=>({title:g.title,target:money(g.targetMinor,g.currency),start:g.startDate,date:g.targetDate,status:g.status,verifiedProgress:money(goalProgress(g,entries,org.id,asOf.slice(0,10)).verified,g.currency)})),decisions:entries.filter(e=>e.orgId===org.id&&e.type==='decision'&&e.status==='Adopted').slice(0,12).map(e=>({id:e.id,title:e.title,date:e.date,text:e.purpose.slice(0,2000)})),approvalRule:org.approvalPolicy?.requiredApprovals||null,limits:['Pending and provisional contributions are not verified capital.','Contribution totals are not cash, profit, ownership units or voting rights.','Remaining dues include explicit verified and provisional credits.','Scenario increases are not adopted weekly rates.','Opportunity approval is not spending authorization.']};
}
export function answerCompanyQuestion(org:Org,entries:Entry[],question:string,asOf=new Date().toISOString()){
 const facts=companyFacts(org,entries,asOf),q=question.toLowerCase();
 let answer:string,sources:{label:string;view:string;entryId?:string}[];
 if(/\b(my|i|me)\b/.test(q)&&/contribut|dues|owe|paid|overdue/.test(q)){
  answer=facts.personal.length?facts.personal.map(s=>`${s.currency}: verified contributions ${s.verified}; awaiting verification ${s.pending}; remaining recorded dues ${s.remainingRecordedDues}; overdue portion ${s.overdue}. Remaining dues include assigned provisional owner credits.`).join('\n'):'Your founder account has no personal contribution summary yet. Link your founder record or record the agreed dues first.';sources=[{label:'My member statement',view:'statements'}];
 }else if(/bank|cash|balance/.test(q)){
  answer=facts.bankCheckpoint?`The latest human-checked bank checkpoint reports ${facts.bankCheckpoint.amount} as of ${facts.bankCheckpoint.asOf}. This is a historical report, not a live bank connection.`:'No bank balance checkpoint has been recorded. Verified contribution totals alone do not establish available cash.';sources=[{label:'Bank balance checkpoints',view:'goals'}];
 }else if(/goal|track|saving|target/.test(q)){
  answer=facts.goals.length?facts.goals.map(g=>`${g.title}: ${g.verifiedProgress} verified contributions since ${g.start} against a ${g.target} target by ${g.date} (${g.status}). This tracks contributions, not cash reserved for the goal.`).join('\n'):'No shared savings target has been recorded. An owner can create the first capital fund goal.';sources=[{label:'Savings goals',view:'goals'}];
 }else if(/withdraw|approv|funding/.test(q)){
  answer=facts.approvalRule?`Funding requests require ${facts.approvalRule} distinct eligible approvers under the recorded policy. The requester cannot self-approve. Changes to the request require fresh approvals. Bank execution remains external.`:'No adopted approval threshold is available in this workspace. Check the funding policy before requesting a withdrawal.';sources=[{label:'Funding requests and approval policy',view:'requests'}];
 }else if(/decision|meeting|rule|vote|ownership/.test(q)){
  answer=facts.decisions.length?facts.decisions.map(d=>`${d.date} — ${d.title}: ${d.text}`).join('\n\n'):'No adopted decisions are recorded. Draft meeting notes and proposals do not establish adopted rules.';sources=facts.decisions.length?facts.decisions.map(d=>({label:d.title,view:'governance',entryId:d.id})):[{label:'Company decision register',view:'governance'}];
 }else if(/weekly|schedule|minimum/.test(q)){
  answer=`The current weekly minimum is ${facts.weeklyPerFounder} per founder, or ${facts.weeklyGroup} across ${facts.founderCount} founders. Future scenario increases do not change the agreed schedule.`;sources=[{label:'Agreed weekly contribution schedule',view:'projects'}];
 }else if(/total|capital|company|group|contribut/.test(q)){
  answer=`Verified contributions: ${facts.verifiedContributions}. Pending: ${facts.pendingContributions}. Provisional owner reconciliation: ${facts.provisionalContributions}. Reported external spending: ${facts.reportedSpending}. These amounts are distinct from a bank balance.`;sources=[{label:'Group treasury statement',view:'statements'}];
 }else {answer='I can answer questions about your contributions, group totals, savings goals, the weekly schedule, bank checkpoints and adopted decisions. Broader company questions need the optional AI connection. Internet opportunity research is a separate planned feature.';sources=[{label:'Founder Hub',view:'overview'}];}
 return {answer,sources,asOf,mode:'records' as string};
}
