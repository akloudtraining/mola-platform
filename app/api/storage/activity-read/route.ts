import {requestIdentity} from '@/lib/supabase-session';
import {callSupabaseStorage,supabaseStorageConfigured} from '@/lib/supabase-storage';
import {normalizeStorageSnapshot} from '@/lib/storage-reconcile';
import {validateStorageActivityEventIds} from '@/lib/storage-activity';

export const dynamic='force-dynamic';

const fail=(error:string,status:number)=>Response.json({error},{status,headers:{'Cache-Control':'no-store'}});

export async function POST(req:Request){
 try{
  const user=await requestIdentity(req);
  if(!user)return fail('Sign in with a Supabase member account first.',401);
  const origin=req.headers.get('origin');
  if(origin&&origin!==new URL(req.url).origin)return fail('Invalid request origin.',403);
  if(!supabaseStorageConfigured())return fail('The PostgreSQL activity path is staged but the live ledger still uses D1.',409);
  let body:any;
  try{body=await req.json();}catch{return fail('Invalid activity read request.',400);}
  if(!body||typeof body!=='object'||Array.isArray(body)||typeof body.orgId!=='string'||!Array.isArray(body.eventIds))return fail('Choose an organization and activity records.',400);
  const snapshot=await callSupabaseStorage(req,{operation:'read'});
  if(!snapshot.ok)return fail(snapshot.error||'PostgreSQL storage is unavailable.',snapshot.status);
  const validation=validateStorageActivityEventIds(normalizeStorageSnapshot(snapshot.data||{}),body.orgId.trim(),body.eventIds);
  if(!validation.ok)return fail(validation.error,validation.status);
  const result=await callSupabaseStorage(req,{operation:'mark_activity_read',payload:{org_id:body.orgId.trim(),event_ids:validation.ids}});
  if(!result.ok)return fail(result.error||'Activity state was not saved.',result.status);
  const data:any=result.data||{};
  return Response.json({readIds:validation.ids,inserted:Number.isInteger(data.inserted)?data.inserted:0},{headers:{'Cache-Control':'no-store'}});
 }catch(e){console.error('staged activity read failed',e);return fail('Activity read state is unavailable. Please retry.',503);}
}
