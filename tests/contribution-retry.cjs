// Actual workspace route and SQLite migrations. Fictional identities; no network or live data.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript'),{DatabaseSync}=require('node:sqlite');
const root=path.resolve(__dirname,'..'),sql=new DatabaseSync(':memory:');
for(const file of fs.readdirSync(path.join(root,'drizzle')).filter(f=>f.endsWith('.sql')).sort())sql.exec(fs.readFileSync(path.join(root,'drizzle',file),'utf8'));
let identity,beforeInsert;
const db={prepare(query){let values=[];const statement={bind(...v){values=v;return statement;},async first(){return sql.prepare(query).get(...values)||null;},async all(){return {results:sql.prepare(query).all(...values)};},async run(){if(query.startsWith('INSERT OR IGNORE INTO entries')&&beforeInsert){const fn=beforeInsert;beforeInsert=null;fn();}return {meta:{changes:Number(sql.prepare(query).run(...values).changes)}};}};return statement;},async batch(statements){const results=[];for(const s of statements)results.push(await s.run());return results;}};
const cache=new Map();function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file).exports;const module={exports:{}};cache.set(file,module);const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const req=name=>name==='cloudflare:workers'?{env:{MOLA_OWNER_EMAIL:'owner@example.test'}}:name==='@/lib/cloudflare-auth'?{cloudflareUser:async()=>identity?{...identity,emailVerified:true}:null}:name==='@/lib/database'?{database:()=>db}:name.startsWith('@/')?load(path.join(root,name.slice(2)+'.ts')):name.startsWith('.')?load(path.resolve(path.dirname(file),name+'.ts')):require(name);vm.runInThisContext('(function(require,module,exports){'+code+'\n})',{filename:file})(req,module,module.exports);return module.exports;}
const {GET,POST}=load(path.join(root,'app/api/workspace/route.ts'));
let org;
const login=who=>identity=who?{userId:who,email:who+'@example.test',displayName:who}:null;
async function read(who,status=200){login(who);const response=await GET(),data=await response.json();assert.equal(response.status,status,JSON.stringify(data));return data;}
async function post(who,body,status=200){login(who);const response=await POST(new Request('https://test.example/api/workspace',{method:'POST',headers:{origin:'https://test.example','content-type':'application/json'},body:JSON.stringify({orgId:org.id,...body})}));const data=await response.json();assert.equal(response.status,status,JSON.stringify(data));return data;}
async function owner(){org=(await read('owner')).organizations.find(o=>o.mode==='Shared ownership');}
const draft=(extra={})=>({action:'contribution',submissionId:crypto.randomUUID(),title:'Fictional contribution',memberId:'founder-2',amount:'150.00',currency:'USD',date:'2026-11-05',method:'Bank transfer (external)',reference:'FICTIONAL-RECEIPT',purpose:'Fictional retry acceptance',submissionObligationId:'',...extra});
const raw=id=>JSON.parse(sql.prepare('SELECT data FROM entries WHERE id=?').get(id).data);
const store=entry=>sql.prepare('INSERT INTO entries (id,org_id,data,created) VALUES (?,?,?,?)').run(entry.id,entry.orgId,JSON.stringify(entry),entry.created);
(async()=>{
 await owner();for(const [index,name] of [[1,'owner'],[2,'alice'],[3,'bob']]){await post('owner',{action:'memberAccess',version:org.version,memberId:'founder-'+index,name,email:name+'@example.test',enabled:true,canReview:true,role:'Member'});await owner();}await read('alice');await read('bob');await owner();
 const dueBody=draft({action:'obligation',amount:'100.00',deadlineTime:'17:00',deadlineTimeZone:'UTC'}),due=(await post('owner',dueBody)).entry,nextDue=(await post('owner',{...dueBody,submissionId:crypto.randomUUID(),date:'2026-11-12'})).entry;
 const body=draft({submissionObligationId:due.id}),payment=(await post('alice',body)).entry,original=raw(payment.id);
 // Reproduced regression: the old route returns the USD 150 record as success for a USD 200 retry.
 const conflict=await post('alice',{...body,amount:'200.00'},409);assert.match(conflict.error,/already saved.*different details/i);assert.equal(conflict.entry,undefined);assert.deepEqual(raw(payment.id),original);
 for(const change of [{title:'Different title'},{currency:'CAD'},{method:'Zelle (external)'},{date:'2026-11-06'},{reference:'DIFFERENT-RECEIPT'},{purpose:'Different report notes'},{submissionObligationId:nextDue.id},{submissionObligationId:''},{action:'request'}]){await post('alice',{...body,...change},409);assert.deepEqual(raw(payment.id),original);}
 await post('owner',{...body,submittedBy:'alice'},409);await post('alice',{...body,memberId:'founder-3'},403);await post('outsider',body,403);await post('alice',{...body,submissionObligationId:42},400);
 const repeat=(await post('alice',{...body,amount:'150',title:'  Fictional contribution  ',submittedBy:'forged-actor',created:'1900-01-01T00:00:00Z'})).entry;assert.equal(repeat.id,payment.id);assert.equal(repeat.created,payment.created);assert.deepEqual(raw(payment.id),original);
 assert.equal(sql.prepare('SELECT count(*) n FROM entries WHERE id=?').get(payment.id).n,1);
 console.log('PASS: changed amount, title, currency, method, date, reference, notes, target, action and caller cannot claim the earlier payment; equivalent amounts/title normalization retry safely.');

 // Later review, name and cutoff changes do not change the original submission intent.
 await post('bob',{action:'review',entryId:payment.id,reviewCount:0,outcome:'Verified',evidence:'Fictional receipt independently confirmed',obligationId:due.id,credit:'100.00'});
 await owner();await post('owner',{action:'obligationDeadline',version:org.version,entryId:due.id,deadlineAt:due.deadline.at,historyCount:0,deadlineTime:'18:00',deadlineTimeZone:'UTC',reason:'Fictional agreed cutoff correction'});
 await owner();await post('owner',{action:'member',version:org.version,memberId:'founder-2',name:'Renamed fictional Alice'});
 const reviewed=raw(payment.id),after=(await post('alice',body)).entry;assert.equal(after.status,'Verified');assert.equal(after.reviews.length,1);assert.deepEqual(after.submissionDeadline,payment.submissionDeadline);assert.equal(after.created,payment.created);assert.deepEqual(raw(payment.id),reviewed);
 const data=await read('alice');assert.equal(data.activity.filter(e=>e.entryId===payment.id&&e.kind==='submission').length,1);assert.equal(data.activity.filter(e=>e.entryId===payment.id&&e.kind==='review').length,1);assert(!JSON.stringify(after).includes('"submittedBy":"alice"'));
 console.log('PASS: exact retries return the current reviewed record with original submission time/cutoff, audit history and one named event.');

 // Another request can win after the initial lookup but before INSERT OR IGNORE.
 const raceBody=draft(),winner={...original,id:org.id+':'+raceBody.submissionId,submissionObligationId:undefined,submissionDeadline:undefined,amountMinor:22500,title:raceBody.title,status:'Awaiting verification',reviews:undefined};
 beforeInsert=()=>store(winner);await post('alice',raceBody,409);assert.deepEqual(raw(winner.id),JSON.parse(JSON.stringify(winner)));assert.equal(sql.prepare('SELECT count(*) n FROM entries WHERE id=?').get(winner.id).n,1);
 const sameRace=draft(),sameWinner={...winner,id:org.id+':'+sameRace.submissionId,amountMinor:15000};beforeInsert=()=>store(sameWinner);const saved=(await post('alice',sameRace)).entry;assert.equal(saved.id,sameWinner.id);assert.equal(saved.amountMinor,15000);assert.deepEqual(raw(saved.id),JSON.parse(JSON.stringify(sameWinner)));
 const legacy=draft(),legacyEntry={...sameWinner,id:org.id+':'+legacy.submissionId,submittedBy:undefined};store(legacyEntry);await post('alice',legacy,409);assert.deepEqual(raw(legacyEntry.id),JSON.parse(JSON.stringify(legacyEntry)));
 console.log('PASS: post-insert winner comparison rejects a conflicting race, accepts an identical race and never infers a missing original submitter.');

 await owner();await post('owner',{action:'memberAccess',version:org.version,memberId:'founder-2',name:'Renamed fictional Alice',email:'alice@example.test',enabled:false,canReview:true,role:'Member'});await post('alice',body,403);assert.deepEqual(raw(payment.id),reviewed);
 console.log('CONTRIBUTION RETRY API PASS: original records survive conflicts, races and access revocation; no funds or live records touched.');
})().catch(error=>{console.error(error);process.exitCode=1;});
