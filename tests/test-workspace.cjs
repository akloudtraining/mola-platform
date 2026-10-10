// Owner-private acceptance regression. No network or production data access.
// Run: node tests/test-workspace.cjs
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const ts=require('typescript'),{DatabaseSync}=require('node:sqlite');
const root=path.resolve(__dirname,'..'),sql=new DatabaseSync(':memory:');
for(const file of fs.readdirSync(path.join(root,'drizzle')).filter(f=>f.endsWith('.sql')).sort())sql.exec(fs.readFileSync(path.join(root,'drizzle',file),'utf8'));
sql.exec('PRAGMA foreign_keys=ON');
let identity;
const db={prepare(query){let values=[];const statement={bind(...v){values=v;return statement;},async first(){return sql.prepare(query).get(...values)||null;},async all(){return {results:sql.prepare(query).all(...values)};},async run(){return {meta:{changes:Number(sql.prepare(query).run(...values).changes)}};}};return statement;},async batch(statements){sql.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());sql.exec('COMMIT');return results;}catch(e){sql.exec('ROLLBACK');throw e;}}};
const cache=new Map();function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file).exports;const module={exports:{}};cache.set(file,module);const source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const req=name=>{if(name==='cloudflare:workers')return {env:{MOLA_OWNER_EMAIL:'owner@example.test'}};if(name==='@/lib/cloudflare-auth')return {cloudflareUser:async()=>identity?{...identity,emailVerified:true}:null};if(name==='@/lib/database')return {database:()=>db};if(name.startsWith('@/'))return load(path.join(root,name.slice(2)+'.ts'));if(name.startsWith('.'))return load(path.resolve(path.dirname(file),name+'.ts'));return require(name);};vm.runInThisContext('(function(require,module,exports){'+source+'\n})',{filename:file})(req,module,module.exports);return module.exports;}
const live=load(path.join(root,'app/api/workspace/route.ts')),test=load(path.join(root,'app/api/test-workspace/route.ts'));
const {obligationStanding}=load(path.join(root,'lib/model.ts'));
const login=name=>identity=name?{userId:name,email:name+'@example.test',displayName:name}:null;
const origin='https://test.example';let session,org;
async function call(method,body,role=null,status=200,owner='owner',sid=session){login(owner);const query=role?`?${new URLSearchParams({session:sid,role})}`:'';const response=await test[method](new Request(origin+'/api/test-workspace'+query,{method,headers:{origin,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}));const data=await response.json();assert.equal(response.status,status,JSON.stringify(data));return data;}
const post=async(role,body,status=200)=>{const data=await call('POST',{orgId:org.id,...body},role,status);if(status===200&&body.action==='contribution'&&data.entry?.status==='Screenshot required'){const row=sql.prepare('SELECT data FROM test_entries WHERE id=?').get(data.entry.id),entry=JSON.parse(row.data);entry.status='Awaiting verification';entry.receipt={key:'fictional/'+entry.id,mime:'image/png',size:32,uploadedBy:role,uploadedAt:entry.created};sql.prepare('UPDATE test_entries SET data=? WHERE id=?').run(JSON.stringify(entry),entry.id);data.entry={...data.entry,status:'Awaiting verification',hasReceipt:true,canViewReceipt:true,canUploadReceipt:false};}return data;};
const read=async role=>{const d=await call('GET',null,role);org=d.organizations[0];return d;};
const snapshot=()=>JSON.stringify(['installation','organizations','entries','notification_reads'].map(table=>sql.prepare(`SELECT * FROM ${table} ORDER BY id`).all()));
(async()=>{
 login('owner');const original=await (await live.GET(new Request(origin+'/api/workspace'))).json();const realOrg=original.organizations.find(o=>o.mode==='Shared ownership');const before=snapshot();
 await call('GET',null,null,401,null);await call('GET',null,null,403,'outsider');
 const empty=await call('GET');assert.equal(empty.workspace,null);
 session=(await call('POST',{action:'create'})).workspace.session;
 assert.equal((await call('POST',{action:'create'})).workspace.session,session,'Repeated create resumes existing data');
 let data=await read('admin');assert.equal(data.organizations.length,1);assert.equal(org.members.length,4);assert(org.permissions.isOwner);assert(org.members.every(m=>m.name.endsWith('Test')));assert.equal(data.entries.length,0);
 await call('GET',null,'nobody',400);await call('GET',null,'admin',403,'outsider');await call('GET',null,'admin',410,'owner','wrong-session');
 await post('admin',{action:'weeklyMinimum',orgId:realOrg.id,version:realOrg.version,amount:'200'},403);
 await post('contributor',{action:'weeklyMinimum',version:org.version,amount:'200'},403);
 await post('admin',{action:'scheduleSetup',version:org.version,effectiveDate:'2026-10-05',amount:'100',deadlineTime:'17:00',deadlineTimeZone:'UTC'});await read('admin');
 const preview=(await post('admin',{action:'schedulePreview',version:org.version,from:'2026-10-05',weeks:1})).preview;assert.equal(preview.records.length,4);
 await post('admin',{action:'scheduleGenerate',version:preview.version,from:'2026-10-05',weeks:1,token:preview.token});
 data=await read('contributor');assert.equal(org.permissions.isOwner,false);assert.equal(org.permissions.memberId,'contributor');assert.equal(org.permissions.canReview,false);
 const due=data.entries.find(e=>e.type==='obligation'&&e.memberId==='contributor');
 const draft={action:'contribution',submissionId:crypto.randomUUID(),title:'Fictional contribution',memberId:'contributor',amount:'60',currency:'USD',date:'2026-10-05',method:'Bank transfer (external)',reference:'TEST-ONLY-001',purpose:'No money moved',submissionObligationId:due.id};
 let payment=(await post('contributor',draft)).entry;assert.equal((await post('contributor',draft)).entry.id,payment.id);
 // Owner status never permits self-reconciliation, including extra payments with no due.
 const reconciliation={action:'review',reviewCount:0,outcome:'Owner reconciled',evidence:'Fictional independent bank check',obligationId:'',credit:''};
 const ownerPayment=(await post('admin',{...draft,submissionId:crypto.randomUUID(),memberId:'admin',submissionObligationId:''})).entry;
 assert.equal(ownerPayment.canOwnerReconcile,false);assert.equal(ownerPayment.canReview,false);
 await post('admin',{...reconciliation,entryId:ownerPayment.id},403);
 const submittedForOther=(await post('admin',{...draft,submissionId:crypto.randomUUID(),submissionObligationId:''})).entry;
 assert.equal(submittedForOther.canOwnerReconcile,false);
 await post('admin',{...reconciliation,entryId:submittedForOther.id},403);
 const ownerView=await read('admin');assert.equal(ownerView.entries.find(e=>e.id===payment.id).canOwnerReconcile,true);
 // Even a report submitted by someone else cannot be reconciled by its contributor.
 const raw=JSON.parse(sql.prepare('SELECT data FROM test_entries WHERE id=?').get(ownerPayment.id).data);
 raw.submittedBy='another-submitter';sql.prepare('UPDATE test_entries SET data=? WHERE id=?').run(JSON.stringify(raw),raw.id);
 await post('admin',{...reconciliation,entryId:ownerPayment.id},403);
 const independentlyChecked=(await post('reviewer',{...reconciliation,entryId:ownerPayment.id,outcome:'Verified'})).entry;
 assert.equal(independentlyChecked.status,'Verified');
 const review={action:'review',entryId:payment.id,reviewCount:0,outcome:'Verified',evidence:'Fictional receipt for testing only',obligationId:due.id,credit:'60'};
 await post('contributor',review,403);payment=(await post('reviewer',review)).entry;assert.equal(payment.status,'Verified');
 data=await read('contributor');assert.equal(obligationStanding(due,data.entries).remaining,4000);assert(data.activity.some(e=>e.kind==='review'&&e.entryId===payment.id));
 await post('contributor',{action:'readActivity',eventIds:[data.activity[0].id]});assert(sql.prepare('SELECT count(*) n FROM test_notification_reads').get().n>0);
 let request=(await post('contributor',{...draft,action:'request',submissionId:crypto.randomUUID(),submissionObligationId:'',title:'Fictional investment',amount:'500'})).entry;
 await post('contributor',{action:'approveRequest',entryId:request.id,token:request.funding.token},403);
 request=(await post('reviewer',{action:'approveRequest',entryId:request.id,token:request.funding.token})).entry;assert.equal(request.status,'Awaiting approvals');
 request=(await post('approver',{action:'approveRequest',entryId:request.id,token:request.funding.token})).entry;assert.equal(request.status,'Authorized');assert.equal(request.funding.count,2);
 // The normal endpoint cannot act as a test member by supplying a test org id.
 login('owner');const blocked=await live.POST(new Request(origin+'/api/workspace',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({orgId:org.id,action:'weeklyMinimum',version:org.version,amount:'300'})}));assert.equal(blocked.status,403);
 assert.equal(snapshot(),before,'All real rows must remain byte-for-byte unchanged');
 await call('POST',{action:'delete',session,confirmation:'wrong'},null,400);await call('POST',{action:'delete',session:'stale',confirmation:'DELETE TEST WORKSPACE'},null,409);
 await call('POST',{action:'delete',session,confirmation:'DELETE TEST WORKSPACE'});
 for(const table of ['test_workspace','test_organizations','test_entries','test_notification_reads'])assert.equal(sql.prepare(`SELECT count(*) n FROM ${table}`).get().n,0,'Deletion removes '+table);
 await call('GET',null,'admin',410);await post('contributor',draft,410);
 const old=session;session=(await call('POST',{action:'create'})).workspace.session;assert.notEqual(session,old);assert.equal((await read('admin')).entries.length,0);
 await call('POST',{action:'delete',session:old,confirmation:'DELETE TEST WORKSPACE'},null,409);
 // Simulate a delayed write from a deleted session: its parent no longer exists.
 assert.throws(()=>sql.prepare('INSERT INTO test_entries (id,org_id,data,created) VALUES (?,?,?,?)').run('late','test:'+old+':mola','{}','now'),/FOREIGN KEY/);
 assert.equal(snapshot(),before);console.log('TEST WORKSPACE PASS: owner gate, real-data isolation, four identities, permissions, dues, partial receipt review, approval quorum, activity, idempotent creation, cascading deletion, stale sessions and late-write rejection.');
})().catch(e=>{console.error(e);process.exitCode=1;});
