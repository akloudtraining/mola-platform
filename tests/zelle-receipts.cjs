// Owner-private acceptance regression. No network or production data access.
// Run: node tests/test-workspace.cjs
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const ts=require('typescript'),{DatabaseSync}=require('node:sqlite');
const root=path.resolve(__dirname,'..'),sql=new DatabaseSync(':memory:');
for(const file of fs.readdirSync(path.join(root,'drizzle')).filter(f=>f.endsWith('.sql')).sort())sql.exec(fs.readFileSync(path.join(root,'drizzle',file),'utf8'));
sql.exec('PRAGMA foreign_keys=ON');
let identity;const blobs=new Map();const bucket={async put(key,bytes){blobs.set(key,new Uint8Array(bytes));},async get(key){return blobs.has(key)?{body:blobs.get(key)}:null;},async delete(keys){for(const key of Array.isArray(keys)?keys:[keys])blobs.delete(key);},async list({prefix}){return {objects:[...blobs.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key})),truncated:false};}};
const db={prepare(query){let values=[];const statement={bind(...v){values=v;return statement;},async first(){return sql.prepare(query).get(...values)||null;},async all(){return {results:sql.prepare(query).all(...values)};},async run(){return {meta:{changes:Number(sql.prepare(query).run(...values).changes)}};}};return statement;},async batch(statements){sql.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());sql.exec('COMMIT');return results;}catch(e){sql.exec('ROLLBACK');throw e;}}};
const cache=new Map();function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file).exports;const module={exports:{}};cache.set(file,module);const source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const req=name=>{if(name==='cloudflare:workers')return {env:{BUCKET:bucket,MOLA_OWNER_EMAIL:'owner@example.test'}};if(name==='@/lib/cloudflare-auth')return {cloudflareUser:async()=>identity?{...identity,emailVerified:true}:null};if(name==='@/lib/database')return {database:()=>db};if(name.startsWith('@/'))return load(path.join(root,name.slice(2)+'.ts'));if(name.startsWith('.'))return load(path.resolve(path.dirname(file),name+'.ts'));return require(name);};vm.runInThisContext('(function(require,module,exports){'+source+'\n})',{filename:file})(req,module,module.exports);return module.exports;}
const live=load(path.join(root,'app/api/workspace/route.ts')),test=load(path.join(root,'app/api/test-workspace/route.ts')),receipt=load(path.join(root,'app/api/receipt/route.ts'));
const origin='https://test.example';identity={userId:'owner',email:'owner@example.test',displayName:'Owner'};let session,org;
async function api(body,role='admin',status=200){const r=await test[body?'POST':'GET'](new Request(origin+'/api/test-workspace'+(session?'?'+new URLSearchParams({session,role}):''),{method:body?'POST':'GET',headers:{origin,'content-type':'application/json'},...(body?{body:JSON.stringify({orgId:org?.id,...body})}:{})}));const d=await r.json();assert.equal(r.status,status,JSON.stringify(d));return d;}
async function attachment(id,role='contributor',bytes=null,status=200){const r=await receipt[bytes?'POST':'GET'](new Request(origin+'/api/receipt?'+new URLSearchParams({orgId:org.id,entryId:id,session,role}),{method:bytes?'POST':'GET',headers:{origin,'content-type':'image/png'},...(bytes?{body:bytes}:{})}));assert.equal(r.status,status,await r.clone().text());return r;}
(async()=>{
 await live.GET(new Request(origin+'/api/workspace'));session=(await api({action:'create'})).workspace.session;org=(await api()).organizations[0];
 const draft={action:'contribution',title:'Zelle test',submissionId:crypto.randomUUID(),memberId:'contributor',amount:'100',currency:'USD',date:'2026-10-05',method:'Zelle (external)',reference:'SENDER-REF',purpose:'Fictional only'};
 let payment=(await api(draft,'contributor')).entry;
 assert.equal(payment.status,'Screenshot required');assert.equal(payment.canUploadReceipt,true);await api({action:'review',entryId:payment.id,reviewCount:0,outcome:'Verified',evidence:'Checked receiving bank independently',obligationId:'',credit:'0',bankReference:'BANK-BLOCKED',bankConfirmed:true},'reviewer',409);
 await attachment(payment.id,'contributor',new Uint8Array([1,2,3]),400);assert.equal(blobs.size,0);
 const png=new Uint8Array([137,80,78,71,13,10,26,10,...Array(24).fill(0)]);
 await attachment(payment.id,'approver',png,403);const uploaded=await (await attachment(payment.id,'contributor',png)).json();payment=uploaded.entry;assert.equal(payment.status,'Awaiting verification');assert(payment.hasReceipt);assert(payment.canViewReceipt);assert.equal(payment.receipt,undefined);assert.equal(payment.canUploadReceipt,false);assert.equal(blobs.size,1);
 await attachment(payment.id,'contributor',png,409);const image=await attachment(payment.id,'reviewer');assert.equal(image.headers.get('content-type'),'image/png');assert.match(image.headers.get('cache-control'),/no-store/);await attachment(payment.id,'approver',null,403);
 const ordinary=(await api(null,'approver')).entries.find(e=>e.id===payment.id);assert.equal(ordinary.canViewReceipt,false);assert.equal(ordinary.receipt,undefined);
 const review={action:'review',entryId:payment.id,reviewCount:0,outcome:'Verified',evidence:'Checked receiving bank independently',obligationId:'',credit:'0'};
 await api(review,'reviewer',400);await api({...review,bankReference:'BANK-001'},'reviewer',400);await api({...review,bankReference:'BANK-001',bankConfirmed:true},'contributor',403);
 let verified=(await api({...review,bankReference:' BANK-001 ',bankConfirmed:true},'reviewer')).entry;assert.equal(verified.status,'Verified');assert.equal(verified.reviews.at(-1).bankReference,'BANK-001');assert.equal(verified.depositKey,undefined);
 const second=(await api({...draft,submissionId:crypto.randomUUID()},'contributor')).entry;
 await attachment(second.id,'contributor',png);
 await api({...review,entryId:second.id,bankReference:'bank-001',bankConfirmed:true},'reviewer',409);
 await api({...review,reviewCount:1,outcome:'Rejected',evidence:'Wrong deposit reference; correction'},'reviewer');
 verified=(await api({...review,entryId:second.id,bankReference:'BANK-001',bankConfirmed:true},'reviewer')).entry;assert.equal(verified.status,'Verified');
 await attachment(second.id,'contributor',png,409);
 const real=await (await live.GET(new Request(origin+'/api/workspace'))).json();assert.equal(real.entries.length,0,'No real contributions created');
 const r=await test.POST(new Request(origin+'/api/test-workspace',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({action:'delete',session,confirmation:'DELETE TEST WORKSPACE'})}));assert.equal(r.status,200);assert.equal(blobs.size,0,'Test deletion removes receipt objects');await attachment(payment.id,'reviewer',null,410);
 console.log('ZELLE RECEIPTS PASS: private upload/read permissions, image validation, immutable attachment, human bank confirmation, atomic duplicate reference guard, correction release, public redaction and test receipt deletion.');
})().catch(e=>{console.error(e);process.exitCode=1;});
