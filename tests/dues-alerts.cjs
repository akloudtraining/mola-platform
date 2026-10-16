// Founder Hub dues signals: who is overdue and the next weekly cycle within seven days.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),cache=new Map();function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file).exports;const m={exports:{}};cache.set(file,m);const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;vm.runInThisContext('(function(require,module,exports){'+code+'\n})',{filename:file})(name=>load(path.resolve(path.dirname(file),name+'.ts')),m,m.exports);return m.exports;}
const {duesAlerts}=load(path.join(root,'lib/founder-hub.ts'));
const org={id:'o',currency:'USD',members:[{id:'a',name:'Ama',role:'Member'},{id:'b',name:'Ben',role:'Member'},{id:'c',name:'Cy',role:'Member'}]};
const due=(id,memberId,date)=>({id,orgId:'o',type:'obligation',memberId,currency:'USD',amountMinor:2500,date,title:'Weekly',status:'Open',created:'2026-10-01T00:00:00Z'});
const paid=(id,memberId,obligationId)=>({id,orgId:'o',type:'contribution',memberId,currency:'USD',amountMinor:2500,date:'2026-10-09',status:'Verified',review:{credits:[{obligationId,amountMinor:2500}]},created:'2026-10-09T00:00:00Z'});
const entries=[due('d1','a','2026-10-10'),due('d2','b','2026-10-10'),due('d3','c','2026-10-10'),due('n1','a','2026-10-17'),due('n2','b','2026-10-17'),due('n3','c','2026-10-17'),due('far','a','2026-11-30')];
const r=duesAlerts(org,entries,new Date('2026-10-16T12:00:00Z'));
assert.deepEqual(r.behind.map(b=>b.name),['Ama','Ben','Cy']);assert.equal(r.behindMinor,7500);
assert.equal(r.next.date,'2026-10-17');assert.equal(r.next.total,3);assert.equal(r.next.paid,0);assert.equal(r.next.remainingMinor,7500);
const none=duesAlerts(org,[],new Date('2026-10-16T12:00:00Z'));assert.equal(none.behind.length,0);assert.equal(none.next,null);
const later=duesAlerts(org,[due('far','a','2026-11-30')],new Date('2026-10-16T12:00:00Z'));assert.equal(later.next,null);
console.log('dues alerts: ok');
