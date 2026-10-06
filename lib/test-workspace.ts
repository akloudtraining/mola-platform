import type {Identity} from './access';
import {templates,type Org} from './model';
import type {database} from './database';
import {testRoles} from './test-workspace-options';
export {testRoles} from './test-workspace-options';
export function testIdentity(session:string,role:string):Identity|null{
 const member=testRoles.find(r=>r.id===role);return member?{userId:`test:${session}:${role}`,email:`${role}@example.invalid`,displayName:member.name}:null;
}
export const testOrgId=(session:string)=>`test:${session}:mola`;
export function testOrganization(session:string):Org{
 return {...templates[0],id:testOrgId(session),name:'Mola test workspace',members:testRoles.map(r=>({id:r.id,name:r.name,role:r.role,access:{email:`${r.id}@example.invalid`,userId:testIdentity(session,r.id)!.userId,enabled:true,canReview:r.canReview}})),approvalPolicy:{requiredApprovals:2,effectiveAt:new Date().toISOString(),version:1,approverMemberIds:['admin','reviewer','approver'],history:[]},accountLabel:'',accountHolder:'',agreement:''};
}
// The shared workflow receives only this restricted database adapter. It cannot
// address production tables; bootstrap is disabled for the test handler instance.
export function testDatabase(db:ReturnType<typeof database>):ReturnType<typeof database>{
 const tables:Record<string,string>={organizations:'test_organizations',entries:'test_entries',notification_reads:'test_notification_reads'};
 return {prepare(query:string){if(/\binstallation\b/.test(query))throw new Error('Test bootstrap is disabled');return db.prepare(query.replace(/\b(organizations|entries|notification_reads)\b/g,name=>tables[name]));},batch(statements:any[]){return db.batch(statements);}} as ReturnType<typeof database>;
}
