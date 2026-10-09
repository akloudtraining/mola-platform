// Actual workspace route and migrations. All accounts/state are fictional.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript'),{DatabaseSync}=require('node:sqlite');
const root=path.resolve(__dirname,'..'),sql=new DatabaseSync(':memory:');
for(const file of fs.readdirSync(path.join(root,'drizzle')).filter(f=>f.endsWith('.sql')).sort())sql.exec(fs.readFileSync(path.join(root,'drizzle',file),'utf8'));
let identity,beforeWrite;
const db={prepare(query){let values=[];const statement={bind(...v){values=v;return statement;},async first(){return sql.prepare(query).get(...values)||null;},async all(){return {results:sql.prepare(query).all(...values)};},async run(){if(beforeWrite){const fn=beforeWrite;beforeWrite=null;fn(query,values);}return {meta:{changes:Number(sql.prepare(query).run(...values).changes)}};}};return statement;},async batch(statements){sql.exec('BEGIN');try{const out=[];for(const s of statements)out.push(await s.run());sql.exec('COMMIT');return out;}catch(e){sql.exec('ROLLBACK');throw e;}}};
const cache=new Map();function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file).exports;const mod={exports:{}};cache.set(file,mod);const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const req=name=>{if(name==='cloudflare:workers')return {env:{MOLA_OWNER_EMAIL:'owner@example.test'}};if(name==='@/lib/cloudflare-auth')return {cloudflareUser:async()=>identity?{...identity,emailVerified:true}:null};if(name==='@/lib/database')return {database:()=>db};if(name.startsWith('@/'))return load(path.join(root,name.slice(2)+'.ts'));if(name.startsWith('.'))return load(path.resolve(path.dirname(file),name+'.ts'));return require(name);};vm.runInThisContext('(function(require,module,exports){'+code+'\n})',{filename:file})(req,mod,mod.exports);return mod.exports;}
const route=load(path.join(root,'app/api/workspace/route.ts'));
const login=who=>identity=who?{userId:who,email:who+'@example.test',displayName:who}:null;
async function get(who,status=200){login(who);const r=await route.GET();const d=await r.json();assert.equal(r.status,status,JSON.stringify(d));return d;}
async function post(who,body,status=200,origin='https://test.example'){login(who);const r=await route.POST(new Request('https://test.example/api/workspace',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(body)}));const d=await r.json();assert.equal(r.status,status,JSON.stringify(d));return d;}
const raw=id=>{const r=sql.prepare('SELECT data,version FROM organizations WHERE id=?').get(id);return {...JSON.parse(r.data),version:r.version};};
const saveFixture=org=>sql.prepare('UPDATE organizations SET data=?,version=? WHERE id=?').run(JSON.stringify(org),org.version,org.id);
const snapshot=()=>JSON.stringify({orgs:sql.prepare('SELECT * FROM organizations ORDER BY id').all(),entries:sql.prepare('SELECT * FROM entries').all()});

