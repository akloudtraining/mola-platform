import {env} from 'cloudflare:workers';
import {workspaceIdentity} from '@/lib/workspace-identity';
import {database} from '@/lib/database';
import {accessFor,publicEntry} from '@/lib/access';
import {testDatabase,testIdentity,testOrgId} from '@/lib/test-workspace';
import type {Org,Entry} from '@/lib/model';
const fail=(error:string,status:number)=>Response.json({error},{status,headers:{'Cache-Control':'no-store'}});
const limit=3*1024*1024;
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
 const entry:Entry=JSON.parse(previous.data);if(entry.type!=='contribution')return fail('Only contributions support receipts.',400);
 if(!p.isOwner&&!p.canReview&&p.memberId!==entry.memberId)return fail('Only the contributor, owner and designated reviewers can see this receipt.',403);
 if(!bucket)return fail('Receipt storage unavailable. Please retry later.',503);
 if(req.method==='GET'){
  if(!entry.receipt)return fail('No receipt attached.',404);const object=await bucket.get(entry.receipt.key);if(!object)return fail('Receipt unavailable.',404);
  return new Response(object.body,{headers:{'Content-Type':entry.receipt.mime,'Content-Disposition':'inline; filename="contribution-receipt.'+(entry.receipt.mime==='image/png'?'png':'jpg')+'"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}});
 }
 if(!p.isOwner&&p.memberId!==entry.memberId)return fail('Only the contributor or owner can attach this receipt.',403);
 if(entry.receipt)return fail('A receipt is already attached. Refresh to view it.',409);
 if(entry.status!=='Awaiting verification')return fail('Receipts can only be attached while awaiting verification.',409);
 if(Number(req.headers.get('content-length'))>limit)return fail('Use a PNG or JPEG screenshot under 3 MB.',413);
 const reader=req.body?.getReader();if(!reader)return fail('Choose a screenshot.',400);let total=0;const chunks:Uint8Array[]=[];
 while(true){const part=await reader.read();if(part.done)break;total+=part.value.length;if(total>limit){await reader.cancel();return fail('Use a screenshot under 3 MB.',413);}chunks.push(part.value);}
 const bytes=new Uint8Array(total);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length;}
 const png=[137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b),jpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 const mime=png?'image/png':jpeg?'image/jpeg':'';if(!mime||total<16)return fail('Only PNG and JPEG screenshots are accepted.',400);
 orphan=`receipts/${session?'test/'+session:'live'}/${crypto.randomUUID()}`;
 await bucket.put(orphan,bytes,{httpMetadata:{contentType:mime}});
 const next:Entry={...entry,receipt:{key:orphan,mime,size:total,uploadedBy:user.userId,uploadedAt:new Date().toISOString()}};
 const changed=await db.prepare('UPDATE entries SET data=? WHERE id=? AND org_id=? AND data=? AND EXISTS (SELECT 1 FROM organizations WHERE id=? AND version=?)').bind(JSON.stringify(next),entryId,orgId,previous.data,orgId,row.version).run();
 if(!changed.meta.changes){await bucket.delete(orphan);orphan='';return fail('The contribution or permissions changed. Refresh before attaching a receipt.',409);}
 orphan='';return Response.json({entry:publicEntry(next,org,row.owner,user)},{headers:{'Cache-Control':'no-store'}});
 }catch(e){if(orphan&&bucket)await bucket.delete(orphan).catch(()=>{});console.error('Receipt request failed');return fail('Receipt action could not be confirmed. Refresh before retrying.',503);}}
