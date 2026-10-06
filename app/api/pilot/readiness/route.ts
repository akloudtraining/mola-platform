import {env} from 'cloudflare:workers';
import {workspaceIdentity} from '@/lib/workspace-identity';
import {database} from '@/lib/database';
import {pilotSetupRows} from '@/lib/pilot-setup';
import {checkEmailProvider,manualPilotChecks} from '@/lib/pilot-diagnostics';
import type {Org,Entry} from '@/lib/model';

export const dynamic='force-dynamic';
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export async function GET(req:Request){try{
 const user=await workspaceIdentity(req);if(!user)return reply({error:'Sign in to check pilot setup.'},401);
 const organizationId=new URL(req.url).searchParams.get('orgId');if(!organizationId)return reply({error:'Choose the Mola workspace.'},400);
 const db=database();
 const row=await db.prepare('SELECT owner,data,version FROM organizations WHERE id=?').bind(organizationId).first<{owner:string;data:string;version:number}>();
 if(!row||row.owner!==user.userId)return reply({error:'Only the organization owner can check pilot onboarding.'},403);
 const org:Org={...JSON.parse(row.data),version:row.version};
 if(org.mode!=='Shared ownership')return reply({error:'These onboarding checks apply to the Mola pilot.'},400);
 const member=org.members.find(m=>m.access?.enabled&&m.access.userId===user.userId);
 org.permissions={isOwner:true,memberId:member?.id||'',canManage:true,canReview:!!member?.access?.canReview,role:member?.role||'Workspace owner'};
 const agreements=await db.prepare("SELECT data FROM entries WHERE org_id=? AND json_extract(data,'$.type')='agreement'").bind(org.id).all<{data:string}>();
 const setup=pilotSetupRows(org,agreements.results.map(row=>JSON.parse(row.data) as Entry));
 const provider=await checkEmailProvider({url:String((env as any).SUPABASE_URL||'').trim(),key:String((env as any).SUPABASE_PUBLISHABLE_KEY||'').trim()});
 return reply({organizationId:org.id,organizationVersion:org.version,checkedAt:new Date().toISOString(),setup,provider,acceptance:manualPilotChecks(),callbacks:{confirmation:new URL('/auth?mode=confirmed',req.url).toString(),recovery:new URL('/auth?mode=reset',req.url).toString()}});
 }catch{return reply({error:'The pilot checks could not complete. Try again; no setup or acceptance status was changed.'},503);}}
