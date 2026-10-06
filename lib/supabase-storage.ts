import {env} from 'cloudflare:workers';
import {supabaseAccessToken} from './supabase-session';

type StorageRequest={operation:'read'|'submit_contribution'|'review_contribution'|'mark_activity_read';payload?:Record<string,unknown>};
type StorageResult={ok:boolean;status:number;data?:unknown;error?:string};

function config(){
 const url=String((env as any).SUPABASE_URL||'').trim().replace(/\/$/,'');
 const key=String((env as any).SUPABASE_PUBLISHABLE_KEY||'').trim();
 const functionUrl=String((env as any).SUPABASE_STORAGE_FUNCTION_URL||`${url}/functions/v1/mola-storage`).trim();
 return url&&key&&functionUrl?{key,functionUrl}:null;
}

export function supabaseStorageConfigured(){
 return String((env as any).MOLA_STORAGE_BACKEND||'d1').trim().toLowerCase()==='supabase'&&!!config();
}

export async function callSupabaseStorage(req:Request,body:StorageRequest):Promise<StorageResult>{
 const c=config();
 if(!c)return {ok:false,status:503,error:'PostgreSQL storage is not configured.'};
 const token=supabaseAccessToken(req);
 if(!token)return {ok:false,status:401,error:'A Supabase member session is required.'};
 try{
  const response=await fetch(c.functionUrl,{method:'POST',headers:{Authorization:`Bearer ${token}`,apikey:c.key,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data:any=await response.json().catch(()=>({}));
  if(!response.ok)return {ok:false,status:response.status,error:typeof data?.error==='string'?data.error:'PostgreSQL storage request failed.'};
  return {ok:true,status:response.status,data:data?.data};
 }catch(e){
  console.error(e);
  return {ok:false,status:503,error:'PostgreSQL storage is unavailable.'};
 }
}
