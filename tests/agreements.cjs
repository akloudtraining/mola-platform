// Actual workspace routes, fictional identities and an isolated SQLite database.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript'),{DatabaseSync}=require('node:sqlite');
const root=path.resolve(__dirname,'..'),sql=new DatabaseSync(':memory:');
for(const file of fs.readdirSync(path.join(root,'drizzle')).filter(f=>f.endsWith('.sql')).sort())sql.exec(fs.readFileSync(path.join(root,'drizzle',file),'utf8'));
let identity,beforeWrite;
const db={prepare(query){let values=[];const statement={bind(...v){values=v;return statement;},async first(){return sql.prepare(query).get(...values)||null;},async all(){return {results:sql.prepare(query).all(...values)};},async run(){if(beforeWrite){const fn=beforeWrite;beforeWrite=null;fn(query,values);}return {meta:{changes:Number(sql.prepare(query).run(...values).changes)}};}};return statement;},async batch(statements){sql.exec('BEGIN');try{const out=[];for(const s of statements)out.push(await s.run());sql.exec('COMMIT');return out;}catch(e){sql.exec('ROLLBACK');throw e;}}};
const cache=new Map();function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file).exports;const module={exports:{}};cache.set(file,module);const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const req=name=>{if(name==='cloudflare:workers')return {env:{}};if(name==='@/app/chatgpt-auth')return {getChatGPTUser:async()=>identity};if(name==='@/lib/database')return {database:()=>db};if(name.startsWith('@/'))return load(path.join(root,name.slice(2)+'.ts'));if(name.startsWith('.'))return load(path.resolve(path.dirname(file),name+'.ts'));return require(name);};vm.runInThisContext('(function(require,module,exports){'+code+'\n})',{filename:file})(req,module,module.exports);return module.exports;}
const route=load(path.join(root,'app/api/workspace/route.ts'));
function login(who){identity=who?{userId:who,email:who+'@example.test',displayName:who}:null;}
async function get(who,status=200){login(who);const r=await route.GET();const d=await r.json();assert.equal(r.status,status,JSON.stringify(d));return d;}
async function post(who,body,status=200,origin='https://test.example'){login(who);const r=await route.POST(new Request('https://test.example/api/workspace',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(body)}));const d=await r.json();assert.equal(r.status,status,JSON.stringify(d));return d;}
const rawEntry=id=>JSON.parse(sql.prepare('SELECT data FROM entries WHERE id=?').get(id).data);
const snapshot=()=>JSON.stringify({orgs:sql.prepare('SELECT * FROM organizations ORDER BY id').all(),entries:sql.prepare('SELECT * FROM entries ORDER BY id').all()});
const draft1='Fictional agreement version one. Each founder reviews the contribution schedule and records their own acceptance.\nNo penalties or payment execution in this isolated test.';

