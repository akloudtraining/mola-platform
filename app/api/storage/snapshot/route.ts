import {requestIdentity} from '@/lib/supabase-session';
import {callSupabaseStorage,supabaseStorageConfigured} from '@/lib/supabase-storage';

export const dynamic='force-dynamic';

export async function GET(req:Request){
 try{
  const user=await requestIdentity(req);
  if(!user)return Response.json({error:'Sign in with a Supabase member account first.'},{status:401});
  if(!supabaseStorageConfigured())return Response.json({configured:false,backend:'d1',message:'The PostgreSQL boundary is installed but the live ledger still uses D1.'},{headers:{'Cache-Control':'no-store'}});
  const result=await callSupabaseStorage(req,{operation:'read'});
  if(!result.ok)return Response.json({error:result.error||'Storage unavailable.'},{status:result.status});
  const snapshot:any=result.data||{};
  return Response.json({configured:true,backend:'supabase',installation:snapshot.installation||null,organizationCount:Array.isArray(snapshot.organizations)?snapshot.organizations.length:0,entryCount:Array.isArray(snapshot.entries)?snapshot.entries.length:0,notificationReadCount:Array.isArray(snapshot.notification_reads)?snapshot.notification_reads.length:0},{headers:{'Cache-Control':'no-store'}});
 }catch(e){console.error(e);return Response.json({error:'Storage boundary unavailable.'},{status:503});}
}
