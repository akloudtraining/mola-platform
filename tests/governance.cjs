// Run: node tests/governance.cjs. Fictional identities, in-memory SQLite only.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const ts=require('typescript'),{DatabaseSync}=require('node:sqlite');
const root=path.resolve(__dirname,'..'),sql=new DatabaseSync(':memory:');
for(const file of fs.readdirSync(path.join(root,'drizzle')).filter(f=>f.endsWith('.sql')).sort())sql.exec(fs.readFileSync(path.join(root,'drizzle',file),'utf8'));
let identity;
const db={prepare(query){let values=[];const statement={bind(...v){values=v;return statement;},async first(){return sql.prepare(query).get(...values)||null;},async all(){return {results:sql.prepare(query).all(...values)};},async run(){return {meta:{changes:Number(sql.prepare(query).run(...values).changes)}};}};return statement;},async batch(statements){sql.exec('BEGIN');try{const out=[];for(const s of statements)out.push(await s.run());sql.exec('COMMIT');return out;}catch(e){sql.exec('ROLLBACK');throw e;}}};
const cache=new Map();function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file).exports;const module={exports:{}};cache.set(file,module);const source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const req=name=>{if(name==='cloudflare:workers')return {env:{}};if(name==='@/app/chatgpt-auth')return {getChatGPTUser:async()=>identity};if(name==='@/lib/database')return {database:()=>db};if(name.startsWith('@/'))return load(path.join(root,name.slice(2)+'.ts'));if(name.startsWith('.'))return load(path.resolve(path.dirname(file),name+'.ts'));return require(name);};vm.runInThisContext('(function(require,module,exports){'+source+'\n})',{filename:file})(req,module,module.exports);return module.exports;}
const {GET,POST}=load(path.join(root,'app/api/workspace/route.ts'));
const login=who=>{identity=who?{userId:who,email:who+'@example.test',displayName:who}:null;};
async function get(who,status=200){login(who);const r=await GET();const d=await r.json();assert.equal(r.status,status,JSON.stringify(d));return d;}
async function post(who,body,status=200){login(who);const r=await POST(new Request('https://test.example/api/workspace',{method:'POST',headers:{origin:'https://test.example','content-type':'application/json'},body:JSON.stringify(body)}));const d=await r.json();assert.equal(r.status,status,JSON.stringify(d));return d;}
(async()=>{
 const owner=await get('owner');const mola=owner.organizations.find(o=>o.mode==='Shared ownership');assert(mola);
 const base={action:'decision',orgId:mola.id,version:mola.version,submissionId:crypto.randomUUID(),title:'Adopt valuation review cadence',decisionType:'Valuation policy',decisionStatus:'Proposed',date:'2026-09-29',reference:'Founders meeting 2026-09-29',purpose:'Review valuation policy every quarter before issuing any ownership units.'};
 await post('member',{...base},403);await post('owner',{...base,decisionType:'Invalid'},400);await post('owner',{...base,purpose:'x'},400);await post('owner',{...base,version:mola.version-1},409);
 const saved=(await post('owner',base)).entry;assert.equal(saved.type,'decision');assert.equal(saved.decisionType,'Valuation policy');assert.equal(saved.status,'Proposed');assert.equal(saved.amountMinor,0);
 const fresh=(await get('owner')).organizations.find(o=>o.id===mola.id);assert.equal(fresh.version,mola.version+1);await post('owner',{...base,version:fresh.version,submissionId:base.submissionId},409);
 const adopted=(await post('owner',{...base,version:fresh.version,submissionId:crypto.randomUUID(),decisionStatus:'Adopted',title:'Adopt weighted voting policy',decisionType:'Weighted voting'})).entry;assert.equal(adopted.status,'Adopted');
 const data=await get('owner');assert.equal(data.entries.filter(e=>e.type==='decision').length,2);assert.equal(data.activity.some(e=>e.entryId===saved.id),false);
 const canada=data.organizations.find(o=>o.mode==='Individual land allocations');await post('owner',{...base,orgId:canada.id,version:canada.version,submissionId:crypto.randomUUID()},400);
 console.log('PASS: owner-only governance decisions, validation, stale/duplicate protection, version bump, Mola isolation and activity separation');
})().catch(e=>{console.error(e);process.exitCode=1;});
