import {receiptConfirmation} from './bank-receipt';
import {activityFor,type ActivityEvent} from '@/lib/activity';
import {fundingState,eligibleOfficer,currentApprovals} from '@/lib/funding';
import {payoutTotals,payoutToken,payoutInput,samePayout,type ExternalPayout} from '@/lib/payouts';
import {configuredPolicy} from '@/lib/approval-policy';
import {agreementDigest,acceptanceConsent,sameMemberName} from '@/lib/agreements';
import {founderSlotAvailable,founderNameMatches,validFounderName} from '@/lib/founder-link';
import {sameContributionSubmission} from '@/lib/contribution-submission';
import {validDate,previewWeeks} from '@/lib/schedule';
import {captureDeadline,deadlineRule} from '@/lib/deadlines';
import {workspaceIdentity} from '@/lib/workspace-identity';
import {database as liveDatabase} from '@/lib/database';
import {accessFor,normalizeEmail,publicOrg,publicEntry,canIndependentlyReview,canOwnerReconcile} from '@/lib/access';
import {templates,parseMoney,Org,Entry} from '@/lib/model';
import {env} from 'cloudflare:workers';

const fail=(error:string,status:number)=>Response.json({error},{status});
export function workspaceHandlers(currentUser=workspaceIdentity,database=liveDatabase,initialize=true){
async function GET(req:Request){try{
 const user=await currentUser(req);if(!user)return fail('Sign in to open your workspace.',401);const db=database();
 // Opening a workspace never clears records. Legacy Supabase IDs are only
 // relinked after Better Auth confirms the same email address.
 if(initialize){
 const configured=normalizeEmail(String((env as any).MOLA_OWNER_EMAIL||''));
 let previousInstallation=await db.prepare("SELECT owner FROM installation WHERE id='primary'").first<{owner:string}>();
 if(!previousInstallation){
  const existing=await db.prepare('SELECT owner FROM organizations ORDER BY id LIMIT 1').first<{owner:string}>();
  if(!existing&&(!user.emailVerified||!configured||normalizeEmail(user.email)!==configured))return fail('Workspace setup is awaiting the verified configured owner. Existing records have not been changed.',403);
  await db.prepare("INSERT OR IGNORE INTO installation (id,owner) SELECT 'primary', COALESCE((SELECT owner FROM organizations ORDER BY id LIMIT 1),?)").bind(user.userId).run();
  previousInstallation=await db.prepare("SELECT owner FROM installation WHERE id='primary'").first<{owner:string}>();
 }
 if(previousInstallation?.owner.startsWith('supabase:')&&user.emailVerified&&configured&&normalizeEmail(user.email)===configured){
  const legacyOwner=previousInstallation.owner;
  await db.prepare("INSERT OR IGNORE INTO auth_identity_links (id,legacy_user_id,auth_user_id,email,linked_at,purpose) VALUES (?,?,?,?,?,'owner')").bind(legacyOwner,legacyOwner,user.userId,normalizeEmail(user.email),new Date().toISOString()).run();
  const link=await db.prepare('SELECT auth_user_id FROM auth_identity_links WHERE legacy_user_id=?').bind(legacyOwner).first<{auth_user_id:string}>();
  if(link?.auth_user_id!==user.userId)return fail('This verified account does not match the saved owner link. Ask the workspace administrator to review the identity migration.',403);
  await db.batch([
   db.prepare("UPDATE installation SET owner=? WHERE id='primary' AND owner=?").bind(user.userId,legacyOwner),
   db.prepare('UPDATE organizations SET owner=? WHERE owner=?').bind(user.userId,legacyOwner),
  ]);
 }
 const install=await db.prepare("SELECT owner FROM installation WHERE id='primary'").first<{owner:string}>();
 if(install?.owner===user.userId)await db.batch(templates.map(o=>{const org={...o,id:user.userId+':'+o.id};return db.prepare('INSERT OR IGNORE INTO organizations (id,owner,data,version) VALUES (?,?,?,1)').bind(org.id,user.userId,JSON.stringify(org));}));
 }
 const candidates=await db.prepare("SELECT id,owner,data,version FROM organizations WHERE json_extract(data,'$.mode')='Shared ownership' AND (owner=? OR EXISTS (SELECT 1 FROM json_each(organizations.data,'$.members') m WHERE json_extract(m.value,'$.access.enabled')=1 AND (json_extract(m.value,'$.access.userId')=? OR (json_extract(m.value,'$.access.email')=? AND (json_extract(m.value,'$.access.userId') IS NULL OR (?=1 AND json_extract(m.value,'$.access.userId') LIKE 'supabase:%')))))) ORDER BY id DESC").bind(user.userId,user.userId,normalizeEmail(user.email),user.emailVerified?1:0).all<{id:string;owner:string;data:string;version:number}>();
 const organizations:Org[]=[],entries:Entry[]=[],activity:ActivityEvent[]=[];const activityAsOf=new Date().toISOString();
 for(const row of candidates.results){let org:Org={...JSON.parse(row.data),version:row.version};const claim=org.members.find(m=>m.access?.enabled&&m.access.email===normalizeEmail(user.email)&&(!m.access.userId||(user.emailVerified===true&&m.access.userId.startsWith('supabase:'))));
 if(claim){if(!user.emailVerified)return fail('Verify your email before linking it to a founding member record.',403);if(org.members.some(m=>m.access?.userId===user.userId&&m.id!==claim.id))return fail('This account is already linked to another member.',409);const legacyUserId=claim.access?.userId;if(legacyUserId?.startsWith('supabase:')){await db.prepare("INSERT OR IGNORE INTO auth_identity_links (id,legacy_user_id,auth_user_id,email,linked_at,purpose) VALUES (?,?,?,?,?,'member')").bind(legacyUserId,legacyUserId,user.userId,normalizeEmail(user.email),new Date().toISOString()).run();const link=await db.prepare('SELECT auth_user_id FROM auth_identity_links WHERE legacy_user_id=?').bind(legacyUserId).first<{auth_user_id:string}>();if(link?.auth_user_id!==user.userId)return fail('This verified email is already linked to a different account. Ask the workspace administrator to review the identity migration.',409);}const next={...org,version:row.version+1,members:org.members.map(m=>m.id===claim.id?{...m,access:{...m.access!,userId:user.userId}}:m),accessHistory:[...(org.accessHistory||[]),{at:new Date().toISOString(),actor:user.userId,memberId:claim.id,summary:legacyUserId?.startsWith('supabase:')?'Verified email linked this account to its existing member record':'Member signed in and linked their account'}]};const changed=await db.prepare('UPDATE organizations SET data=?,version=? WHERE id=? AND version=?').bind(JSON.stringify(next),next.version,org.id,row.version).run();if(!changed.meta.changes)return fail('Member setup changed. Please refresh.',409);org=next;}
 const permissions=accessFor(org,row.owner,user);if(!permissions.isOwner&&!permissions.memberId)continue;organizations.push(publicOrg(org,row.owner,user));const rows=await db.prepare('SELECT data FROM entries WHERE org_id=? ORDER BY created DESC').bind(org.id).all<{data:string}>();const own=rows.results.map(r=>publicEntry(JSON.parse(r.data),org,row.owner,user));entries.push(...own);if(org.mode==='Shared ownership'){const readRows=await db.prepare('SELECT event_id FROM notification_reads WHERE user_id=? AND org_id=?').bind(user.userId,org.id).all<{event_id:string}>();const read=new Set(readRows.results.map(r=>r.event_id));activity.push(...activityFor(org,own,activityAsOf).map(e=>({...e,read:read.has(e.id)})));}}
 if(!organizations.length)return fail('Your account has no active membership. Ask the workspace owner to configure your sign-in email and site access.',403);
 return Response.json({organizations,entries,activity,activityAsOf,name:user.displayName,email:user.email},{headers:{'Cache-Control':'no-store'}});
 }catch(e){console.error(e);return fail('Workspace unavailable. Please retry.',503);}}
async function POST(req:Request){try{
 const body:any=await req.json();const x:any=body;
 if(body?.action==='approveRequest'||body?.action==='reviseRequest'){
  const user=await currentUser(req);if(!user)return fail('Sign in first.',401);if(req.headers.get('origin')!==new URL(req.url).origin)return fail('Invalid request origin.',403);
  if(typeof body.orgId!=='string'||typeof body.entryId!=='string'||typeof body.token!=='string')return fail('Open the current funding request first.',400);
  const db=database();const row=await db.prepare('SELECT owner,data,version FROM organizations WHERE id=?').bind(body.orgId).first<{owner:string;data:string;version:number}>();if(!row)return fail('Organization unavailable.',403);
  const org:Org=JSON.parse(row.data),permissions=accessFor(org,row.owner,user);if(!permissions.isOwner&&!permissions.memberId)return fail('Organization unavailable.',403);if(org.mode!=='Shared ownership')return fail('Funding approvals are being piloted with Mola first.',400);
  const previous=await db.prepare('SELECT data FROM entries WHERE id=? AND org_id=?').bind(body.entryId,body.orgId).first<{data:string}>();if(!previous)return fail('Funding request unavailable.',404);
  const request=JSON.parse(previous.data) as Entry;if(request.type!=='request')return fail('Only funding requests support this action.',400);
  const state=fundingState(request,org,row.owner,user.userId);if(body.token!==state.token)return fail('This request changed. Close it and refresh before continuing.',409);
  const actorName=org.members.find(m=>m.id===permissions.memberId)?.name||'Workspace owner',at=new Date().toISOString();let next:Entry;
  if(body.action==='reviseRequest'){
   if(payoutTotals(request).count)return fail('Active external payment reports lock this request. Correct inaccurate reports or create a separate authorization for additional spending.',409);
   if(!state.canEdit)return fail('Only the requester or workspace owner can revise this request.',403);
   for(const key of ['title','currency','amount','date','reference','purpose','reason'])if(typeof body[key]!=='string'||body[key].length>(key==='purpose'?5000:key==='reason'?2000:180))return fail('Check the request details and revision reason.',400);
   if(!body.title.trim()||!body.reference.trim()||!body.purpose.trim()||body.reason.trim().length<5||!['USD','CAD','XAF'].includes(body.currency)||!validDate(body.date))return fail('Provide a title, recipient reference, purpose, date and revision reason.',400);
   let amountMinor:number;try{amountMinor=parseMoney(body.amount,body.currency);}catch(e){return fail((e as Error).message,400);}
   const history={at,actor:user.userId,actorName,reason:body.reason.trim(),title:request.title,amountMinor:request.amountMinor,currency:request.currency,reference:request.reference,purpose:request.purpose,date:request.date,revision:state.revision,approvals:request.approvals||[]};
   next={...request,title:body.title.trim(),amountMinor,currency:body.currency,date:body.date,reference:body.reference.trim(),purpose:body.purpose.trim(),requestRevision:state.revision+1,approvals:[],approvalSnapshot:undefined,status:'Draft',fundingHistory:[...(request.fundingHistory||[]),history]};
  }else{
   if(!eligibleOfficer(org,row.owner,user.userId))return fail('Only eligible designated approvers can approve funding requests.',403);
   if((request.submittedBy||row.owner)===user.userId)return fail('The requester cannot approve their own request.',403);
   if(!state.required||state.needsRestart)return fail('This request needs a fresh revision before approvals can be collected.',409);
   if(!request.reference.trim()||!request.purpose.trim())return fail('Add a recipient reference and purpose before collecting approvals.',400);
   if(state.approvedByMe||state.status==='Authorized')return Response.json({entry:publicEntry(request,org,row.owner,user)});
   const approvals=[...(request.approvals||[]),{actor:user.userId,actorName,memberId:permissions.memberId||undefined,at}];
   next={...request,approvals,approvalSnapshot:state.token,requestRevision:state.revision,status:'Awaiting approvals'};
   next.status=fundingState(next,org,row.owner,user.userId).status;
  }
  const changed=await db.prepare('UPDATE entries SET data=? WHERE id=? AND org_id=? AND data=? AND EXISTS (SELECT 1 FROM organizations WHERE id=? AND version=?)').bind(JSON.stringify(next),body.entryId,body.orgId,previous.data,body.orgId,row.version).run();
  if(!changed.meta.changes)return fail('The request or member permissions changed. Refresh before continuing.',409);return Response.json({entry:publicEntry(next,org,row.owner,user)});
 }
 const user=await currentUser(req);if(!user)return fail('Sign in first.',401);if(req.headers.get('origin')!==new URL(req.url).origin)return fail('Invalid request origin.',403);if(!x||typeof x.orgId!=='string')return fail('Choose an organization.',400);const db=database();const row=await db.prepare('SELECT owner,data,version FROM organizations WHERE id=?').bind(x.orgId).first<{owner:string;data:string;version:number}>();if(!row)return fail('Organization unavailable.',403);const org:Org=JSON.parse(row.data);const permissions=accessFor(org,row.owner,user);if(!permissions.isOwner&&!permissions.memberId)return fail('Organization unavailable.',403);
 const resultOrg=(next:Org)=>Response.json({organization:publicOrg(next,row.owner,user)});
 const resultEntry=(entry:Entry)=>Response.json({entry:publicEntry(entry,org,row.owner,user)});
 if(x.action==='collectionInstructions'){
  if(!permissions.isOwner)return fail('Only the workspace owner can update contribution instructions.',403);
  if(org.mode!=='Shared ownership')return fail('Contribution instructions are being piloted with Mola first.',400);
  if(!Number.isInteger(x.version)||x.version!==row.version)return fail('Organization setup changed. Close and reopen the instructions before saving.',409);
  if(typeof x.text!=='string'||x.text.length>3000||typeof x.reason!=='string'||x.reason.trim().length<5||x.reason.length>1000||x.acknowledged!==true)return fail('Provide instructions, a change reason and confirm the group can see these details.',400);
  const text=x.text.trim();if(text===(org.collectionInstructions?.text||''))return resultOrg({...org,version:row.version});
  const change={version:row.version+1,text,reason:x.reason.trim(),at:new Date().toISOString(),actor:user.userId,actorName:org.members.find(m=>m.id===permissions.memberId)?.name||'Workspace owner'};
  const next={...org,version:row.version+1,collectionInstructions:{text,history:[...(org.collectionInstructions?.history||[]),change]}};
  const changed=await db.prepare('UPDATE organizations SET data=?,version=? WHERE id=? AND owner=? AND version=?').bind(JSON.stringify(next),next.version,org.id,user.userId,row.version).run();
  if(!changed.meta.changes)return fail('Organization setup changed. Close and reopen the instructions before saving.',409);
  return resultOrg(next);
 }
 if(x.action==='recordPayout'||x.action==='voidPayout'){
  if(!permissions.isOwner)return fail('Only the workspace owner can record or correct an external payment report.',403);
  if(org.mode!=='Shared ownership')return fail('External payment reporting is being piloted with Mola first.',400);
  if(typeof x.entryId!=='string'||typeof x.token!=='string'||typeof x.payoutToken!=='string')return fail('Open the current funding request first.',400);
  const previous=await db.prepare('SELECT data FROM entries WHERE id=? AND org_id=?').bind(x.entryId,org.id).first<{data:string}>();
  if(!previous)return fail('Funding request unavailable.',404);
  const request=JSON.parse(previous.data) as Entry;if(request.type!=='request')return fail('Only funding requests support external payment reports.',400);
  const state=fundingState(request,org,row.owner,user.userId),actorName=org.members.find(m=>m.id===permissions.memberId)?.name||'Workspace owner',at=new Date().toISOString();
  let next:Entry,referenceKey='';
  if(x.action==='recordPayout'){
   if(typeof x.submissionId!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x.submissionId))return fail('Start a new external payment report.',400);
   if(x.acknowledged!==true)return fail('Confirm this records an external payment and does not send money.',400);
   let input:ReturnType<typeof payoutInput>;try{input=payoutInput(x,request.currency);}catch(e){return fail((e as Error).message,400);}
   const existing=request.payouts?.find(p=>p.id===x.submissionId);
   if(existing){if(!samePayout(existing,input,x.token))return fail('This report was already saved with different details. Refresh before recording another payment.',409);return resultEntry(request);}
   if(x.token!==state.token||x.payoutToken!==payoutToken(request))return fail('The request or payment history changed. Close it and refresh before continuing.',409);
   if(state.status!=='Authorized'||state.needsRestart)return fail('The current request must have all required internal approvals before recording an external payment.',409);
   if(input.amountMinor+input.feeMinor>payoutTotals(request).remaining)return fail('Payment plus fees exceeds the remaining authorized amount. A separate authorization is required for additional spending.',400);
   const payout:ExternalPayout={...input,id:x.submissionId,recordedAt:at,recordedBy:user.userId,recordedName:actorName,requestToken:state.token,authorization:{revision:state.revision,title:request.title,amountMinor:request.amountMinor,currency:request.currency,recipient:request.reference,purpose:request.purpose,required:state.required,approvals:currentApprovals(request,org,row.owner)}};
   next={...request,payouts:[...(request.payouts||[]),payout]};referenceKey=input.referenceKey;
  }else{
   if(typeof x.payoutId!=='string'||typeof x.reason!=='string'||x.reason.trim().length<5||x.reason.length>2000)return fail('Select a recorded payment and explain the reporting correction.',400);
   const payout=request.payouts?.find(p=>p.id===x.payoutId);if(!payout)return fail('External payment report unavailable.',404);
   if(payout.void){if(payout.void.reason!==x.reason.trim())return fail('This report was already voided with a different reason. Refresh the request.',409);return resultEntry(request);}
   if(x.token!==state.token||x.payoutToken!==payoutToken(request))return fail('The request or payment history changed. Close it and refresh before continuing.',409);
   next={...request,payouts:request.payouts!.map(p=>p.id===x.payoutId?{...p,void:{at,actor:user.userId,actorName,reason:x.reason.trim()}}:p)};
  }
  // One conditional write guards both stale state and duplicate active references across requests.
  const changed=await db.prepare("UPDATE entries SET data=? WHERE id=? AND org_id=? AND data=? AND EXISTS (SELECT 1 FROM organizations WHERE id=? AND version=?) AND (?='' OR NOT EXISTS (SELECT 1 FROM entries other, json_each(other.data,'$.payouts') p WHERE other.org_id=? AND json_extract(p.value,'$.referenceKey')=? AND json_extract(p.value,'$.void') IS NULL))").bind(JSON.stringify(next),request.id,org.id,previous.data,org.id,row.version,referenceKey,org.id,referenceKey).run();
  if(!changed.meta.changes)return fail('The request or permissions changed, or this transfer reference is already recorded. Refresh and check existing reports before retrying.',409);
  return resultEntry(next);
 }
 if(x.action==='publishAgreement'||x.action==='acceptAgreement'){
  if(org.mode!=='Shared ownership')return fail('Agreement acceptance is being piloted with Mola first.',400);
  if(x.action==='publishAgreement'){
   if(!permissions.canManage)return fail('Only the workspace owner can publish an agreement version.',403);
   if(typeof x.title!=='string'||!x.title.trim()||x.title.length>180||typeof x.body!=='string'||x.body.trim().length<10||x.body.length>20000||typeof x.decisionReference!=='string'||x.decisionReference.trim().length<5||x.decisionReference.length>500||x.acknowledged!==true||typeof x.submissionId!=='string'||!/^[a-f0-9-]{36}$/.test(x.submissionId))return fail('Review the saved draft, title and group decision reference, then confirm publication.',400);
   const title=x.title.trim(),decisionReference=x.decisionReference.trim();
   const id=org.id+':agreement:'+x.submissionId;
   const digest=await agreementDigest({title,body:x.body,decisionReference});
   const existing=await db.prepare('SELECT data FROM entries WHERE id=? AND org_id=?').bind(id,org.id).first<{data:string}>();
   if(existing){const entry:Entry=JSON.parse(existing.data);if(entry.type!=='agreement'||entry.agreement?.digest!==digest)return fail('This publication reference already belongs to different agreement text. Refresh before publishing.',409);return resultEntry(entry);}
   if(!Number.isInteger(x.version)||x.version!==row.version||x.body!==org.agreement)return fail('The working draft or organization changed. Close this form and review the current draft.',409);
   const versions=await db.prepare("SELECT data FROM entries WHERE org_id=? AND json_extract(data,'$.type')='agreement'").bind(org.id).all<{data:string}>();
   const revision=1+Math.max(0,...versions.results.map(r=>Number(JSON.parse(r.data).agreement?.revision)||0));
   if(!Number.isSafeInteger(revision))return fail('Agreement history needs review before another publication.',409);
   const at=new Date().toISOString(),actorName=org.members.find(m=>m.id===permissions.memberId)?.name||'Workspace owner';
   const entry:Entry={id,orgId:org.id,type:'agreement',title,memberId:permissions.memberId||'',amountMinor:0,currency:org.currency,method:'Membership agreement',date:at.slice(0,10),reference:decisionReference,purpose:'Published membership agreement',status:'Published',created:at,submittedBy:user.userId,submittedName:actorName,agreement:{revision,body:x.body,decisionReference,digest,publishedAt:at,publishedBy:user.userId,publishedName:actorName,acceptances:[]}};
   const next={...org,activeAgreementId:id,version:row.version+1};const nextData=JSON.stringify(next);
   const update=db.prepare('UPDATE organizations SET data=?,version=? WHERE id=? AND owner=? AND version=?').bind(nextData,next.version,org.id,user.userId,x.version);
   // The exact new organization snapshot prevents insertion after a lost version race.
   const insert=db.prepare('INSERT INTO entries (id,org_id,data,created) SELECT ?,?,?,? WHERE EXISTS (SELECT 1 FROM organizations WHERE id=? AND version=? AND data=?)').bind(id,org.id,JSON.stringify(entry),at,org.id,next.version,nextData);
   const results=await db.batch([update,insert]);
   if(!results[0].meta.changes||!results[1].meta.changes)return fail('The draft or member setup changed. Refresh before publishing.',409);
   return Response.json({entry:publicEntry(entry,next,row.owner,user),organization:publicOrg(next,row.owner,user)});
  }
  if(!permissions.memberId)return fail('Link your own enabled founder account before recording acceptance. The owner cannot accept for another founder.',403);
  if(typeof x.entryId!=='string'||typeof x.digest!=='string'||!/^[a-f0-9]{64}$/.test(x.digest)||typeof x.typedName!=='string'||!x.typedName.trim()||x.typedName.length>100||x.acknowledged!==true)return fail('Read this version, enter your own member name and confirm acceptance.',400);
  const previous=await db.prepare('SELECT data FROM entries WHERE id=? AND org_id=?').bind(x.entryId,org.id).first<{data:string}>();
  if(!previous)return fail('Agreement version unavailable.',404);const entry:Entry=JSON.parse(previous.data),agreement=entry.agreement;
  if(entry.type!=='agreement'||!agreement)return fail('Choose a published agreement version.',400);
  if(x.digest!==agreement.digest)return fail('The agreement content changed. Reopen the version before accepting.',409);
  const recorded=agreement.acceptances.find(a=>a.memberId===permissions.memberId);
  if(recorded){if(recorded.actor===user.userId)return resultEntry(entry);return fail('An acceptance is already recorded for this founder. Historical acceptance cannot be replaced by a different account.',409);}
  if(org.activeAgreementId!==entry.id||!Number.isInteger(x.version)||x.version!==row.version)return fail('A new version or member setup is available. Close this form and review it before accepting.',409);
  const member=org.members.find(m=>m.id===permissions.memberId)!;
  if(!sameMemberName(x.typedName,member.name))return fail('Enter your member name as shown in this workspace.',400);
  const acceptance={memberId:member.id,memberName:member.name,typedName:x.typedName.trim(),actor:user.userId,at:new Date().toISOString(),digest:agreement.digest,consent:acceptanceConsent};
  const next={...entry,agreement:{...agreement,acceptances:[...agreement.acceptances,acceptance]}};
  const changed=await db.prepare('UPDATE entries SET data=? WHERE id=? AND org_id=? AND data=? AND EXISTS (SELECT 1 FROM organizations WHERE id=? AND version=?)').bind(JSON.stringify(next),entry.id,org.id,previous.data,org.id,row.version).run();
  if(!changed.meta.changes)return fail('The agreement or member permissions changed. Refresh before accepting.',409);
  return resultEntry(next);
 }
 if(['weeklyMinimum','settings','member','memberAccess','linkOwnerFounder','obligation','decision','scheduleSetup','scheduleRate','schedulePreview','scheduleGenerate'].includes(x.action)&&!permissions.canManage)return fail('Only the workspace owner can change organization setup.',403);
 if(x.action==='linkOwnerFounder'){
  if(org.mode!=='Shared ownership')return fail('Founder linking is available for Mola.',400);
  if(!Number.isInteger(x.version)||typeof x.memberId!=='string'||typeof x.name!=='string'||!validFounderName(x.name)||x.acknowledged!==true)return fail('Choose your own founder slot, enter your name and confirm the account link.',400);
  const email=normalizeEmail(user.email||'');
  if(!email||email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return fail('Your signed-in account needs a valid email before it can be linked.',400);
  const member=org.members.find(m=>m.id===x.memberId);if(!member)return fail('Founder slot unavailable.',400);
  if(org.members.some(m=>m.id!==member.id&&(m.access?.userId===user.userId||normalizeEmail(m.access?.email||'')===email)))return fail('Your account or email is already assigned to a different founder. Review Members before linking.',409);
  if(member.access?.userId===user.userId&&member.access.enabled&&normalizeEmail(member.access.email)===email&&founderNameMatches(member.name,x.name))return resultOrg({...org,version:row.version});
  if(!founderSlotAvailable(member,email))return fail('This slot is assigned or has disabled access. Review its member configuration before linking.',409);
  if(member.role!=='Name pending'&&!founderNameMatches(member.name,x.name))return fail('Enter the name already recorded for this founder. Correct member details separately if needed.',400);
  if(x.version!==row.version)return fail('Member setup changed. Close this form, refresh and choose your slot again.',409);
  const next={...org,version:row.version+1,members:org.members.map(m=>m.id===member.id?{...m,name:x.name.trim(),role:m.role==='Name pending'?'Member':m.role,access:{email,enabled:true,canReview:m.access?.canReview||false,userId:user.userId}}:m),accessHistory:[...(org.accessHistory||[]),{at:new Date().toISOString(),actor:user.userId,memberId:member.id,summary:'Workspace owner linked their own founder account; membership enabled'}]};
  const changed=await db.prepare('UPDATE organizations SET data=?,version=? WHERE id=? AND owner=? AND version=?').bind(JSON.stringify(next),next.version,org.id,user.userId,x.version).run();
  if(!changed.meta.changes)return fail('Member setup changed. Refresh before linking.',409);
  return resultOrg(next);
 }
 if(x.action==='obligationDeadline'){
  if(!permissions.canManage)return fail('Only the workspace owner can record submission deadlines.',403);
  if(!Number.isInteger(x.version)||x.version!==row.version||typeof x.entryId!=='string'||!Number.isInteger(x.historyCount)||typeof x.deadlineAt!=='string')return fail('Refresh this obligation before setting its deadline.',409);
  if(typeof x.reason!=='string'||x.reason.trim().length<5||x.reason.length>2000)return fail('Provide a reason for the deadline change.',400);
  const previous=await db.prepare('SELECT data FROM entries WHERE id=? AND org_id=?').bind(x.entryId,org.id).first<{data:string}>();if(!previous)return fail('Obligation unavailable.',404);
  const due:Entry=JSON.parse(previous.data);if(due.type!=='obligation')return fail('Only obligations have submission deadlines.',400);
  if((due.deadlineHistory?.length||0)!==x.historyCount||(due.deadline?.at||'')!==x.deadlineAt)return fail('The cutoff changed. Refresh before saving.',409);
  let deadline;try{deadline=captureDeadline(due.date,x.deadlineTime,x.deadlineTimeZone);if(!deadline)throw new Error('Choose a cutoff time and time zone.');}catch(e){return fail((e as Error).message,400);}
  const next={...due,deadline,deadlineHistory:[...(due.deadlineHistory||[]),{at:new Date().toISOString(),actor:user.userId,actorName:org.members.find(m=>m.id===permissions.memberId)?.name||'Workspace owner',reason:x.reason.trim(),previous:due.deadline,deadline}]};
  const changed=await db.prepare('UPDATE entries SET data=? WHERE id=? AND org_id=? AND data=? AND EXISTS (SELECT 1 FROM organizations WHERE id=? AND version=?)').bind(JSON.stringify(next),due.id,org.id,previous.data,org.id,row.version).run();if(!changed.meta.changes)return fail('The obligation or permissions changed. Refresh and retry.',409);return resultEntry(next);
 }
 if(x.action==='scheduleDeadline'){
  if(!permissions.canManage)return fail('Only the workspace owner can set the weekly cutoff.',403);
  if(org.mode!=='Shared ownership'||!org.weeklySchedule)return fail('Set up Mola weekly dues first.',400);
  if(!Number.isInteger(x.version)||x.version!==row.version)return fail('The schedule changed. Refresh before saving.',409);
  if(typeof x.reason!=='string'||x.reason.trim().length<5||x.reason.length>2000)return fail('Provide a reason for the cutoff rule.',400);
  let rule;try{rule=deadlineRule(x.deadlineTime,x.deadlineTimeZone);}catch(e){return fail((e as Error).message,400);}
  const next={...org,version:row.version+1,weeklySchedule:{...org.weeklySchedule,deadlineRule:rule,history:[...org.weeklySchedule.history,{at:new Date().toISOString(),actor:user.userId,summary:'Future submission cutoff: '+rule.time+' '+rule.timeZone+'; '+x.reason.trim()}]}};
  const changed=await db.prepare('UPDATE organizations SET data=?,version=? WHERE id=? AND owner=? AND version=?').bind(JSON.stringify(next),next.version,org.id,user.userId,x.version).run();if(!changed.meta.changes)return fail('The schedule changed. Refresh and retry.',409);return resultOrg(next);
 }
 if(x.action==='approvalPolicy'){
  if(!permissions.canManage)return fail('Only the workspace owner can configure approval rules.',403);
  if(org.mode!=='Shared ownership')return fail('Approval rules are being configured for Mola first.',400);
  if(!Number.isInteger(x.version)||x.version!==row.version)return fail('Organization setup changed. Refresh before saving the rule.',409);
  let policy;try{policy=configuredPolicy(org,x,user.userId,org.members.find(m=>m.id===permissions.memberId)?.name||'Workspace owner',new Date().toISOString());}catch(e){return fail((e as Error).message,400);}
  const next={...org,approvalPolicy:policy,version:row.version+1};
  const changed=await db.prepare('UPDATE organizations SET data=?,version=? WHERE id=? AND owner=? AND version=?').bind(JSON.stringify(next),next.version,org.id,user.userId,x.version).run();if(!changed.meta.changes)return fail('Organization setup changed. Refresh before saving the rule.',409);return resultOrg(next);
 }
 if(x.action==='decision'){
  if(!permissions.canManage)return fail('Only the workspace owner can record governance decisions.',403);
  if(org.mode!=='Shared ownership')return fail('Governance decisions are being piloted with Mola first.',400);
  if(!Number.isInteger(x.version)||x.version!==row.version)return fail('Organization setup changed. Refresh before saving the decision.',409);
  if(typeof x.title!=='string'||!x.title.trim()||x.title.length>180||!['Valuation policy','Ownership units','Weighted voting','Reserved decision','Other governance'].includes(x.decisionType)||!['Draft','Proposed','Adopted','Superseded'].includes(x.decisionStatus)||!validDate(x.date)||typeof x.reference!=='string'||!x.reference.trim()||x.reference.length>500||typeof x.purpose!=='string'||x.purpose.trim().length<10||x.purpose.length>10000||typeof x.submissionId!=='string'||!/^[a-f0-9-]{36}$/.test(x.submissionId))return fail('Complete the decision title, type, date, reference, and text.',400);
  const memberId=permissions.memberId||org.members[0]?.id;if(!memberId)return fail('The organization has no founder slot.',400);const id=x.orgId+':decision:'+x.submissionId;const existing=await db.prepare('SELECT id FROM entries WHERE id=? AND org_id=?').bind(id,x.orgId).first();if(existing)return fail('This decision was already recorded. Refresh the register.',409);const entry={submittedBy:user.userId,submittedName:org.members.find(m=>m.id===permissions.memberId)?.name||'Workspace owner',id,orgId:x.orgId,type:'decision',decisionType:x.decisionType,title:x.title.trim(),memberId,amountMinor:0,currency:org.currency,method:'Governance decision',date:x.date,reference:x.reference.trim(),purpose:x.purpose.trim(),status:x.decisionStatus,created:new Date().toISOString()};const nextVersion=row.version+1;const reserve=db.prepare('UPDATE organizations SET version=? WHERE id=? AND owner=? AND version=?').bind(nextVersion,org.id,user.userId,row.version);const insert=db.prepare('INSERT OR IGNORE INTO entries (id,org_id,data,created) SELECT ?,?,?,? WHERE EXISTS (SELECT 1 FROM organizations WHERE id=? AND version=?)').bind(id,x.orgId,JSON.stringify(entry),entry.created,x.orgId,nextVersion);const results=await db.batch([reserve,insert]);if(!results[0].meta.changes||!results[1].meta.changes)return fail('Organization setup changed. Refresh and retry.',409);return resultEntry(entry);
 }
 if(x.action==='readActivity'){
if(org.mode!=='Shared ownership'||!Array.isArray(x.eventIds)||!x.eventIds.length||x.eventIds.length>100||!x.eventIds.every((id:unknown)=>typeof id==='string'&&id.length<500))return fail('Select up to 100 activity records.',400);
const rows=await db.prepare('SELECT data FROM entries WHERE org_id=?').bind(org.id).all<{data:string}>();const valid=new Set(activityFor(org,rows.results.map(r=>JSON.parse(r.data))).map(e=>e.id));const ids=[...new Set<string>(x.eventIds)];if(ids.some(id=>!valid.has(id)))return fail('Activity changed. Refresh before marking it read.',409);
const at=new Date().toISOString();await db.batch(ids.map(id=>db.prepare('INSERT OR IGNORE INTO notification_reads (id,user_id,org_id,event_id,read_at) VALUES (?,?,?,?,?)').bind(user.userId+':'+id,user.userId,org.id,id,at)));return Response.json({readIds:ids});}
if(x.action==='memberAccess'){
 if(org.mode!=='Shared ownership')return fail('Member access is being piloted with Mola first.',400);
 if(!Number.isInteger(x.version)||typeof x.name!=='string'||!x.name.trim()||x.name.length>100||typeof x.email!=='string'||x.email.length>254||typeof x.enabled!=='boolean'||typeof x.canReview!=='boolean'||!['Member','President','Treasurer','Secretary','Designated reviewer'].includes(x.role))return fail('Check the member details and permissions.',400);
 const member=org.members.find(m=>m.id===x.memberId);if(!member)return fail('Member unavailable.',400);const email=normalizeEmail(x.email);if((email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))||(x.enabled&&!email))return fail('Enabled access requires a valid sign-in email.',400);if(email&&org.members.some(m=>m.id!==member.id&&m.access?.email===email))return fail('That email is already assigned to another member.',409);
 const access={email,enabled:x.enabled,canReview:x.canReview,userId:member.access?.email===email?member.access?.userId:undefined};
 const next={...org,version:row.version+1,members:org.members.map(m=>m.id===member.id?{...m,name:x.name.trim(),role:x.role,access}:m),accessHistory:[...(org.accessHistory||[]),{at:new Date().toISOString(),actor:user.userId,memberId:member.id,summary:`Access ${x.enabled?'enabled':'disabled'}; role: ${x.role}; payment review: ${x.canReview?'allowed':'not allowed'}${member.access?.email!==email?'; sign-in email changed':''}`} ]};
 const changed=await db.prepare('UPDATE organizations SET data=?,version=? WHERE id=? AND owner=? AND version=?').bind(JSON.stringify(next),next.version,org.id,user.userId,x.version).run();if(!changed.meta.changes)return fail('Member setup changed. Refresh before saving.',409);return resultOrg(next);}
if(['scheduleSetup','scheduleRate','schedulePreview','scheduleGenerate'].includes(x.action)){
 if(org.mode!=='Shared ownership')return fail('Weekly schedules are available for Mola.',400);
 if(!Number.isInteger(x.version)||x.version!==row.version)return fail('The organization changed. Refresh and preview again.',409);
 if(x.action==='scheduleSetup'||x.action==='scheduleRate'){
 let amountMinor:number;try{amountMinor=parseMoney(x.amount,org.currency);}catch{return fail('Enter a valid weekly amount.',400);}
 if(!validDate(x.effectiveDate))return fail('Choose a valid effective date.',400);
 if(x.action==='scheduleSetup'&&org.weeklySchedule)return fail('A schedule already exists. Add a rate change instead.',409);
 if(x.action==='scheduleRate'&&!org.weeklySchedule)return fail('Set up the weekly schedule first.',400);
 if(org.weeklySchedule&&x.effectiveDate<org.weeklySchedule.startDate)return fail('The change cannot predate the first due date.',400);
 const existing=await db.prepare("SELECT data FROM entries WHERE org_id=? AND json_extract(data,'$.method')='Scheduled obligation' AND json_extract(data,'$.date')>=? LIMIT 1").bind(org.id,x.effectiveDate).first();
 if(existing)return fail('Obligations already exist on or after this date. Choose a date after the last generated cycle; existing dues cannot be repriced.',409);
 const previous=org.weeklySchedule;let cutoff=previous?.deadlineRule;if(x.action==='scheduleSetup'){try{cutoff=deadlineRule(x.deadlineTime,x.deadlineTimeZone);captureDeadline(x.effectiveDate,cutoff.time,cutoff.timeZone);}catch(e){return fail((e as Error).message,400);}}const rates=previous?[...previous.rates.filter(r=>r.effectiveDate!==x.effectiveDate),{effectiveDate:x.effectiveDate,amountMinor}]:[{effectiveDate:x.effectiveDate,amountMinor}];rates.sort((a,b)=>a.effectiveDate.localeCompare(b.effectiveDate));
 const next={...org,version:row.version+1,weeklySchedule:{startDate:previous?.startDate||x.effectiveDate,rates,deadlineRule:cutoff,history:[...(previous?.history||[]),{at:new Date().toISOString(),actor:user.userId,summary:`${previous?'Weekly rate updated':'Schedule started'}: ${amountMinor/100} ${org.currency} per member from ${x.effectiveDate}`} ]}};
 const changed=await db.prepare('UPDATE organizations SET data=?,version=? WHERE id=? AND owner=? AND version=?').bind(JSON.stringify(next),next.version,org.id,user.userId,x.version).run();if(!changed.meta.changes)return fail('Schedule changed. Refresh and retry.',409);return resultOrg(next);
 }
 if(!org.weeklySchedule?.deadlineRule)return fail('Set the weekly submission cutoff before generating new dues.',400);
 const es=await db.prepare('SELECT data FROM entries WHERE org_id=?').bind(org.id).all<{data:string}>();let preview;try{preview=previewWeeks(org,es.results.map(e=>JSON.parse(e.data)),x.from,x.weeks);}catch(e){return fail((e as Error).message,400);}
 const token=JSON.stringify({version:row.version,records:preview.records.map(e=>[e.id,e.amountMinor,e.deadline||null]),skipped:preview.skipped});
 if(x.action==='schedulePreview')return Response.json({preview:{...preview,token,version:row.version}});
 if(x.token!==token)return fail('The preview is out of date. Preview again before generating.',409);
 const created=new Date().toISOString();if(preview.records.length){const batchId=crypto.randomUUID();const reserve=db.prepare("UPDATE organizations SET data=json_set(data,'$.lastDuesBatch',?),version=version+1 WHERE id=? AND version=?").bind(batchId,org.id,row.version);const batch=preview.records.map(e=>{const entry={...e,created,submittedBy:user.userId,submittedName:'Workspace owner'};return db.prepare("INSERT OR IGNORE INTO entries (id,org_id,data,created) SELECT ?,?,?,? WHERE EXISTS (SELECT 1 FROM organizations WHERE id=? AND version=? AND json_extract(data,'$.lastDuesBatch')=?) AND NOT EXISTS (SELECT 1 FROM entries WHERE org_id=? AND json_extract(data,'$.type')='obligation' AND json_extract(data,'$.memberId')=? AND json_extract(data,'$.currency')=? AND json_extract(data,'$.date')=?)").bind(entry.id,org.id,JSON.stringify(entry),created,org.id,row.version+1,batchId,org.id,entry.memberId,entry.currency,entry.date);});const results=await db.batch([reserve,...batch]);if(!results[0].meta.changes)return fail('Schedule changed. Preview again.',409);return Response.json({generated:results.slice(1).reduce((n,r)=>n+(r.meta.changes||0),0)});}return Response.json({generated:0});
}
if(x.action==='weeklyMinimum'){
if(org.weeklySchedule)return fail('Use the schedule’s effective-dated rate changes to update this minimum.',409);
if(org.mode!=='Shared ownership')return fail('Weekly settings do not apply to this organization.',400);
if(!Number.isInteger(x.version)||typeof x.amount!=='string')return fail('Enter a weekly minimum.',400);
let amountMinor:number;try{amountMinor=parseMoney(x.amount,org.currency);}catch(e){return fail((e as Error).message,400);}
if(!Number.isSafeInteger(amountMinor*org.members.length))return fail('Amount exceeds the supported range.',400);
const next={...org,version:row.version+1,weeklyMinimumMinor:amountMinor,weeklyMinimumHistory:[...(org.weeklyMinimumHistory||[]),{previousMinor:org.weeklyMinimumMinor??10000,amountMinor,at:new Date().toISOString(),actor:user.userId}]};
const result=await db.prepare('UPDATE organizations SET data=?,version=? WHERE id=? AND owner=? AND version=?').bind(JSON.stringify(next),next.version,x.orgId,user.userId,x.version).run();if(!result.meta.changes)return fail('This organization changed. Refresh before saving again.',409);return resultOrg(next);}
if(x.action==='resubmitContribution'){
 if(typeof x.entryId!=='string'||!Number.isInteger(x.reviewCount)||typeof x.reason!=='string'||x.reason.trim().length<5||x.reason.length>2000)return fail('Explain what you corrected before resubmitting.',400);
 for(const key of ['title','memberId','currency','amount','method','date','reference','purpose','submissionObligationId'])if(typeof x[key]!=='string'||x[key].length>5000)return fail('Check the corrected contribution details.',400);
 if(!x.title.trim()||x.title.length>180||!['USD','CAD','XAF'].includes(x.currency)||!validDate(x.date)||!['Zelle (external)','Bank transfer (external)','Other external payment'].includes(x.method))return fail('Check the title, date, currency and payment method.',400);
 const previous=await db.prepare('SELECT data FROM entries WHERE id=? AND org_id=?').bind(x.entryId,x.orgId).first<{data:string}>();if(!previous)return fail('Payment unavailable.',404);
 const payment=JSON.parse(previous.data) as Entry;if(payment.type!=='contribution')return fail('Only rejected contributions can be corrected.',400);
 if(payment.status!=='Rejected')return fail('Only a rejected contribution can be edited and resubmitted.',409);
 if((payment.submittedBy||row.owner)!==user.userId)return fail('Only the original submitter can correct this contribution.',403);
 if(payment.memberId!==x.memberId)return fail('The contribution member cannot be changed. Record a separate contribution for another member.',400);
 if((payment.reviews||[]).length!==x.reviewCount)return fail('This payment changed. Close it and refresh before correcting it.',409);
 let amountMinor:number;try{amountMinor=parseMoney(x.amount,x.currency);}catch(e){return fail((e as Error).message,400);}
 let submissionDeadline,submissionObligationId:string|undefined,submissionTargetData:string|undefined;
 if(x.submissionObligationId){const target=await db.prepare('SELECT data FROM entries WHERE id=? AND org_id=?').bind(x.submissionObligationId,x.orgId).first<{data:string}>();const due=target?JSON.parse(target.data) as Entry:null;if(!due||due.type!=='obligation'||due.memberId!==payment.memberId||due.currency!==x.currency)return fail('The selected obligation must belong to the same member and currency.',400);submissionObligationId=due.id;submissionDeadline=due.deadline;submissionTargetData=target!.data;}
 const snapshot=(value:{title:string;memberId:string;amountMinor:number;currency:string;method:string;date:string;reference:string;purpose:string;submissionObligationId?:string;submissionDeadline?:any})=>({title:value.title,memberId:value.memberId,amountMinor:value.amountMinor,currency:value.currency,method:value.method,date:value.date,reference:value.reference,purpose:value.purpose,submissionObligationId:value.submissionObligationId,submissionDeadline:value.submissionDeadline});
 const updated=snapshot({title:x.title.trim(),memberId:payment.memberId,amountMinor,currency:x.currency,method:x.method,date:x.date,reference:x.reference.trim(),purpose:x.purpose.trim(),submissionObligationId,submissionDeadline});
 const at=new Date().toISOString(),actorName=org.members.find(m=>m.id===permissions.memberId)?.name||'Workspace owner';
 const next:Entry={...payment,...updated,depositKey:undefined,status:payment.receipt?'Awaiting verification':'Screenshot required',corrections:[...(payment.corrections||[]),{actor:user.userId,actorName,at,reason:x.reason.trim(),previous:snapshot(payment),updated}]};
 const changed=await db.prepare("UPDATE entries SET data=? WHERE id=? AND org_id=? AND data=? AND EXISTS (SELECT 1 FROM organizations WHERE id=? AND version=?) AND (?='' OR EXISTS (SELECT 1 FROM entries WHERE id=? AND org_id=? AND data=?))").bind(JSON.stringify(next),payment.id,org.id,previous.data,org.id,row.version,submissionObligationId||'',submissionObligationId||'',org.id,submissionTargetData||'').run();
 if(!changed.meta.changes)return fail('The contribution, obligation or permissions changed. Close it and refresh before resubmitting.',409);
 return resultEntry(next);
}
if(x.action==='review'){
if(typeof x.entryId!=='string'||!Number.isInteger(x.reviewCount)||!['Owner reconciled','Verified','Rejected','Awaiting verification'].includes(x.outcome)||typeof x.evidence!=='string'||x.evidence.trim().length<5||x.evidence.length>2000||typeof x.obligationId!=='string')return fail('Provide a review outcome and evidence reference or correction reason.',400);
const previous=await db.prepare('SELECT data FROM entries WHERE id=? AND org_id=?').bind(x.entryId,x.orgId).first<{data:string}>();if(!previous)return fail('Payment unavailable.',404);const payment=JSON.parse(previous.data);if(payment.type!=='contribution')return fail('Only contributions can be reviewed.',400);
if(!payment.receipt||payment.status==='Screenshot required')return fail('A payment screenshot is required before this contribution can be reviewed.',409);
const independent=canIndependentlyReview(org,row.owner,user,payment);const ownerReconcile=canOwnerReconcile(org,row.owner,user,payment);
if(x.outcome==='Verified'&&!independent)return fail('Verification requires a different authorized member. Contributors and submitters cannot verify their own payment.',403);
if(x.outcome==='Owner reconciled'&&!ownerReconcile)return fail('Owner reconciliation requires a different contributor and submitter, and cannot replace independent verification.',403);
if(!['Verified','Owner reconciled'].includes(x.outcome)&&!independent&&!ownerReconcile)return fail('A different authorized reviewer must make this correction.',403);
if((payment.reviews||[]).length!==x.reviewCount)return fail('This payment changed. Refresh before reviewing.',409);
let creditMinor=0;if(['Owner reconciled','Verified'].includes(x.outcome)&&x.obligationId){const target=await db.prepare('SELECT data FROM entries WHERE id=? AND org_id=?').bind(x.obligationId,x.orgId).first<{data:string}>();const due=target?JSON.parse(target.data):null;if(!due||due.type!=='obligation'||due.memberId!==payment.memberId||due.currency!==payment.currency)return fail('Credit requires the same member and currency. Record currency conversion separately when supported.',400);try{creditMinor=parseMoney(x.credit,payment.currency);}catch{return fail('Enter a valid credit amount.',400);}if(creditMinor>payment.amountMinor)return fail('Credit cannot exceed this payment.',400);}
let receipt;try{receipt=receiptConfirmation(org.mode==='Shared ownership'?payment.method:'',x.outcome,x.bankReference,x.bankConfirmed);}catch(e){return fail((e as Error).message,400);}
const review={bankReference:receipt.bankReference,outcome:x.outcome,evidence:x.evidence.trim(),actor:user.userId,actorName:org.members.find(m=>m.id===permissions.memberId)?.name||'Workspace owner',at:new Date().toISOString(),obligationId:['Owner reconciled','Verified'].includes(x.outcome)?x.obligationId:'',creditMinor};const next={...payment,depositKey:receipt.depositKey,status:x.outcome,reviews:[...(payment.reviews||[]),review]};const result=await db.prepare('UPDATE entries SET data=? WHERE id=? AND org_id=? AND data=? AND EXISTS (SELECT 1 FROM organizations WHERE id=? AND version=?) AND (? = \'\' OR NOT EXISTS (SELECT 1 FROM entries other WHERE other.org_id=? AND other.id<>? AND json_extract(other.data,\'$.depositKey\')=?))').bind(JSON.stringify(next),x.entryId,x.orgId,previous.data,x.orgId,row.version,receipt.depositKey,x.orgId,x.entryId,receipt.depositKey).run();if(!result.meta.changes)return fail('This payment changed or the bank deposit reference is already linked to another contribution. Refresh and check the receiving-bank reference.',409);return resultEntry(next);}
if(x.action==='settings'||x.action==='member'){if(!Number.isInteger(x.version))return fail('Invalid version.',400);let next={...org,version:row.version+1};if(x.action==='settings'){const keys=['accountLabel','accountHolder','accountLast4','recipientLabel','recipientCountry','recipientCurrency','recipientLast4','agreement'];for(const k of keys){if(typeof x[k]!=='string'||x[k].length>(k==='agreement'?20000:180))return fail('Invalid '+k,400);}for(const k of ['accountLast4','recipientLast4'])if(x[k]&&!/^\d{4}$/.test(x[k]))return fail('Use only the last four digits.',400);if(!['USD','CAD','XAF'].includes(x.recipientCurrency))return fail('Unsupported currency.',400);next={...next,...Object.fromEntries(keys.map(k=>[k,x[k]]))};}else{if(typeof x.name!=='string'||!x.name.trim()||x.name.length>100||!org.members.some((m:any)=>m.id===x.memberId))return fail('Provide a valid member name.',400);const previousMember=org.members.find(m=>m.id===x.memberId)!;next.members=org.members.map(m=>m.id===x.memberId?{...m,name:x.name.trim(),role:m.role==='Name pending'?'Founding member':m.role}:m);next.accessHistory=[...(org.accessHistory||[]),{at:new Date().toISOString(),actor:user.userId,memberId:x.memberId,summary:'Member name updated: '+previousMember.name+' → '+x.name.trim()}];}const result=await db.prepare('UPDATE organizations SET data=?,version=? WHERE id=? AND owner=? AND version=?').bind(JSON.stringify(next),next.version,x.orgId,user.userId,x.version).run();if(!result.meta.changes)return fail('This record changed elsewhere. Refresh before editing again.',409);return resultOrg(next);}
if(!['contribution','request','note','obligation'].includes(x.action))return fail('Unsupported action.',400);for(const k of ['title','memberId','currency','amount','method','date','reference','purpose','submissionId'])if(typeof x[k]!=='string'||x[k].length>5000)return fail('Invalid '+k,400);if(!x.title.trim()||x.title.length>180||!['USD','CAD','XAF'].includes(x.currency)||!/^\d{4}-\d{2}-\d{2}$/.test(x.date)||isNaN(Date.parse(x.date))||new Date(x.date).toISOString().slice(0,10)!==x.date||!/^[a-f0-9-]{36}$/.test(x.submissionId))return fail('Check title, date, and currency.',400);if(['contribution','obligation'].includes(x.action)&&!org.members.some((m:any)=>m.id===x.memberId))return fail('Choose a member.',400);if(x.action==='contribution'&&!permissions.isOwner&&x.memberId!==permissions.memberId)return fail('You can submit only your own contributions.',403);if(x.action==='contribution'&&!['Zelle (external)','Bank transfer (external)','Other external payment'].includes(x.method))return fail('Unsupported payment method.',400);if(x.action==='contribution'&&x.submissionObligationId!==undefined&&typeof x.submissionObligationId!=='string')return fail('Choose a valid obligation.',400);let amountMinor=0;try{if(x.action!=='note')amountMinor=parseMoney(x.amount,x.currency);}catch(e){return fail((e as Error).message,400);}
const intent={orgId:x.orgId,title:x.title.trim(),memberId:x.memberId,amountMinor,currency:x.currency,method:x.method,date:x.date,reference:x.reference,purpose:x.purpose,submissionObligationId:x.submissionObligationId||'',submittedBy:user.userId};
const submissionResult=(entry:Entry)=>entry.type!==x.action||(x.action==='contribution'&&!sameContributionSubmission(entry,intent))?fail('An earlier record was already saved from this form with different details, or its submitting account could not be matched. Check the recorded details before submitting another report.',409):resultEntry(entry);
const id=x.orgId+':'+x.submissionId;const existing=await db.prepare('SELECT data FROM entries WHERE id=? AND org_id=?').bind(id,x.orgId).first<{data:string}>();if(existing)return submissionResult(JSON.parse(existing.data));
let deadline,submissionDeadline,submissionObligationId:string|undefined,submissionTargetData:string|undefined;
if(x.action==='obligation'){try{deadline=captureDeadline(x.date,x.deadlineTime,x.deadlineTimeZone);if(!deadline)throw new Error('Choose a cutoff time and time zone.');}catch(e){return fail((e as Error).message,400);}}
if(x.action==='contribution'&&x.submissionObligationId){
 if(typeof x.submissionObligationId!=='string')return fail('Choose a valid obligation.',400);
 const target=await db.prepare('SELECT data FROM entries WHERE id=? AND org_id=?').bind(x.submissionObligationId,x.orgId).first<{data:string}>();const due:Entry|undefined=target?JSON.parse(target.data):undefined;
 if(!due||due.type!=='obligation'||due.memberId!==x.memberId||due.currency!==x.currency)return fail('The deadline must belong to this member and currency.',400);
 submissionObligationId=due.id;submissionDeadline=due.deadline;submissionTargetData=target!.data;
}
const entry={deadline,submissionDeadline,submissionObligationId,submittedBy:user.userId,submittedName:org.members.find(m=>m.id===permissions.memberId)?.name||'Workspace owner',id,orgId:x.orgId,type:x.action,title:x.title.trim(),memberId:x.memberId,amountMinor,currency:x.currency,method:x.method,date:x.date,reference:x.reference,purpose:x.purpose,status:x.action==='contribution'?'Screenshot required':x.action==='obligation'?'Recorded obligation':'Draft',created:new Date().toISOString()};await db.prepare('INSERT OR IGNORE INTO entries (id,org_id,data,created) SELECT ?,?,?,? WHERE EXISTS (SELECT 1 FROM organizations WHERE id=? AND version=?) AND (? IS NULL OR EXISTS (SELECT 1 FROM entries WHERE id=? AND org_id=? AND data=?))').bind(id,x.orgId,JSON.stringify(entry),entry.created,x.orgId,row.version,submissionTargetData??null,submissionObligationId||'',x.orgId,submissionTargetData??null).run();const saved=await db.prepare('SELECT data FROM entries WHERE id=? AND org_id=?').bind(id,x.orgId).first<{data:string}>();if(!saved)return fail('The obligation or permissions changed. Refresh before submitting again.',409);return submissionResult(JSON.parse(saved.data));
}catch(e){console.error(e);return fail('Not saved. Your form is still available; please retry.',503);}}

return {GET,POST};
}
