import {requestIdentity} from '@/lib/supabase-session';
import {callSupabaseStorage,supabaseStorageConfigured} from '@/lib/supabase-storage';
import {database} from '@/lib/database';
import {reconcileStorageSnapshots} from '@/lib/storage-reconcile';

export const dynamic='force-dynamic';
const fail=(error:string,status:number)=>Response.json({error},{status,headers:{'Cache-Control':'no-store'}});

export async function GET(req:Request){
 try{
  const user=await requestIdentity(req);
  if(!user)return fail('Sign in with a Supabase member account first.',401);
  if(!supabaseStorageConfigured())return Response.json({configured:false,backend:'d1',message:'The PostgreSQL boundary is staged; D1 remains authoritative.'},{status:409,headers:{'Cache-Control':'no-store'}});
  const db=database();
  const results=await db.batch<Record<string,unknown>>([
   db.prepare('SELECT id,owner,data,version FROM organizations ORDER BY id'),
   db.prepare('SELECT id,org_id,data,created FROM entries ORDER BY id'),
   db.prepare('SELECT id,owner FROM installation ORDER BY id'),
   db.prepare('SELECT id,user_id,org_id,event_id,read_at FROM notification_reads ORDER BY id'),
  ]);
  const installation=results[2].results;
  if(installation.length!==1||installation[0].owner!==user.userId)return fail('Only the installation owner can run reconciliation.',403);
  const d1Snapshot={installation,organizations:results[0].results,entries:results[1].results,notification_reads:results[3].results};
  const result=await callSupabaseStorage(req,{operation:'read'});
  if(!result.ok)return fail(result.error||'PostgreSQL storage is unavailable.',result.status);
  const comparison=await reconcileStorageSnapshots(d1Snapshot,result.data||{});
  return Response.json({configured:true,backend:'supabase',ownerVerified:true,...comparison},{headers:{'Cache-Control':'no-store'}});
 }catch(e){console.error('storage reconciliation failed',e);return fail('Storage reconciliation is unavailable. Please retry.',503);}
}
