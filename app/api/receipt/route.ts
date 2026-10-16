import {env} from 'cloudflare:workers';
import {workspaceIdentity} from '@/lib/workspace-identity';
import {database} from '@/lib/database';
import {accessFor,publicEntry} from '@/lib/access';
import {testDatabase,testIdentity,testOrgId} from '@/lib/test-workspace';
import type {Org,Entry} from '@/lib/model';
import {notifyPaymentEvent} from '@/lib/notifications';
import {readImage,imageHeaders} from '@/lib/image-upload';
const fail=(error:string,status:number)=>Response.json({error},{status,headers:{'Cache-Control':'no-store'}});
export async function GET(req:Request){return handle(req);}
export async function POST(req:Request){return handle(req);}
async function handle(req:Request){let orphan='';const bucket=(env as unknown as {BUCKET?:R2Bucket}).BUCKET;try{
 let user=await workspaceIdentity(req);if(!user)return fail('Sign in first.',401);
 if(req.method==='POST'&&req.headers.get('origin')!==new URL(req.url).origin)return fail('Invalid request origin.',403);
 let db=database();const url=new URL(req.url),session=url.searchParams.get('session'),orgId=url.searchParams.get('orgId')||'',entryId=url.searchParams.get('entryId')||'';
 if(session!==null){
  const install=await db.prepare("SELECT owner FROM installation WHERE id='primary'").first<{owner:string}>();
  if(install?.owner!==user.userId)return fail('Only the installation owner can access test receipts.',403);
  const active=await db.prepare("SELECT session,owner FROM test_workspace WHERE id='active'").first<{session:string;owner:string}>();
  if(active?.session!==session||active.owner!==user.userId)return fail('Test workspace no longer available.',410);
  const actor=testIdentity(session,url.searchParams.get('role')||'');if(!actor||orgId!==testOrgId(session))return fail('Invalid test context.',403);user=actor;db=testDatabase(db);
 }
 const row=await db.prepare('SELECT owner,data,version FROM organizations WHERE id=?').bind(orgId).first<{owner:string;data:string;version:number}>();if(!row)return fail('Receipt unavailable.',403);
 const org:Org=JSON.parse(row.data),p=accessFor(org,row.owner,user);if(!p.isOwner&&!p.memberId)return fail('Receipt unavailable.',403);
 if(org.mode!=='Shared ownership')return fail('Receipt uploads are available for Mola only.',403);
 const previous=await db.prepare('SELECT data FROM entries WHERE id=? AND org_id=?').bind(entryId,orgId).first<{data:string}>();if(!previous)return fail('Receipt unavailable.',404);
 const entry:Entry=JSON.parse(previous.data);
 // Purchase receipts on payouts: every founder may view; the person who recorded the payout or the owner attaches it once.
 const payoutId=url.searchParams.get('payoutId');
 if(payoutId){
  if(entry.type!=='request')return fail('Receipt unavailable.',404);
  const payout=(entry.payouts||[]).find(x=>x.id===payoutId);if(!payout)return fail('Receipt unavailable.',404);
  if(!bucket)return fail('Receipt storage unavailable. Please retry later.',503);
  if(req.method==='GET'){if(!payout.receipt)return fail('No receipt attached.',404);const object=await bucket.get(payout.receipt.key);if(!object)return fail('Receipt unavailable.',404);return new Response(object.body,{headers:imageHeaders(payout.receipt.mime,'purchase-receipt')});}
  if(!p.isOwner&&payout.recordedBy!==user.userId)return fail('Only the person who recorded this payout or the owner can attach its receipt.',403);
  if(payout.void)return fail('This payout report was voided.',409);
  if(payout.receipt)return fail('A receipt is already attached. Refresh to view it.',409);
  const image=await readImage(req);if('error' in image)return fail(image.error,image.status);
  orphan=`receipts/${session?'test/'+session:'live'}/payouts/${crypto.randomUUID()}`;
  await bucket.put(orphan,image.bytes,{httpMetadata:{contentType:image.mime}});
  const next:Entry={...entry,payouts:(entry.payouts||[]).map(x=>x.id===payoutId?{...x,receipt:{key:orphan,mime:image.mime,size:image.total,uploadedBy:user.userId,uploadedAt:new Date().toISOString()}}:x)};
  const changed=await db.prepare('UPDATE entries SET data=? WHERE id=? AND org_id=? AND data=? AND EXISTS (SELECT 1 FROM organizations WHERE id=? AND version=?)').bind(JSON.stringify(next),entryId,orgId,previous.data,orgId,row.version).run();
  if(!changed.meta.changes){await bucket.delete(orphan);orphan='';return fail('The payout or permissions changed. Refresh before attaching a receipt.',409);}
  orphan='';return Response.json({entry:publicEntry(next,org,row.owner,user)},{headers:{'Cache-Control':'no-store'}});
 }
 if(entry.type!=='contribution')return fail('Only contributions support receipts.',400);
 if(!p.isOwner&&!p.canReview&&p.memberId!==entry.memberId)return fail('Only the contributor, owner and designated reviewers can see this receipt.',403);
 if(!bucket)return fail('Receipt storage unavailable. Please retry later.',503);
 if(req.method==='GET'){
  if(!entry.receipt)return fail('No receipt attached.',404);const object=await bucket.get(entry.receipt.key);if(!object)return fail('Receipt unavailable.',404);
  return new Response(object.body,{headers:imageHeaders(entry.receipt.mime,'contribution-receipt')});
 }
 if(!p.isOwner&&p.memberId!==entry.memberId)return fail('Only the contributor or owner can attach this receipt.',403);
 if(entry.receipt)return fail('A receipt is already attached. Refresh to view it.',409);
 if(!['Screenshot required','Awaiting verification'].includes(entry.status))return fail('Screenshots can only be attached before payment review.',409);
 const image=await readImage(req);if('error' in image)return fail(image.error,image.status);const {bytes,mime,total}=image;
 orphan=`receipts/${session?'test/'+session:'live'}/${crypto.randomUUID()}`;
 await bucket.put(orphan,bytes,{httpMetadata:{contentType:mime}});
 const uploadedAt=new Date().toISOString();
 const next:Entry={...entry,status:entry.status==='Screenshot required'?'Awaiting verification':entry.status,created:entry.status==='Screenshot required'?uploadedAt:entry.created,receipt:{key:orphan,mime,size:total,uploadedBy:user.userId,uploadedAt}};
 const changed=await db.prepare('UPDATE entries SET data=?,created=? WHERE id=? AND org_id=? AND data=? AND EXISTS (SELECT 1 FROM organizations WHERE id=? AND version=?)').bind(JSON.stringify(next),next.created,entryId,orgId,previous.data,orgId,row.version).run();
 if(!changed.meta.changes){await bucket.delete(orphan);orphan='';return fail('The contribution or permissions changed. Refresh before attaching a receipt.',409);}
 orphan='';
 // Attaching the screenshot completes the submission: tell every other founder (never for the test workspace).
 if(session===null&&entry.status==='Screenshot required')await notifyPaymentEvent('submitted',org,next,row.owner,user.userId,'','',url.origin);
 return Response.json({entry:publicEntry(next,org,row.owner,user)},{headers:{'Cache-Control':'no-store'}});
 }catch(e){if(orphan&&bucket)await bucket.delete(orphan).catch(()=>{});console.error('Receipt request failed');return fail('Receipt action could not be confirmed. Refresh before retrying.',503);}}