(async()=>{
 let initial=await get('owner'),org=initial.organizations.find(o=>o.mode==='Shared ownership');const orgId=org.id;
 const fresh=async()=> (await get('owner')).organizations.find(o=>o.id===orgId);
 const settings=async(body)=>{org=await fresh();return post('owner',{...org,action:'settings',orgId,agreement:body});};
 await settings(draft1);org=await fresh();
 const publish={action:'publishAgreement',orgId,version:org.version,submissionId:crypto.randomUUID(),title:'Fictional membership terms',body:draft1,decisionReference:'Fictional founders meeting 2026-10-04',acknowledged:true};
 const untouched=snapshot();await post('owner',{...publish,acknowledged:false},400);await post('owner',{...publish,body:'short'},400);await post('owner',{...publish,version:org.version-1},409);await post('owner',publish,403,'https://untrusted.example');await post(null,publish,401);assert.equal(snapshot(),untouched);
 const first=(await post('owner',{...publish,actor:'spoofed',acceptances:[{memberId:'founder-1'}]})).entry;
 assert.equal(first.agreement.revision,1);assert.equal(first.agreement.body,draft1);assert.equal(first.agreement.acceptances.length,0);assert.equal(first.agreement.publishedBy,'');assert.equal(first.agreement.isCurrent,true);assert.match(first.agreement.digest,/^[a-f0-9]{64}$/);
 const oneSnapshot=snapshot();await post('owner',publish);assert.equal(snapshot(),oneSnapshot,'Publication retry cannot create another version');await post('owner',{...publish,title:'Different text using the same request ID'},409);
 await post('owner',{action:'acceptAgreement',orgId,entryId:first.id,digest:first.agreement.digest,version:org.version,typedName:'Owner',acknowledged:true},403);
 org=await fresh();await post('owner',{action:'memberAccess',orgId,version:org.version,memberId:'founder-2',name:'Fictional Bob',email:'bob@example.test',role:'Member',enabled:true,canReview:false});
 org=await fresh();await post('owner',{action:'memberAccess',orgId,version:org.version,memberId:'founder-3',name:'Fictional Carol',email:'carol@example.test',role:'Designated reviewer',enabled:true,canReview:true});
 await get('bob');await get('carol');org=await fresh();
 let view=(await get('bob')).entries.find(e=>e.id===first.id);assert.equal(view.agreement.canAccept,true);assert.equal(view.agreement.acceptedByMe,false);
 const accept={action:'acceptAgreement',orgId,version:org.version,entryId:first.id,digest:first.agreement.digest,typedName:'Fictional Bob',acknowledged:true};
 await post('outsider',accept,403);await post('bob',{...accept,typedName:'Fictional Carol'},400);await post('bob',{...accept,digest:'0'.repeat(64)},409);await post('bob',{...accept,acknowledged:false},400);await post('bob',{...accept,version:org.version-1},409);await post('bob',publish,403);
 view=(await post('bob',{...accept,memberId:'founder-3',actor:'owner',at:'1900-01-01',consent:'Spoofed consent'})).entry;
 assert.equal(view.agreement.acceptedByMe,true);assert.equal(view.agreement.canAccept,false);assert.equal(view.agreement.acceptances[0].memberId,'founder-2');assert.equal(view.agreement.acceptances[0].actor,'');
 let raw=rawEntry(first.id);assert.equal(raw.agreement.acceptances[0].actor,'bob');assert.equal(raw.agreement.acceptances[0].memberName,'Fictional Bob');assert.equal(raw.agreement.acceptances[0].digest,first.agreement.digest);assert.notEqual(raw.agreement.acceptances[0].at,'1900-01-01');assert.match(raw.agreement.acceptances[0].consent,/my own membership/);
 const signed=snapshot();await post('bob',accept);assert.equal(snapshot(),signed,'Acceptance retry does not change history or dates');
 const carolView=(await get('carol')).entries.find(e=>e.id===first.id);assert.equal(carolView.agreement.acceptedByMe,false);assert.equal(carolView.agreement.acceptances[0].actor,'');assert.equal(carolView.agreement.canAccept,true);
 // Another member accepting between read and write cannot be overwritten.
 beforeWrite=(query)=>{assert.match(query,/UPDATE entries/);const other=rawEntry(first.id);other.agreement.acceptances.push({memberId:'founder-8',memberName:'Fictional race member',typedName:'Fictional race member',actor:'race-principal',at:new Date().toISOString(),digest:first.agreement.digest,consent:'Fictional concurrent acceptance'});sql.prepare('UPDATE entries SET data=? WHERE id=?').run(JSON.stringify(other),first.id);};
 await post('carol',{...accept,typedName:'Fictional Carol'},409);assert.equal(rawEntry(first.id).agreement.acceptances.length,2);assert.equal(rawEntry(first.id).agreement.acceptances.some(a=>a.memberId==='founder-3'),false);
 await settings(draft1+'\nVersion two adds an agreed reporting cadence.');org=await fresh();
 const second=(await post('owner',{...publish,version:org.version,submissionId:crypto.randomUUID(),body:org.agreement})).entry;
 assert.equal(second.agreement.revision,2);assert.equal(second.agreement.acceptances.length,0);assert.notEqual(second.agreement.digest,first.agreement.digest);assert.equal(rawEntry(first.id).agreement.body,draft1);assert.equal(rawEntry(first.id).agreement.acceptances[0].memberName,'Fictional Bob');
 org=await fresh();await post('carol',{...accept,version:org.version,typedName:'Fictional Carol'},409);
 const historical=(await get('bob')).entries.find(e=>e.id===first.id);assert.equal(historical.agreement.isCurrent,false);assert.equal(historical.agreement.acceptedByMe,true);assert.equal(historical.agreement.canAccept,false);
 const accept2={...accept,version:org.version,entryId:second.id,digest:second.agreement.digest};await post('bob',accept2);await post('carol',{...accept2,typedName:'Fictional Carol'});
 assert.equal(rawEntry(second.id).agreement.acceptances.length,2,'Distinct member acceptances accumulate');
 org=await fresh();await post('owner',{action:'memberAccess',orgId,version:org.version,memberId:'founder-2',name:'Renamed Bob',email:'bob-new@example.test',role:'Member',enabled:true,canReview:false});await get('bob',403);await get('bob-new');org=await fresh();
 await post('bob-new',{...accept2,version:org.version,typedName:'Renamed Bob'},409);assert.equal(rawEntry(second.id).agreement.acceptances[0].memberName,'Fictional Bob');assert.equal(rawEntry(second.id).agreement.acceptances[0].actor,'bob');
 const rebound=(await get('bob-new')).entries.find(e=>e.id===second.id);assert.equal(rebound.agreement.acceptedByMe,false);assert.equal(rebound.agreement.canAccept,false);
 org=await fresh();await post('owner',{action:'memberAccess',orgId,version:org.version,memberId:'founder-3',name:'Fictional Carol',email:'carol@example.test',role:'Designated reviewer',enabled:false,canReview:true});await post('carol',{...accept2,version:org.version},403);
 const canada=(await get('owner')).organizations.find(o=>o.mode==='Individual land allocations');await post('owner',{...publish,orgId:canada.id,version:canada.version,submissionId:crypto.randomUUID()},400);
 // A competing organization update makes publication fail without inserting an orphan version.
 org=await fresh();const beforeEntries=sql.prepare('SELECT count(*) AS n FROM entries').get().n;
 beforeWrite=query=>{assert.match(query,/UPDATE organizations/);sql.prepare('UPDATE organizations SET version=version+1 WHERE id=?').run(orgId);};
 await post('owner',{...publish,version:org.version,submissionId:crypto.randomUUID(),body:org.agreement},409);assert.equal(sql.prepare('SELECT count(*) AS n FROM entries').get().n,beforeEntries);assert.equal(sql.prepare("SELECT count(*) AS n FROM entries WHERE json_extract(data,'$.type')!='agreement'").get().n,0);
 console.log('AGREEMENTS API PASS: immutable versions, exact-content references, owner publication, self-only consent, privacy, idempotency, stale/concurrent writes, supersession, revocation, account rebinding and organization isolation. No financial entry or live record created.');
})().catch(e=>{console.error(e);process.exitCode=1;});
