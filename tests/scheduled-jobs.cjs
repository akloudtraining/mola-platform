// Scheduled reminder, past-due and monthly statement emails with fictional founders,
// an in-memory D1 stand-in and a stubbed sender. Times are Eastern.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
const sent=[];const env={RESEND_API_KEY:'re_test',MOLA_EMAIL_FROM:'Mola <a@example.test>',MOLA_APP_URL:'https://app.example.test',MOLA_OWNER_EMAIL:'owner@example.test'};
const claims=new Set();let orgRows=[],entryRows=[];
const db={prepare(sql){const stmt={args:[],bind(...a){stmt.args=a;return stmt;},
 async run(){if(/^CREATE TABLE/.test(sql))return {meta:{changes:0}};if(/INSERT OR IGNORE INTO scheduled_notifications/.test(sql)){const k=stmt.args[0];const fresh=!claims.has(k);claims.add(k);return {meta:{changes:fresh?1:0}};}throw new Error('unexpected '+sql);},
 async all(){if(/FROM organizations/.test(sql))return {results:orgRows};if(/FROM entries/.test(sql))return {results:entryRows.filter(r=>r.org===stmt.args[0])};throw new Error('unexpected '+sql);}};return stmt;}};
env.DB=db;
const stubs={'cloudflare:workers':{env},'./email':{emailConfigured:()=>true,sendEmail:async(to,subject,text)=>{sent.push({to,subject,text});}}};
const cache=new Map();
function load(file){
 if(cache.has(file))return cache.get(file).exports;const mod={exports:{}};cache.set(file,mod);
 const req=name=>stubs[name]||(name.startsWith('./')||name.startsWith('@/lib/')?load(path.join(name.startsWith('@/')?'lib':path.dirname(file),name.replace(/^@\/lib\//,'').replace(/^\.\//,''))+'.ts'):require(name));
 vm.runInThisContext('(function(require,module,exports){'+ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText+'\n})')(req,mod,mod.exports);
 return mod.exports;
}
const {runScheduledJobs,endOfEasternDay,eastern}=load('lib/scheduled-jobs.ts');
const founder=(id,name,email,userId)=>({id,name,role:'Founder',access:{email,enabled:true,canReview:true,userId}});
const org={id:'f:mola',name:'Mola',mode:'Shared ownership',currency:'USD',members:[founder('a','Alice Test','alice@example.test','u-a'),founder('b','Blair Test','blair@example.test','u-b'),founder('c','Casey Test','casey@example.test','u-c')]};
orgRows=[{id:org.id,owner:'u-owner',data:JSON.stringify(org)},{id:'f:land',owner:'u-owner',data:JSON.stringify({...org,id:'f:land',mode:'Individual land allocations'})}];
const due=(id,member,date)=>({id,orgId:org.id,type:'obligation',title:'Weekly',memberId:member,amountMinor:2500,currency:'USD',method:'',date,reference:'',purpose:'',status:'Recorded obligation',created:'2026-10-01T00:00:00Z'});
const pay=(id,member,created,extra={})=>({id,orgId:org.id,type:'contribution',title:'Weekly',memberId:member,amountMinor:2500,currency:'USD',method:'Zelle (external)',date:created.slice(0,10),reference:'',purpose:'',status:'Awaiting verification',created,...extra});
const setEntries=list=>{entryRows=list.map(e=>({org:e.orgId,data:JSON.stringify(e)}));};
const at=iso=>new Date(iso);
(async()=>{
 // Dates: Sunday 2026-10-18 is the due day (EDT, UTC-4). Sunday 2026-12-06 checks EST (UTC-5).
 assert.equal(eastern(at('2026-10-17T22:30:00Z')).weekday,'Sat');assert.equal(eastern(at('2026-10-17T22:30:00Z')).hour,18);
 assert.equal(new Date(endOfEasternDay('2026-10-18')).toISOString(),'2026-10-19T03:59:59.000Z','Midnight Eastern in daylight time');
 assert.equal(new Date(endOfEasternDay('2026-12-06')).toISOString(),'2026-12-07T04:59:59.000Z','Midnight Eastern in standard time');
 setEntries([due('d-a','a','2026-10-18'),due('d-b','b','2026-10-18'),due('d-c','c','2026-10-18'),pay('p-b','b','2026-10-17T20:00:00Z',{submissionObligationId:'d-b'})]);
 await runScheduledJobs(at('2026-10-17T22:30:00Z'));   // Saturday 6:30 PM EDT
 assert.deepEqual(sent.map(s=>s.to).sort(),['alice@example.test','casey@example.test'],'Heads-up goes to founders with an unpaid due, not to one who already submitted');
 assert.match(sent[0].subject,/^Contribution due Sunday, Oct 18 · \$25\.00 USD$/);
 await runScheduledJobs(at('2026-10-17T23:30:00Z'));assert.equal(sent.length,2,'A rerun within the window sends nothing new');
 sent.length=0;
 setEntries([due('d-a','a','2026-10-18'),due('d-b','b','2026-10-18'),due('d-c','c','2026-10-18'),pay('p-b','b','2026-10-17T20:00:00Z',{submissionObligationId:'d-b'}),pay('p-c','c','2026-10-18T21:00:00Z')]);
 await runScheduledJobs(at('2026-10-19T01:30:00Z'));   // Sunday 9:30 PM EDT
 assert.deepEqual(sent.map(s=>s.to),['alice@example.test'],'Last call only to who still has not submitted; an unlinked payment that week counts');
 assert.match(sent[0].subject,/^Last call/);
 sent.length=0;
 setEntries([due('d-a','a','2026-10-18'),due('d-b','b','2026-10-18'),due('d-c','c','2026-10-18'),pay('p-b','b','2026-10-17T20:00:00Z',{submissionObligationId:'d-b'}),pay('p-c','c','2026-10-19T05:00:00Z',{submissionObligationId:'d-c'})]);
 await runScheduledJobs(at('2026-10-19T12:30:00Z'));   // Monday 8:30 AM EDT
 assert.deepEqual(sent.map(s=>s.to).sort(),['alice@example.test','blair@example.test','casey@example.test','owner@example.test'],'Past-due notice goes to every founder (and an unlinked owner)');
 assert.match(sent[0].subject,/^Past due: 2 contributions for Sunday, Oct 18$/);
 assert(sent[0].text.includes('Alice Test: $25.00 USD (not submitted)'));assert(sent[0].text.includes('Casey Test: $25.00 USD (submitted late'));assert(!sent[0].text.includes('Blair Test'));
 sent.length=0;await runScheduledJobs(at('2026-10-19T13:30:00Z'));assert.equal(sent.length,0,'One past-due notice per due date');
 // First Monday of November: statements for October.
 setEntries([due('d-a','a','2026-10-18'),pay('v-a','a','2026-10-11T20:00:00Z',{status:'Verified'}),pay('p-a','a','2026-10-25T20:00:00Z')]);
 await runScheduledJobs(at('2026-11-02T13:30:00Z'));   // Monday 8:30 AM EST
 const alice=sent.find(s=>s.to==='alice@example.test'&&/statement/.test(s.subject));
 assert(alice&&alice.subject==='Your Mola statement · October 2026');
 assert(alice.text.includes('verified $25.00')&&alice.text.includes('awaiting verification $25.00'),'Monthly totals by status');
 assert(alice.text.includes('remaining recorded dues $25.00'),'Current balance included');
 const statements=sent.filter(s=>/statement/.test(s.subject)).length;assert.equal(statements,3,'One statement per founder; the land workspace is skipped');
 sent.length=0;await runScheduledJobs(at('2026-11-02T14:30:00Z'));assert.equal(sent.filter(s=>/statement/.test(s.subject)).length,0,'Statements are not repeated');
 sent.length=0;await runScheduledJobs(at('2026-11-09T13:30:00Z'));assert.equal(sent.filter(s=>/statement/.test(s.subject)).length,0,'Only the first Monday sends statements');
 sent.length=0;await runScheduledJobs(at('2026-10-17T16:00:00Z'));assert.equal(sent.length,0,'Outside the job windows nothing is sent');
 console.log('SCHEDULED JOBS PASS: Saturday heads-up, Sunday last call, Monday past-due notice to all founders, first-Monday statements, Eastern time across DST, no duplicates.');
})().catch(error=>{console.error(error);process.exitCode=1;});
