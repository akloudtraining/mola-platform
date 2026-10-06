import {workspaceIdentity,hasEmailSession} from '@/lib/workspace-identity';
import {database} from '@/lib/database';
import {ledgerExport,type LedgerTables} from '@/lib/ledger-export';
import hosting from '@/.openai/hosting.json';
import {env} from 'cloudflare:workers';
const fail=(error:string,status:number)=>Response.json({error},{status,headers:{'Cache-Control':'no-store'}});
async function migrationAccess(req?:Request){
 const expected=(env as unknown as {MOLA_MIGRATION_EXPORT_TOKEN?:string}).MOLA_MIGRATION_EXPORT_TOKEN;
 const supplied=req?.headers.get('X-Mola-Migration-Export-Token');
 if(!expected||expected.length<64||!supplied||supplied.length>512)return false;
 const hashes=await Promise.all([expected,supplied].map(value=>crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))));
 const a=new Uint8Array(hashes[0]),b=new Uint8Array(hashes[1]);let different=0;for(let i=0;i<a.length;i++)different|=a[i]^b[i];return different===0;
}
export async function GET(req?:Request){try{
 const user=await workspaceIdentity(req);const serviceAllowed=!user&&!hasEmailSession(req)&&await migrationAccess(req);if(!user&&!serviceAllowed)return fail('Sign in first.',401);
 const db=database();
 // Batch reads share one database transaction. The original JSON text is retained.
 const results=await db.batch<Record<string,unknown>>([
  db.prepare('SELECT id,owner,data,version FROM organizations ORDER BY id'),
  db.prepare('SELECT id,org_id,data,created FROM entries ORDER BY id'),
  db.prepare('SELECT id,owner FROM installation ORDER BY id'),
  db.prepare('SELECT id,user_id,org_id,event_id,read_at FROM notification_reads ORDER BY id'),
 ]);
 const tables:LedgerTables={organizations:results[0].results,entries:results[1].results,installation:results[2].results,notification_reads:results[3].results};
 // The temporary service path also requires Sites dispatch authentication. Enable
 // its additional secret only for an owner-private, explicitly authorized migration.
 const owner=user?.userId||(serviceAllowed?tables.installation[0]?.owner:undefined);
 if(!owner||tables.installation.length!==1||tables.installation[0].owner!==owner||tables.organizations.some(row=>row.owner!==owner))return fail('Only the installation owner can export the complete ledger.',403);
 const snapshot=await ledgerExport(hosting.project_id,tables);
 return Response.json(snapshot,{headers:{'Cache-Control':'no-store','Content-Disposition':'attachment; filename="mola-ledger-'+snapshot.exportedAt.slice(0,10)+'.json"','X-Content-Type-Options':'nosniff'}});
 }catch{return fail('Export unavailable. Please retry.',503);}}
