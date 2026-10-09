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
const {publicEntry}=load(path.join(root,'lib/access.ts')),{payoutToken,payoutTotals}=load(path.join(root,'lib/payouts.ts')),{activityFor}=load(path.join(root,'lib/activity.ts'));
const currentOrg=()=>JSON.parse(sql.prepare('SELECT data FROM organizations WHERE id=?').get(org.id).data);
const current=e=>publicEntry(raw(e.id),currentOrg(),'owner',{userId:'owner'});
const report=(entry,overrides={})=>({action:'recordPayout',entryId:entry.id,token:entry.funding.token,payoutToken:payoutToken(entry),submissionId:crypto.randomUUID(),amount:'600',fee:'5',date:'2026-10-05',reference:'transfer-100',method:'Bank transfer',sentBy:'Alex Example',evidence:'Fictional bank receipt 100',acknowledged:true,...overrides});
const voidReport=(entry,payoutId,overrides={})=>({action:'voidPayout',entryId:entry.id,token:entry.funding.token,payoutToken:payoutToken(entry),payoutId,reason:'Wrong receipt was recorded; report correction only',...overrides});
async function authorize(entry){for(const who of ['alice','bob','carol'])entry=await approve(who,entry);return entry;}
(async()=>{
 let entry=await create(),intent=report(entry);
 await post('owner',intent,409);await post('member',intent,403);await post('outsider',intent,403);await post(null,intent,401);
 entry=await authorize(entry);intent=report(entry);
 for(const overrides of [{amount:'0'},{amount:'-1'},{fee:'-1'},{fee:'1.111'},{fee:'NaN'},{date:'2026-02-30'},{reference:'x'},{sentBy:''},{evidence:'x'},{acknowledged:false},{submissionId:'bad'}])await post('owner',{...intent,...overrides},400);
 await post('owner',{...intent,amount:'999',fee:'2'},400);await post('owner',{...intent,entryId:'foreign-request'},404);
 entry=await post('owner',intent);assert.deepEqual(payoutTotals(entry),{count:1,principal:60000,fees:500,total:60500,remaining:39500});assert.equal(entry.funding.canEdit,false);assert.equal(entry.status,'Authorized');
 const first=entry.payouts[0];assert.equal(first.recordedName,'owner');assert.equal(first.recordedBy,'');assert.equal(first.authorization.recipient,entry.reference);assert.equal(first.authorization.approvals.length,3);assert(first.authorization.approvals.every(a=>a.actor===''));assert.equal(raw(entry.id).payouts[0].recordedBy,'owner');assert.equal(raw(entry.id).payouts[0].authorization.approvals[0].actor,'alice');
 entry=await post('owner',intent);assert.equal(entry.payouts.length,1,'Exact replay does not append');await post('owner',{...intent,amount:'601'},409);await post('owner',revision(entry),409);
 await post('owner',{...intent,submissionId:crypto.randomUUID(),reference:'transfer-stale'},409);
 await post('owner',report(entry,{reference:'transfer-101',amount:'395.01',fee:'0'}),400);
 let other=await authorize(await create());await post('owner',report(other,{reference:' TRANSFER-100 '}),409);
 // A different org using the same reference does not block this org.
 const foreign={...raw(entry.id),id:'foreign',orgId:'other-org',payouts:[{...raw(entry.id).payouts[0],referenceKey:'transfer-101'}]};sql.prepare('INSERT INTO entries VALUES(?,?,?,?)').run(foreign.id,foreign.orgId,JSON.stringify(foreign),foreign.created);
 const secondIntent=report(entry,{reference:'transfer-101',amount:'395',fee:'0'});entry=await post('owner',secondIntent);assert.equal(payoutTotals(entry).remaining,0);await post('owner',report(entry,{reference:'over',amount:'1',fee:'0'}),400);
 const before=raw(entry.id).payouts[0];const correction=voidReport(entry,first.id);await post('member',correction,403);await post('owner',{...correction,reason:'no'},400);entry=await post('owner',correction);assert.equal(payoutTotals(entry).remaining,60500);assert.deepEqual({...raw(entry.id).payouts[0],void:undefined},{...before,void:undefined});assert.equal(entry.payouts[0].void.actor,'');assert.equal(entry.payouts.length,2);
 entry=await post('owner',correction);assert.equal(entry.payouts.length,2);await post('owner',{...correction,reason:'Different correction'},409);
 let events=activityFor(currentOrg(),[entry,foreign]);assert.equal(events.filter(e=>e.kind==='payout').length,2);assert.equal(events.filter(e=>e.kind==='payout-correction').length,1);assert(events.some(e=>e.title.includes('owner')));assert(events.some(e=>e.description.includes('not reverse a bank payment')));assert.equal(new Set(events.map(e=>e.id)).size,events.length);
 // A void frees the reference for an accurate replacement, preserving both histories.
 entry=await post('owner',report(entry,{reference:'transfer-100',amount:'100',fee:'0'}));assert.equal(entry.payouts.length,3);assert.equal(payoutTotals(entry).remaining,50500);
 // Concurrent organization edits fail the write; no partial payout is persisted.
 const count=entry.payouts.length;intercept=()=>updateOrg(o=>({...o,agreement:'Concurrent org edit'}));await post('owner',report(entry,{reference:'racing-org',amount:'1',fee:'0'}),409);assert.equal(raw(entry.id).payouts.length,count);
 // Concurrent reports on another request cannot reuse the reference.
 intercept=()=>{const r=raw(other.id);r.payouts=[{...raw(entry.id).payouts[2],id:crypto.randomUUID(),referenceKey:'racing-reference'}];sql.prepare('UPDATE entries SET data=? WHERE id=?').run(JSON.stringify(r),other.id);};await post('owner',report(entry,{reference:'racing-reference',amount:'1',fee:'0'}),409);
 // Revoking an approver changes current authorization, but never erases the captured evidence.
 updateOrg(o=>({...o,members:o.members.map(m=>m.name==='alice'?{...m,access:{...m.access,enabled:false}}:m)}));entry=current(entry);assert.equal(entry.status,'Awaiting approvals');await post('owner',report(entry,{reference:'revoked',amount:'1',fee:'0'}),409);assert.equal(entry.payouts[0].authorization.approvals.length,3);
 // Owner can correct inaccurate history even when current approvals no longer authorize spending.
 for(const payout of entry.payouts.filter(p=>!p.void))entry=await post('owner',voidReport(entry,payout.id));assert.equal(payoutTotals(entry).count,0);assert.equal(entry.funding.canEdit,true);entry=await post('owner',revision(entry));assert.equal(entry.payouts.length,3);assert.equal(entry.funding.revision,2);assert.equal(entry.payouts[0].authorization.revision,1);
 // Original and correction data survive the owner backup format.
 const {ledgerExport}=load(path.join(root,'lib/ledger-export.ts'));const backup=await ledgerExport('fictional-project',{organizations:[],entries:[{data:JSON.stringify(raw(entry.id))}],installation:[],notification_reads:[]});assert.equal(JSON.parse(backup.tables.entries[0].data).payouts.length,3);
 console.log('EXTERNAL PAYOUTS PASS: authorization, owner access, immutable approval evidence, amount/fee budget, idempotency, duplicate references, stale/org races, void history, privacy, activity and backup preservation.');
})().catch(e=>{console.error(e);process.exitCode=1;});
