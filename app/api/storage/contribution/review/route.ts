import {requestIdentity} from '@/lib/supabase-session';
import {callSupabaseStorage,supabaseStorageConfigured} from '@/lib/supabase-storage';

export const dynamic='force-dynamic';

const fail=(error:string,status:number)=>Response.json({error},{status});

export async function POST(req:Request){
 try{
  const user=await requestIdentity(req);if(!user)return fail('Sign in with a Supabase member account first.',401);
  const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)return fail('Invalid request origin.',403);
  if(!supabaseStorageConfigured())return fail('The PostgreSQL review path is staged but the live ledger still uses D1.',409);
  let body:any;
  try{body=await req.json();}catch{return fail('Invalid review request.',400);}
  if(!body||typeof body!=='object'||Array.isArray(body))return fail('Invalid review request.',400);
  if(typeof body.orgId!=='string'||typeof body.entryId!=='string'||!Number.isInteger(body.reviewCount)||body.reviewCount<0||body.reviewCount>100000||typeof body.outcome!=='string'||!['Owner reconciled','Verified','Rejected','Awaiting verification'].includes(body.outcome)||typeof body.evidence!=='string'||body.evidence.trim().length<5||body.evidence.length>2000)return fail('Provide a review outcome and evidence reference or correction reason.',400);
  if(body.obligationId!==undefined&&typeof body.obligationId!=='string')return fail('Choose a valid obligation.',400);
  const obligationId=typeof body.obligationId==='string'&&body.obligationId.trim()?body.obligationId.trim():undefined;
  if(body.creditMinor!==undefined&&(!Number.isSafeInteger(body.creditMinor)||body.creditMinor<=0||body.creditMinor>100000000000))return fail('Enter a valid credit amount in minor units.',400);
  const result=await callSupabaseStorage(req,{operation:'review_contribution',payload:{
   org_id:body.orgId.trim(),
   entry_id:body.entryId.trim(),
   review_count:body.reviewCount,
   outcome:body.outcome,
   evidence:body.evidence.trim(),
   obligation_id:obligationId||null,
   credit_minor:body.creditMinor===undefined?null:body.creditMinor,
  }});
  if(!result.ok)return fail(result.error||'Review was not recorded.',result.status);
  const data:any=result.data||{};
  return Response.json({entry:data.entry||null,changes:Number.isInteger(data.changes)?data.changes:0});
 }catch(e){console.error(e);return fail('Review was not recorded. Please retry.',503);}
}