(async()=>{
 const data=await get('owner'),org=data.organizations.find(o=>o.mode==='Shared ownership'),orgId=org.id;
 const body={action:'linkOwnerFounder',orgId,version:org.version,memberId:'founder-4',name:'Fictional Owner',acknowledged:true};
 const unchanged=snapshot();
 await post(null,body,401);await post('outsider',body,403);await post('owner',body,403,'https://untrusted.example');
 await post('owner',{...body,acknowledged:false},400);await post('owner',{...body,name:'Founder 4'},400);await post('owner',{...body,name:''},400);await post('owner',{...body,memberId:'missing'},400);await post('owner',{...body,version:0},409);
 const canada=data.organizations.find(o=>o.mode==='Individual land allocations');await post('owner',{...body,orgId:canada.id},400);assert.equal(snapshot(),unchanged);
 // A bound founder's role does not grant workspace-owner setup rights.
 await post('owner',{action:'memberAccess',orgId,version:org.version,memberId:'founder-2',name:'Fictional Bob',email:'bob@example.test',role:'President',enabled:true,canReview:true});await get('bob');
 await post('bob',{...body,version:raw(orgId).version},403);
 const current=raw(orgId),claim={...body,version:current.version};
 await post('owner',{...claim,memberId:'founder-2',name:'Fictional Bob'},409);
 const linked=(await post('owner',{...claim,email:'spoof@example.test',userId:'bob',role:'President',canReview:true,enabled:false,actor:'bob'})).organization;
 assert.equal(linked.permissions.memberId,'founder-4');assert.equal(linked.permissions.canReview,false);
 assert.equal(linked.members.find(m=>m.id==='founder-4').access.userId,undefined);assert.equal(linked.members.find(m=>m.id==='founder-4').access.claimed,true);
 let actual=raw(orgId),ownerMember=actual.members.find(m=>m.id==='founder-4');assert.equal(ownerMember.access.userId,'owner');assert.equal(ownerMember.access.email,'owner@example.test');assert.equal(ownerMember.access.canReview,false);assert.equal(ownerMember.role,'Member');assert.equal(ownerMember.name,'Fictional Owner');assert.equal(actual.accessHistory.at(-1).actor,'owner');
 const afterLink=snapshot();await post('owner',claim);assert.equal(snapshot(),afterLink,'Retry preserves the first successful link and audit timestamp');
 await post('owner',{...claim,memberId:'founder-5'},409);await post('owner',{...claim,name:'Someone Else'},409);assert.equal(snapshot(),afterLink);
 const bobView=(await get('bob')).organizations.find(o=>o.id===orgId);assert.equal(bobView.members.find(m=>m.id==='founder-4').access.email,'');assert.equal(bobView.accessHistory,undefined);
 const own=(await get('owner')).organizations.find(o=>o.id===orgId);assert.equal(own.permissions.memberId,'founder-4');

 // Reset only this isolated test organization to exercise incompatible setups.
 const fixture=structuredClone(org);fixture.members[2]={...fixture.members[2],name:'Fictional Preassigned',role:'Treasurer',access:{email:'owner@example.test',enabled:true,canReview:true}};saveFixture(fixture);
 await post('owner',{...body,memberId:'founder-3',name:'Wrong Name'},400);
 const named=(await post('owner',{...body,memberId:'founder-3',name:'  fictional   preassigned '})).organization;assert.equal(named.permissions.canReview,true);assert.equal(raw(orgId).members[2].role,'Treasurer');
 saveFixture({...fixture,members:fixture.members.map(m=>m.id==='founder-3'?{...m,access:{...m.access,enabled:false}}:m)});
 const disabled=snapshot();await post('owner',{...body,memberId:'founder-3',name:'Fictional Preassigned'},409);assert.equal(snapshot(),disabled,'A disabled assignment is not silently re-enabled');
 saveFixture({...fixture,members:fixture.members.map(m=>m.id==='founder-3'?{...m,access:{...m.access,email:'other@example.test'}}:m)});
 const assigned=snapshot();await post('owner',{...body,memberId:'founder-3',name:'Fictional Preassigned'},409);assert.equal(snapshot(),assigned);
 saveFixture({...fixture,members:fixture.members.map(m=>m.id==='founder-3'?{...m,access:{...m.access,userId:'different-account'}}:m)});
 await post('owner',{...body,memberId:'founder-3',name:'Fictional Preassigned'},409);
 saveFixture({...org,members:org.members.map(m=>m.id==='founder-1'?{...m,access:{email:'old-owner@example.test',enabled:false,canReview:false,userId:'owner'}}:m)});
 await post('owner',body,409);
 saveFixture({...org,members:org.members.map(m=>m.id==='founder-1'?{...m,access:{email:'owner@example.test',enabled:false,canReview:false}}:m)});
 await post('owner',body,409);
 saveFixture(org);
 beforeWrite=query=>{assert.match(query,/UPDATE organizations/);sql.prepare('UPDATE organizations SET version=version+1 WHERE id=?').run(orgId);};await post('owner',body,409);
 assert.equal(raw(orgId).members[3].access,undefined);assert.equal(raw(orgId).accessHistory,undefined);
 assert.equal(sql.prepare('SELECT count(*) AS n FROM entries').get().n,0,'Founder linking creates no financial or agreement records');
 console.log('OWNER FOUNDER LINK API PASS: owner-only explicit slot selection, server-derived identity, private response, preserved permissions, idempotency, name/disabled/assigned-account conflicts, stale/concurrent updates and organization isolation. No live accounts or financial records changed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
