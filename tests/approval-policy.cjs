// Run: node tests/approval-policy.cjs. Fictional identities, in-memory SQLite only.
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
 const current=()=>JSON.parse(sql.prepare('SELECT data FROM organizations WHERE id=?').get(org.id).data);
 const version=()=>sql.prepare('SELECT version FROM organizations WHERE id=?').get(org.id).version;
 const configure=(changes={})=>({action:'approvalPolicy',version:version(),requiredApprovals:2,approverMemberIds:['m2','m3','m4'],reason:'Fictional meeting decision',acknowledged:true,...changes});
 let rule=configure();await post('member',rule,403);await post('outsider',rule,403);await post(null,rule,401);
 for(const changes of [{requiredApprovals:1},{requiredApprovals:8},{requiredApprovals:2.5},{approverMemberIds:['m2']},{approverMemberIds:['m2','m2']},{approverMemberIds:['m2','unknown']},{reason:'x'},{acknowledged:false}])await post('owner',configure(changes),400);
 await post('owner',configure({version:0}),409);
 let entry=await create();entry=await approve('alice',entry);assert.equal(entry.funding.count,1);
 const old=entry;rule=configure();await post('owner',rule);await post('owner',rule,409);assert.equal(current().approvalPolicy.version,1);assert.equal(current().approvalPolicy.history[0].previousRequired,3);
 await approve('bob',old,409);
 const {publicEntry,publicOrg}=load(path.join(root,'lib/access.ts'));
 entry=publicEntry(raw(entry.id),current(),'owner',{userId:'owner'});assert.equal(entry.status,'Review required');assert.equal(entry.funding.count,0);
 entry=await post('owner',revision(entry));await approve('alice',entry,403);
 entry=await approve('bob',entry);assert.equal(entry.status,'Awaiting approvals');entry=await approve('carol',entry);assert.equal(entry.status,'Authorized');assert.equal(entry.funding.required,2);
 console.log('PASS: owner-only rule configuration, bounds, distinct founder validation, acknowledgement, history and stale saves');
 // Owner is not a designated approver of another member's request.
 let other=await post('member',{action:'request',submissionId:crypto.randomUUID(),title:'Member request',memberId:'m5',amount:'50.00',currency:'USD',date:'2026-09-29',method:'External',reference:'Masked recipient',purpose:'Fictional test'});
 await approve('owner',other,403);assert.equal(other.funding.availableApprovers,3);
 // Changing only the designation list invalidates an authorized request at the same threshold.
 await post('owner',configure({approverMemberIds:['m1','m3','m4']}));
 let state=publicEntry(raw(entry.id),current(),'owner',{userId:'owner'});assert.equal(state.status,'Review required');assert.equal(state.funding.required,2);assert.equal(current().approvalPolicy.history.length,2);
 const visible=publicOrg(current(),'owner',{userId:'member',email:'member@example.test'});assert(visible.approvalPolicy.history.every(h=>h.actor===''));
 // A configured plain member may approve; officer titles alone no longer grant authority.
 await post('owner',configure({approverMemberIds:['m5','m2','m3']}));
 entry=await create();entry=await approve('member',entry);assert.equal(entry.funding.count,1);await approve('dave',entry,403);
 console.log('PASS: no owner bypass, explicit member designation, same-threshold list invalidation and history identity privacy');
 // Requester exclusion and disabled accounts lower available capacity without weakening the threshold.
 other=publicEntry(raw(other.id),current(),'owner',{userId:'member'});assert.equal(other.funding.availableApprovers,2);await approve('member',other,403);
 updateOrg(o=>({...o,members:o.members.map(m=>m.name==='carol'?{...m,access:{...m.access,enabled:false}}:m)}));
 other=publicEntry(raw(other.id),current(),'owner',{userId:'member'});assert.equal(other.funding.availableApprovers,1);assert.equal(other.funding.required,2);await approve('carol',other,403);
 console.log('PASS: requester exclusion, account revocation and insufficient-capacity reporting');
})().catch(e=>{console.error(e);process.exitCode=1;});
