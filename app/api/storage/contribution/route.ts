import {parseMoney} from '@/lib/model';
import {validDate} from '@/lib/schedule';
import {requestIdentity} from '@/lib/supabase-session';
import {callSupabaseStorage,supabaseStorageConfigured} from '@/lib/supabase-storage';

export const dynamic='force-dynamic';

const fail=(error:string,status:number)=>Response.json({error},{status});

export async function POST(req:Request){
 try{
  const user=await requestIdentity(req);if(!user)return fail('Sign in with a Supabase member account first.',401);
  const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)return fail('Invalid request origin.',403);
  if(!supabaseStorageConfigured())return fail('The PostgreSQL contribution path is staged but the live ledger still uses D1.',409);
  let body:any;
  try{body=await req.json();}catch{return fail('Invalid contribution request.',400);}
  if(!body||typeof body!=='object'||Array.isArray(body))return fail('Invalid contribution request.',400);
  if(body.action!==undefined&&body.action!=='contribution')return fail('Unsupported contribution action.',400);
  const required=['orgId','submissionId','title','memberId','currency','amount','method','date','reference','purpose'];
  if(required.some(k=>typeof body[k]!=='string'))return fail('Complete the contribution details.',400);
  if(!body.title.trim()||body.title.length>180||body.reference.length>5000||body.purpose.length>5000||!['USD','CAD','XAF'].includes(body.currency)||!validDate(body.date)||!/^[a-f0-9-]{36}$/.test(body.submissionId))return fail('Check the contribution title, date, currency, and submission id.',400);
  if(!['Zelle (external)','Bank transfer (external)','Other external payment'].includes(body.method))return fail('Unsupported payment method.',400);
  let amountMinor:number;try{amountMinor=parseMoney(body.amount,body.currency);}catch(e){return fail((e as Error).message,400);}
  if(body.submissionObligationId!==undefined&&typeof body.submissionObligationId!=='string')return fail('Choose a valid obligation.',400);
  const submissionObligationId=typeof body.submissionObligationId==='string'&&body.submissionObligationId.trim()?body.submissionObligationId.trim():undefined;
  const result=await callSupabaseStorage(req,{operation:'submit_contribution',payload:{
   org_id:body.orgId.trim(),
   entry_id:body.orgId.trim()+':'+body.submissionId,
   title:body.title.trim(),
   member_id:body.memberId.trim(),
   amount_minor:amountMinor,
   currency:body.currency,
   method:body.method,
   date:body.date,
   reference:body.reference.trim(),
   purpose:body.purpose.trim(),
   ...(submissionObligationId?{submission_obligation_id:submissionObligationId}:{}),
  }});
  if(!result.ok)return fail(result.error||'Contribution was not recorded.',result.status);
  const data:any=result.data||{};
  return Response.json({entry:data.entry||null,changes:Number.isInteger(data.changes)?data.changes:0});
 }catch(e){console.error(e);return fail('Contribution was not recorded. Please retry.',503);}
}
