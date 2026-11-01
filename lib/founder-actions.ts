import {type Org,type Entry,parseMoney} from './model';
import {type Identity,accessFor,publicOrg,publicEntry} from './access';
import {validDate} from './schedule';
import {type SavingsGoal,opportunityStages,opportunityCategories,answerCompanyQuestion,companyFacts} from './founder-hub';
import {env} from 'cloudflare:workers';
import {assistantConfig,assistantStatus,assistantModels,allowAI,allowedViews,buildMessages,cleanHistory,parseReply,runAssistant,AssistantUnavailable} from './assistant-ai';
import {assistantPages} from './assistant-search';
const fail=(error:string,status=400)=>Response.json({error},{status});
const text=(value:unknown,max=2000)=>typeof value==='string'&&value.length<=max;
const uuid=(value:unknown)=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export async function founderAction(x:any,org:Org,owner:string,version:number,user:Identity,db:D1Database):Promise<Response|null>{
 if(!['saveSavingsGoal','saveCashCheckpoint','saveOpportunity','askMola','assistantStatus'].includes(x.action))return null;
 if(org.mode!=='Shared ownership')return fail('This feature is available in Mola only.');
 const permissions=accessFor(org,owner,user),actorName=org.members.find(m=>m.id===permissions.memberId)?.name||'Workspace owner',at=new Date().toISOString();
 const saveOrg=async(next:Org)=>{const changed=await db.prepare('UPDATE organizations SET data=?,version=? WHERE id=? AND owner=? AND version=?').bind(JSON.stringify(next),version+1,org.id,user.userId,version).run();return changed.meta.changes?Response.json({organization:publicOrg(next,owner,user)}):fail('The workspace changed. Refresh before saving again.',409);};
 if(x.action==='assistantStatus')return Response.json(assistantStatus(assistantConfig(env as any)),{headers:{'Cache-Control':'no-store'}});
 if(x.action==='askMola'){
  if(!text(x.question,1000)||!x.question.trim())return fail('Enter a question of up to 1,000 characters.');
  const rows=await db.prepare('SELECT data FROM entries WHERE org_id=? ORDER BY created DESC').bind(org.id).all<{data:string}>();
  const entries=rows.results.map(r=>publicEntry(JSON.parse(r.data),org,owner,user)),visibleOrg=publicOrg(org,owner,user);
  const result=answerCompanyQuestion(visibleOrg,entries,x.question,at),config=assistantConfig(env as any),aiAvailable=config.provider!=='off';
  const json=(body:object)=>Response.json({...body,aiAvailable},{headers:{'Cache-Control':'no-store'}});
  // Without AI, or when it is unavailable, the calculated record answer is the answer.
  const recordsOnly=(notice?:string)=>json({...result,...(notice?{notice}:{})});
  if(x.useAI!==true)return recordsOnly();
  if(!aiAvailable)return recordsOnly('AI is not connected, so this is the record answer.');
  if(!allowAI(user.userId+':'+org.id))return recordsOnly('You have reached the AI limit for now, so this is the record answer. Try again in a minute.');
  const views=allowedViews(visibleOrg.permissions?.isOwner);
  // Facts are built field by field (never raw records); question and history are redacted before the model sees them.
  const messages=buildMessages({facts:companyFacts(visibleOrg,entries,at),recordAnswer:result.answer,question:x.question.trim(),history:cleanHistory(x.history),views});
  try{
   const reply=await runAssistant(env as any,config,messages),parsed=parseReply(reply.text,views);
   if(!parsed.text)return recordsOnly('AI returned no answer, so this is the record answer.');
   // Exact figures stay visible next to the explanation for money questions.
   const financial=/contribut|dues|owe|paid|overdue|balance|cash|bank|weekly|total|saving|target|goal|capital|cotis|dû|doi[st]|solde|banque|épargne|objectif/i.test(x.question);
   const pageSources=parsed.pages.map(view=>({label:assistantPages.find(p=>p.view===view)!.label,view}));
   const sources=[...pageSources,...result.sources.filter(s=>s.entryId||!parsed.pages.includes(s.view))].slice(0,6);
   return json({answer:parsed.text,sources,asOf:at,mode:'ai',model:assistantModels[reply.model]?.label||'Local test responder',...(financial?{records:{answer:result.answer,sources:result.sources}}:{})});
  }catch(e){return recordsOnly(e instanceof AssistantUnavailable&&e.quota?'The AI allowance is used up for now, so this is the record answer.':'AI is temporarily unavailable, so this is the record answer.');}
 }
 if(x.action==='saveSavingsGoal'){
  if(!permissions.isOwner)return fail('Only the workspace owner can edit shared savings goals.',403);
  if(x.version!==version)return fail('The workspace changed. Refresh before saving again.',409);
  if(!uuid(x.goalId)||!text(x.title,120)||!x.title.trim()||!text(x.description,2000)||!validDate(x.startDate)||!validDate(x.targetDate)||x.targetDate<=x.startDate||!['Planning','Active','Archived'].includes(x.status)||typeof x.amount!=='string')return fail('Provide a title, positive target and a target date after the start date.');
  let targetMinor:number;try{targetMinor=parseMoney(x.amount,org.currency);}catch(e){return fail((e as Error).message);}
  const old=org.savingsGoals?.find(g=>g.id===x.goalId);
  const goal:SavingsGoal={id:x.goalId,title:x.title.trim(),targetMinor,currency:org.currency,startDate:x.startDate,targetDate:x.targetDate,status:x.status,description:x.description.trim(),updated:at,history:[...(old?.history||[]),{at,actorName,summary:`${old?'Updated':'Created'} ${x.title.trim()}: ${x.amount} ${org.currency}, ${x.status}, ${x.startDate} to ${x.targetDate}. ${x.description.trim()}`}]};
  if(!old&&(org.savingsGoals?.length||0)>=30)return fail('Archive and reuse an existing goal; the workspace supports up to 30 goals.');
  return saveOrg({...org,version:version+1,savingsGoals:[goal,...(org.savingsGoals||[]).filter(g=>g.id!==goal.id)]});
 }
 if(x.action==='saveCashCheckpoint'){
  if(!permissions.isOwner)return fail('Only the workspace owner can record a bank checkpoint.',403);
  if(x.version!==version)return fail('The workspace changed. Refresh before saving again.',409);
  if(!text(x.amount,30)||!/^\d+(\.\d{1,2})?$/.test(x.amount)||!validDate(x.asOf)||x.asOf>at.slice(0,10)||!text(x.accountLabel,180)||!x.accountLabel.trim()||!text(x.note,1000)||x.note.trim().length<5||x.bankChecked!==true)return fail('Provide the balance date, account label and evidence note, and confirm you checked the bank.');
  let amountMinor:number;try{amountMinor=Number(x.amount)===0?0:parseMoney(x.amount,org.currency);}catch(e){return fail((e as Error).message);}
  const checkpoint={amountMinor,currency:org.currency,asOf:x.asOf,accountLabel:x.accountLabel.trim(),note:x.note.trim(),recordedAt:at,recordedName:actorName};
  return saveOrg({...org,version:version+1,cashCheckpoints:[...(org.cashCheckpoints||[]),checkpoint]});
 }
 if(!Number.isInteger(x.revision)||x.revision<0||!uuid(x.submissionId)||!text(x.title,180)||!x.title.trim()||!text(x.description,3000)||!text(x.location,180)||!text(x.risks,2000)||!text(x.nextStep,1000)||!text(x.sourceUrl,1500)||!text(x.amount,30)||!opportunityCategories.includes(x.category)||!opportunityStages.includes(x.stage))return fail('Check the opportunity title, category, stage and supporting details.');
 let sourceUrl='';if(x.sourceUrl){try{const url=new URL(x.sourceUrl);if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw new Error();sourceUrl=url.href;}catch{return fail('Use a public http or https source link without credentials.');}}
 let amountMinor=0;try{if(x.amount)amountMinor=parseMoney(x.amount,org.currency);}catch(e){return fail((e as Error).message);}
 const id=org.id+':opportunity:'+x.submissionId;
 const previous=await db.prepare('SELECT data FROM entries WHERE id=? AND org_id=?').bind(id,org.id).first<{data:string}>();
 const old:Entry|undefined=previous?JSON.parse(previous.data):undefined;
 if(old&&old.type!=='opportunity')return fail('This record is not an opportunity.',409);
 if(old&&!permissions.isOwner&&(old.submittedBy!==user.userId||!['Idea','Researching'].includes(old.status)))return fail('Only the author can edit early-stage ideas; later stages are managed by the owner.',403);
 if(!permissions.isOwner&&(!['Idea','Researching'].includes(x.stage)))return fail('Only the workspace owner can move an opportunity into review, approve or pass it.',403);
 if(!old&&(x.stage!=='Idea'||x.revision!==0))return fail('New opportunities start as ideas.');
 const details={category:x.category,location:x.location.trim(),sourceUrl,risks:x.risks.trim(),nextStep:x.nextStep.trim()};
 // The client retains the submission UUID across uncertain saves. Exact retries are harmless.
 if(old&&x.revision===0){if(old.submittedBy===user.userId&&old.title===x.title.trim()&&old.purpose===x.description.trim()&&old.amountMinor===amountMinor&&old.status===x.stage&&JSON.stringify(details)===JSON.stringify({category:old.opportunity?.category,location:old.opportunity?.location,sourceUrl:old.opportunity?.sourceUrl,risks:old.opportunity?.risks,nextStep:old.opportunity?.nextStep}))return Response.json({entry:publicEntry(old,org,owner,user)});return fail('This idea was already saved. Refresh before editing it.',409);}
 if(old&&old.opportunity?.revision!==x.revision)return fail('The opportunity changed. Refresh before saving again.',409);
 const entry:Entry={...(old||{}),id,orgId:org.id,type:'opportunity',title:x.title.trim(),memberId:old?.memberId||permissions.memberId,amountMinor,currency:org.currency,method:'',date:old?.date||at.slice(0,10),reference:'',purpose:x.description.trim(),status:x.stage,created:old?.created||at,submittedBy:old?.submittedBy||user.userId,submittedName:old?.submittedName||actorName,opportunity:{...details,revision:(old?.opportunity?.revision||0)+1,history:[...(old?.opportunity?.history||[]),{at,actorName,stage:x.stage}]}};
 const changed=old?await db.prepare('UPDATE entries SET data=? WHERE id=? AND org_id=? AND data=? AND EXISTS (SELECT 1 FROM organizations WHERE id=? AND version=?)').bind(JSON.stringify(entry),id,org.id,previous!.data,org.id,version).run():await db.prepare('INSERT OR IGNORE INTO entries (id,org_id,data,created) SELECT ?,?,?,? WHERE EXISTS (SELECT 1 FROM organizations WHERE id=? AND version=?)').bind(id,org.id,JSON.stringify(entry),at,org.id,version).run();
 if(!changed.meta.changes)return fail('The idea or member permissions changed. Refresh before saving again.',409);
 return Response.json({entry:publicEntry(entry,org,owner,user)});
}
