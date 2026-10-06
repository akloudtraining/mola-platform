// Pure statement calculations and export safety. No production data or network.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),cache=new Map();function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file).exports;const m={exports:{}};cache.set(file,m);const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;vm.runInThisContext('(function(require,module,exports){'+code+'\n})',{filename:file})(name=>load(path.resolve(path.dirname(file),name+'.ts')),m,m.exports);return m.exports;}
const {memberStatement,statementCsv,csvCell}=load(path.join(root,'lib/statements.ts'));
const {obligationStanding}=load(path.join(root,'lib/model.ts'));
const org={id:'mola',name:'Mola Holdings',members:[{id:'a',name:'Alice'},{id:'b',name:'Bob'}]};
const entry=(id,type,amountMinor,date='2026-01-10',extra={})=>({id,orgId:'mola',type,title:id,memberId:'a',amountMinor,currency:'USD',method:'External',date,reference:'ref',purpose:'Test',status:type==='obligation'?'Recorded obligation':'Verified',created:date+'T12:00:00Z',...extra});
const review=(creditMinor,obligationId='jan',outcome='Verified')=>({actor:'private-user-id',actorName:'Reviewer',at:'2026-03-01T12:00:00Z',outcome,evidence:'Checked receipt',creditMinor,obligationId});
const rows=[entry('jan','obligation',10000),entry('feb','obligation',10000,'2026-02-10'),entry('other-due','obligation',10000,'2026-01-20'),entry('prior','contribution',12000,'2025-12-20',{reviews:[review(6000)]}),entry('selected','contribution',5000,'2026-01-01',{reviews:[review(2000)]}),entry('owner','contribution',3000,'2026-01-31',{status:'Owner reconciled',reviews:[review(1000,'jan','Owner reconciled')]}),entry('pending','contribution',2500,'2026-01-10',{status:'Awaiting verification',reviews:[review(0,'','Awaiting verification')]}),entry('rejected','contribution',1500,'2026-01-10',{status:'Rejected',reviews:[review(0,'','Rejected')]}),entry('excess','contribution',20000,'2025-12-20',{reviews:[review(20000,'other-due')]}),entry('cad','contribution',700,'2026-01-10',{currency:'CAD',reviews:[]}),entry('foreign','contribution',999999,'2026-01-10',{orgId:'other'}),entry('other-member','contribution',999999,'2026-01-10',{memberId:'b'})];
let s=memberStatement(org,rows,'a','2026-01-01','2026-01-31','2026-02-01');let usd=s.summaries.find(x=>x.currency==='USD');
assert.equal(s.payments.length,5);assert.equal(s.dues.length,2);assert.equal(usd.verified,5000);assert.equal(usd.owner,3000);assert.equal(usd.pending,2500);assert.equal(usd.rejected,1500);assert.equal(usd.verifiedUnallocated,3000);assert.equal(usd.ownerUnallocated,2000);assert.equal(usd.credited,29000);assert.equal(usd.remaining,1000);assert.equal(usd.overdue,1000);assert.equal(usd.excess,10000);assert.equal(s.summaries.find(x=>x.currency==='CAD').verified,700);assert.equal(s.summaries.find(x=>x.currency==='CAD').dueCount,0);assert(s.reviews.every(x=>x.review.at>'2026-01-31'));assert(s.payments.some(e=>e.date==='2026-01-01'));assert(s.payments.some(e=>e.date==='2026-01-31'));
console.log('PASS: inclusive ranges, current out-of-range credits, separate status/currency totals, unallocated capital, excess credit and member/org isolation');
const guardedDue=entry('guarded','obligation',10000);
const goodPayment=entry('good','contribution',6000,'2026-01-10',{reviews:[review(6000,'guarded')]});
const invalidAssignments=[
 {...goodPayment,id:'wrong-org',orgId:'other'},
 {...goodPayment,id:'wrong-member',memberId:'b'},
 {...goodPayment,id:'wrong-currency',currency:'CAD'},
 {...goodPayment,id:'negative',reviews:[review(-100,'guarded')]},
 {...goodPayment,id:'fractional',reviews:[review(1.5,'guarded')]},
 {...goodPayment,id:'oversized',reviews:[review(6001,'guarded')]},
 {...goodPayment,id:'mismatch',reviews:[review(6000,'guarded','Rejected')]},
 {...goodPayment,id:'nan',reviews:[review(NaN,'guarded')]}
];
const guarded=obligationStanding(guardedDue,[goodPayment,...invalidAssignments],'2026-01-11');
assert.equal(guarded.credit,6000);assert.equal(guarded.remaining,4000);assert.equal(guarded.ignoredCreditCount,8);
const replacement={...goodPayment,reviews:[review(6000,'guarded'),review(2000,'guarded')]};
assert.equal(obligationStanding(guardedDue,[replacement]).credit,2000);
assert.equal(obligationStanding(guardedDue,[{...replacement,status:'Rejected'}]).credit,0);
console.log('PASS: calculation boundary rejects cross-org/member/currency, malformed and inconsistent credits; latest review replaces earlier credit');
const changed=rows.map(e=>e.id==='selected'?{...e,status:'Rejected',reviews:[...e.reviews,review(0,'','Rejected')]}:e);s=memberStatement(org,changed,'a','2026-01-01','2026-01-31','2026-02-01');usd=s.summaries.find(x=>x.currency==='USD');assert.equal(usd.verified,0);assert.equal(usd.verifiedUnallocated,0);assert.equal(usd.remaining,3000);assert.equal(s.reviews.filter(x=>x.payment.id==='selected').length,2);
assert.throws(()=>memberStatement(org,rows,'a','2026-02-30'));assert.throws(()=>memberStatement(org,rows,'a','2026-02-01','2026-01-01'));assert.throws(()=>memberStatement(org,rows,'missing'));assert.equal(memberStatement(org,rows,'a','2030-01-01').summaries.length,0);assert.equal(memberStatement(org,rows,'a').dues.length,3);console.log('PASS: latest correction replaces credit while preserving review history, empty/all-date selection and date validation');
for(const value of ['=1+1','+cmd','-cmd','@SUM(A1)','  =1','\t=1','\n=1'])assert(csvCell(value).startsWith('"\''));assert.equal(csvCell('a,"b"'),'"a,""b"""');
const exported=statementCsv(org,s,'2026-04-01T00:00:00Z');assert(exported.startsWith('\uFEFF'));assert(exported.includes('"30.00"'));assert(exported.includes('Current loaded review status'));assert(exported.includes('Earlier credits are historical'));assert(!exported.includes('private-user-id'));assert(!exported.includes('"foreign"'));assert(exported.includes('"Rejected"'));console.log('PASS: decimal CSV amounts, spreadsheet formula escaping, UTF-8 marker and export excludes hidden identities/other members');
