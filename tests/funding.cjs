// Run: node tests/funding.cjs. Fictional identities, in-memory SQLite only.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const ts=require('typescript'),{DatabaseSync}=require('node:sqlite');
const root=path.resolve(__dirname,'..'),sql=new DatabaseSync(':memory:');
sql.exec('CREATE TABLE organizations(id TEXT PRIMARY KEY,owner TEXT,data TEXT,version INTEGER); CREATE TABLE entries(id TEXT PRIMARY KEY,org_id TEXT,data TEXT,created TEXT)');
let identity,intercept;
const db={prepare(query){let values=[];const statement={bind(...v){values=v;return statement;},async first(){return sql.prepare(query).get(...values)||null;},async all(){return {results:sql.prepare(query).all(...values)};},async run(){if(intercept&&query.startsWith('UPDATE entries')){const fn=intercept;intercept=null;fn();}return {meta:{changes:Number(sql.prepare(query).run(...values).changes)}};}};return statement;},async batch(statements){return Promise.all(statements.map(s=>s.run()));}};
const cache=new Map();function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file).exports;const module={exports:{}};cache.set(file,module);const source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const req=name=>{if(name==='cloudflare:workers')return {env:{MOLA_OWNER_EMAIL:'owner@example.test'}};if(name==='@/lib/cloudflare-auth')return {cloudflareUser:async()=>identity?{...identity,emailVerified:true}:null};if(name==='@/lib/database')return {database:()=>db};if(name.startsWith('@/'))return load(path.join(root,name.slice(2)+'.ts'));if(name.startsWith('.'))return load(path.resolve(path.dirname(file),name+'.ts'));return require(name);};vm.runInThisContext('(function(require,module,exports){'+source+'\n})',{filename:file})(req,module,module.exports);return module.exports;}
const {POST}=load(path.join(root,'app/api/workspace/route.ts'));
const {templates}=load(path.join(root,'lib/model.ts'));
const org={...templates[0],id:'test-mola',members:['owner','alice','bob','carol','dave','member','spare','last'].map((name,i)=>({id:'m'+i,name,role:name==='member'?'Member':'Treasurer',access:{enabled:true,userId:name,email:name+'@example.test',canReview:false}}))};
sql.prepare('INSERT INTO organizations VALUES(?,?,?,?)').run(org.id,'owner',JSON.stringify(org),1);
const updateOrg=fn=>{const row=sql.prepare('SELECT * FROM organizations WHERE id=?').get(org.id);const next=fn(JSON.parse(row.data));sql.prepare('UPDATE organizations SET data=?,version=version+1 WHERE id=?').run(JSON.stringify(next),org.id);};
const raw=id=>JSON.parse(sql.prepare('SELECT data FROM entries WHERE id=?').get(id).data);
async function post(who,body,status=200){identity=who?{userId:who,email:who+'@example.test',displayName:who}:null;const response=await POST(new Request('https://test.example/api/workspace',{method:'POST',headers:{origin:'https://test.example','content-type':'application/json'},body:JSON.stringify({orgId:org.id,...body})}));const data=await response.json();assert.equal(response.status,status,JSON.stringify(data));return data.entry;}
async function create(reference='Recipient A •••• 1234',purpose='Apartment deposit'){return post('owner',{action:'request',submissionId:crypto.randomUUID(),title:'Test investment',memberId:'m0',amount:'1000.00',currency:'USD',date:'2026-09-29',method:'Bank transfer (external)',reference,purpose});}
const approve=(who,e,status=200)=>post(who,{action:'approveRequest',entryId:e.id,token:e.funding.token},status);
const revision=(e,overrides={})=>({action:'reviseRequest',entryId:e.id,token:e.funding.token,title:e.title,amount:String(e.amountMinor/100),currency:e.currency,date:e.date,reference:e.reference,purpose:e.purpose,reason:'Updated investment details',...overrides});
(async()=>{
 let entry=await create();assert.equal(entry.funding.count,0);
 await approve('owner',entry,403);await approve('member',entry,403);await approve('outsider',entry,403);await approve(null,entry,401);
 const stale=entry;entry=await approve('alice',entry);assert.equal(entry.funding.count,1);assert.equal(entry.status,'Awaiting approvals');assert.equal(entry.approvals[0].actor,'');
 entry=await approve('alice',entry);assert.equal(entry.approvals.length,1);
 entry=await approve('bob',entry);entry=await approve('carol',entry);assert.equal(entry.funding.count,3);assert.equal(entry.status,'Authorized');
 // Editing archives every approval and resets the exact reviewed financial terms.
 entry=await post('owner',revision(entry,{amount:'2000.00',reference:'Recipient B •••• 5678'}));assert.equal(entry.amountMinor,200000);assert.equal(entry.funding.count,0);assert.equal(entry.funding.revision,2);assert.equal(entry.status,'Draft');assert.equal(entry.fundingHistory[0].approvals.length,3);assert.equal(entry.fundingHistory[0].amountMinor,100000);assert.equal(entry.fundingHistory[0].actor,'');assert.equal(entry.fundingHistory[0].approvals[0].actor,'');
 await approve('dave',stale,409);await post('alice',revision(entry),403);
 entry=await approve('alice',entry);
 // Role revocation removes an otherwise bound approval from the eligible total.
 updateOrg(o=>({...o,members:o.members.map(m=>m.name==='alice'?{...m,role:'Member'}:m)}));
 entry=await approve('bob',entry);assert.equal(entry.funding.count,1);assert.equal(entry.status,'Awaiting approvals');
 await approve('alice',entry,403);
 // Stale organization mutation cannot race an approval through the SQL CAS.
 intercept=()=>updateOrg(o=>({...o,agreement:'Concurrent setup edit'}));await approve('carol',entry,409);assert.equal(raw(entry.id).approvals.length,2);
 entry=await approve('carol',entry);assert.equal(entry.funding.count,2);
 // Policy change invalidates the previous snapshot, rather than repricing its approvals.
 updateOrg(o=>({...o,approvalPolicy:{requiredApprovals:4,effectiveAt:'2026-10-01'}}));await approve('dave',entry,409);
 const {publicEntry}=load(path.join(root,'lib/access.ts'));const currentOrg=()=>JSON.parse(sql.prepare('SELECT data FROM organizations WHERE id=?').get(org.id).data);
 entry=publicEntry(raw(entry.id),currentOrg(),'owner',{userId:'owner'});assert.equal(entry.status,'Review required');assert.equal(entry.funding.count,0);await approve('dave',entry,409);
 entry=await post('owner',revision(entry));assert.equal(entry.funding.required,4);assert.equal(entry.fundingHistory.length,2);
 // Each changed field makes an old approval token unusable.
 for(const change of [{purpose:'Revised purpose'},{currency:'CAD'},{date:'2026-10-02'},{title:'Revised title'}]){const before=entry;entry=await post('owner',revision(entry,change));await approve('dave',before,409);}
 // Legacy approvals remain visible but do not authorize any unstamped request.
 let legacy=await create();let record=raw(legacy.id);record.approvals=[{actor:'bob',actorName:'bob',at:new Date().toISOString()}];record.status='Authorized';sql.prepare('UPDATE entries SET data=? WHERE id=?').run(JSON.stringify(record),legacy.id);
 legacy=publicEntry(record,currentOrg(),'owner',{userId:'owner'});assert.equal(legacy.status,'Review required');assert.equal(legacy.funding.count,0);await approve('carol',legacy,409);legacy=await post('owner',revision(legacy));assert.equal(legacy.approvals.length,0);assert.equal(legacy.fundingHistory[0].approvals.length,1);
 await approve('bob',await create('', ''),400);
 await post('owner',revision(entry,{reason:'x'}),400);await post('owner',revision(entry,{amount:'-1'}),400);
 await post('bob',{action:'approveRequest',entryId:'other-org:request',token:entry.funding.token},404);
 // Rebound member identities cannot approve the same request twice under one slot.
 entry=await approve('bob',entry);updateOrg(o=>({...o,members:o.members.map(m=>m.name==='bob'?{...m,access:{...m.access,userId:'bob-new'}}:m)}));entry=await approve('bob-new',entry);assert.equal(entry.funding.count,1);

 // A name-only edit must not revoke officer status, change access or erase approvals.
 const rowBefore=sql.prepare('SELECT data,version FROM organizations WHERE id=?').get(org.id),before=JSON.parse(rowBefore.data),officerBefore=before.members.find(m=>m.id==='m2');
 await post('member',{action:'member',version:rowBefore.version,memberId:'m2',name:'Bob Updated'},403);
 await post('owner',{action:'member',version:rowBefore.version,memberId:'m2',name:'Bob Updated'});
 let renamed=currentOrg().members.find(m=>m.id==='m2');assert.equal(renamed.name,'Bob Updated');assert.equal(renamed.role,officerBefore.role,'Renaming an officer must retain their role');assert.deepEqual(renamed.access,officerBefore.access);assert.equal(publicEntry(raw(entry.id),currentOrg(),'owner',{userId:'owner'}).funding.count,1);assert.equal(raw(entry.id).approvals.at(-1).actorName,'bob','Historical approver names must remain unchanged');
 const afterRename=sql.prepare('SELECT data FROM organizations WHERE id=?').get(org.id).data;
 await post('owner',{action:'member',version:rowBefore.version,memberId:'m2',name:'Stale rename'},409);assert.equal(sql.prepare('SELECT data FROM organizations WHERE id=?').get(org.id).data,afterRename);
 assert.match(currentOrg().accessHistory.at(-1).summary,/bob.*Bob Updated/);
 updateOrg(o=>({...o,members:o.members.map(m=>m.id==='m7'?{...m,role:'Name pending'}:m)}));const pendingRow=sql.prepare('SELECT version FROM organizations WHERE id=?').get(org.id);await post('owner',{action:'member',version:pendingRow.version,memberId:'m7',name:'New Founder'});assert.equal(currentOrg().members.find(m=>m.id==='m7').role,'Founding member');
 console.log('PASS: founder renames preserve officer permissions, approval eligibility, frozen history, access and stale-edit rejection; placeholder roles complete normally.');
 console.log('PASS: funding counts, distinct approvers, self/outsider rejection, revision resets/history, stale tokens, org race, policy changes, legacy approvals, validation, privacy and account rebinding.');
})().catch(e=>{console.error(e);process.exitCode=1;});
