import {env} from 'cloudflare:workers';
import {workspaceIdentity} from '@/lib/workspace-identity';
import {database} from '@/lib/database';
import {workspaceHandlers} from '@/lib/workspace-handlers';
import {testRoles,testIdentity,testOrgId,testOrganization,testDatabase} from '@/lib/test-workspace';
export const dynamic='force-dynamic';
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
type TestSession={session:string;owner:string;created:string};
async function handle(req:Request){try{
 const user=await workspaceIdentity(req);if(!user)return reply({error:'Sign in as the workspace owner to use the test environment.'},401);
 const db=database(),installation=await db.prepare("SELECT owner FROM installation WHERE id='primary'").first<{owner:string}>();
 if(!installation||installation.owner!==user.userId)return reply({error:'Only the installation owner can use the test environment.'},403);
 if(req.method==='POST'&&req.headers.get('origin')!==new URL(req.url).origin)return reply({error:'Invalid request origin.'},403);
 const url=new URL(req.url),sessionId=url.searchParams.get('session');
 let session=await db.prepare("SELECT session,owner,created FROM test_workspace WHERE id='active'").first<TestSession>();
 if(session&&session.owner!==user.userId)return reply({error:'Test workspace ownership differs from this installation.'},403);
 if(sessionId!==null){
  if(!session||session.session!==sessionId)return reply({error:'This test workspace was deleted or replaced. Return to Test workspace to start again.'},410);
  const identity=testIdentity(session.session,url.searchParams.get('role')||'');if(!identity)return reply({error:'Choose one of the four test members.'},400);
  if(req.method==='POST'){
   const body:any=await req.clone().json();if(!body||body.orgId!==testOrgId(session.session))return reply({error:'Test actions must belong to this test workspace.'},403);
  }
  const handlers=workspaceHandlers(async()=>identity,()=>testDatabase(db),false);
  return req.method==='POST'?handlers.POST(req):handlers.GET(req);
 }
 if(req.method==='POST'){
  const body:any=await req.json();
  if(!body||typeof body!=='object')return reply({error:'Choose a test workspace action.'},400);
  if(body.action==='create'){
   if(!session){
    const id=crypto.randomUUID(),created=new Date().toISOString(),org=testOrganization(id);
    await db.batch([
     db.prepare("INSERT OR IGNORE INTO test_workspace (id,session,owner,created) VALUES ('active',?,?,?)").bind(id,user.userId,created),
     db.prepare("INSERT OR IGNORE INTO test_organizations (id,workspace_id,owner,data,version) SELECT ?,'active',?,?,1 WHERE EXISTS (SELECT 1 FROM test_workspace WHERE id='active' AND session=? AND owner=?)").bind(org.id,testIdentity(id,'admin')!.userId,JSON.stringify(org),id,user.userId)
    ]);
    session=await db.prepare("SELECT session,owner,created FROM test_workspace WHERE id='active'").first<TestSession>();
   }
  }else if(body.action==='delete'){
   if(body.confirmation!=='DELETE TEST WORKSPACE'||typeof body.session!=='string')return reply({error:'Type DELETE TEST WORKSPACE to confirm deletion of test records.'},400);
   if(session&&body.session!==session.session)return reply({error:'The test workspace changed. Refresh before deleting.'},409);
   if(!/^[a-f0-9-]{36}$/.test(body.session))return reply({error:'Invalid test session.'},400);
   await db.prepare("DELETE FROM test_workspace WHERE id='active' AND session=? AND owner=?").bind(body.session,user.userId).run();
   const bucket=(env as unknown as {BUCKET?:R2Bucket}).BUCKET;
   if(bucket){let cursor:string|undefined;do{const objects=await bucket.list({prefix:'receipts/test/'+body.session+'/',cursor});if(objects.objects.length)await bucket.delete(objects.objects.map(o=>o.key));cursor=objects.truncated?objects.cursor:undefined;}while(cursor);}
   return reply({workspace:null,deleted:true});
  }else return reply({error:'Unknown test workspace action.'},400);
 }
 return reply({workspace:session?{session:session.session,created:session.created}:null,roles:testRoles});
 }catch(e){console.error('Test workspace request failed',e);return reply({error:'The test workspace request could not be confirmed. Refresh before retrying.'},503);}}
export const GET=handle;
export const POST=handle;
