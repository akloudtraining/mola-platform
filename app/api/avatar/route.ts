import {env} from 'cloudflare:workers';
import {workspaceIdentity} from '@/lib/workspace-identity';
import {database} from '@/lib/database';
import {accessFor,publicOrg} from '@/lib/access';
import type {Org} from '@/lib/model';
import {readImage,imageHeaders} from '@/lib/image-upload';
const fail=(error:string,status:number)=>Response.json({error},{status,headers:{'Cache-Control':'no-store'}});
// Founder profile photos (live workspace only). Any member of the organization may view; each founder replaces only their own.
export async function GET(req:Request){try{
 const user=await workspaceIdentity(req);if(!user)return fail('Sign in first.',401);
 const url=new URL(req.url),orgId=url.searchParams.get('orgId')||'',memberId=url.searchParams.get('memberId')||'';
 const row=await database().prepare('SELECT owner,data FROM organizations WHERE id=?').bind(orgId).first<{owner:string;data:string}>();if(!row)return fail('Photo unavailable.',404);
 const org:Org=JSON.parse(row.data),p=accessFor(org,row.owner,user);if(!p.isOwner&&!p.memberId)return fail('Photo unavailable.',404);
 const photo=org.members.find(m=>m.id===memberId)?.profile?.photo,bucket=(env as unknown as {BUCKET?:R2Bucket}).BUCKET;if(!photo||!bucket)return fail('Photo unavailable.',404);
 const object=await bucket.get(photo.key);if(!object)return fail('Photo unavailable.',404);
 // The URL carries the photo's version, so a private browser cache is safe and avoids refetching on every screen.
 return new Response(object.body,{headers:{...imageHeaders(photo.mime,'profile'),'Cache-Control':'private, max-age=86400'}});
}catch(error){console.error(error);return fail('Photo unavailable.',500);}}
export async function POST(req:Request){let orphan='';const bucket=(env as unknown as {BUCKET?:R2Bucket}).BUCKET;try{
 const user=await workspaceIdentity(req);if(!user)return fail('Sign in first.',401);
 if(req.headers.get('origin')!==new URL(req.url).origin)return fail('Invalid request origin.',403);
 if(!bucket)return fail('Photo storage unavailable. Please retry later.',503);
 const db=database(),orgId=new URL(req.url).searchParams.get('orgId')||'';
 const row=await db.prepare('SELECT owner,data,version FROM organizations WHERE id=?').bind(orgId).first<{owner:string;data:string;version:number}>();if(!row)return fail('Workspace unavailable.',404);
 const org:Org=JSON.parse(row.data),p=accessFor(org,row.owner,user),memberId=p.memberId;if(!memberId)return fail('Link your founder account before adding a photo.',403);
 const image=await readImage(req);if('error' in image)return fail(image.error,image.status);
 orphan=`avatars/live/${orgId}/${memberId}-${crypto.randomUUID()}`;
 await bucket.put(orphan,image.bytes,{httpMetadata:{contentType:image.mime}});
 const previous=org.members.find(m=>m.id===memberId)?.profile?.photo?.key;
 const next:Org={...org,version:row.version+1,members:org.members.map(m=>m.id===memberId?{...m,profile:{...m.profile,photo:{key:orphan,mime:image.mime,updatedAt:new Date().toISOString()}}}:m)};
 const result=await db.prepare('UPDATE organizations SET data=?,version=? WHERE id=? AND version=?').bind(JSON.stringify(next),next.version,orgId,row.version).run();
 if(!result.meta.changes){await bucket.delete(orphan);orphan='';return fail('This organization changed. Refresh before trying again.',409);}
 orphan='';if(previous)await bucket.delete(previous).catch(()=>{});
 return Response.json({organization:publicOrg(next,row.owner,user)},{headers:{'Cache-Control':'no-store'}});
}catch(error){console.error(error);if(orphan&&bucket)await bucket.delete(orphan).catch(()=>{});return fail('The photo could not be saved. Please retry.',500);}}
