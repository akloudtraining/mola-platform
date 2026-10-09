// Execute the real export route with fictional identities and a read-only database double.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
let emailUser=null,legacyUser=null,reads=0;
const env={};
const tables={organizations:[{id:'fictional-org',owner:'supabase:owner',data:'{"name":"Fictional group"}',version:1}],entries:[{id:'fictional-note',org_id:'fictional-org',data:'{"title":"Keep original JSON"}',created:'2026-10-01T00:00:00.000Z'}],installation:[{id:'primary',owner:'supabase:owner'}],notification_reads:[]};
const agreementJson=JSON.stringify({id:'fictional-agreement',orgId:'fictional-org',type:'agreement',title:'Exact French and English terms',agreement:{revision:2,body:'Version conservée exactement.\nExact accepted version.',digest:'a'.repeat(64),acceptances:[{memberId:'founder-2',memberName:'Fictional Bob',typedName:'Fictional Bob',actor:'supabase:bob',at:'2026-10-04T00:00:00.000Z',digest:'a'.repeat(64),consent:'Fictional own-member acceptance'}]}});
tables.entries.push({id:'fictional-agreement',org_id:'fictional-org',data:agreementJson,created:'2026-10-04T00:00:00.000Z'});
const db={prepare(query){assert.match(query,/^SELECT /);return query;},async batch(queries){reads++;return queries.map(q=>{const table=q.match(/FROM (\w+)/)[1];return {results:structuredClone(tables[table])};});}};
function load(file){const m={exports:{}};const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;const req=name=>{
 if(name==='cloudflare:workers')return {env};
 if(name==='@/lib/cloudflare-auth')return {cloudflareUser:async()=>emailUser?{...emailUser,emailVerified:true}:null};
 if(name==='@/lib/database')return {database:()=>db};
 if(name==='@/.openai/hosting.json')return {project_id:'fictional-project'};
 if(name==='@/lib/ledger-export')return load(path.join(root,'lib/ledger-export.ts'));
 if(name==='@/lib/workspace-identity')return load(path.join(root,'lib/workspace-identity.ts'));
 throw new Error('Unexpected dependency '+name);
 };vm.runInThisContext('(function(require,module,exports){'+code+'\n})',{filename:file})(req,m,m.exports);return m.exports;}
const {GET}=load(path.join(root,'app/api/workspace/export/route.ts'));
const identity=userId=>({userId,email:'same@example.test',displayName:'Fictional'});
async function get(expected,headers={}){const r=await GET(new Request('https://test.example/api/workspace/export',{headers}));assert.equal(r.status,expected);assert.equal(r.headers.get('Cache-Control'),'no-store');return r;}
(async()=>{
 const before=JSON.stringify(tables);
 await get(401);assert.equal(reads,0);
 emailUser=identity('supabase:member');await get(403);
 legacyUser=identity('supabase:owner');await get(403); // A second identity must not override the active email account.
 emailUser=identity('supabase:owner');legacyUser=null;
 const response=await get(200),data=await response.json();
 assert.match(response.headers.get('Content-Disposition'),/^attachment;/);
 assert.equal(response.headers.get('X-Content-Type-Options'),'nosniff');
 assert.deepEqual(data.tables,tables);assert.equal(data.counts.entries,2);assert.equal(data.tables.entries.find(e=>e.id==='fictional-agreement').data,agreementJson,'Owner export retains the original agreement text, acceptance and private actor identity');
 const {format,projectId,exportedAt}=data;
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({format,projectId,exportedAt,tables:data.tables})));
 assert.equal(data.integrity.sha256,Buffer.from(digest).toString('hex'));
 emailUser=null;legacyUser=identity('supabase:owner');await get(401);
 const readsBeforeExpired=reads;
 await get(401,{cookie:'mola_access_token=expired'});
 await get(401,{cookie:'mola_refresh_token=still-present'});
 await get(401,{cookie:'mola_access_token='});
 assert.equal(reads,readsBeforeExpired,'Expired email sessions must not read through the legacy owner');
 legacyUser=null;env.MOLA_MIGRATION_EXPORT_TOKEN='x'.repeat(64);
 await get(401,{'X-Mola-Migration-Export-Token':'wrong'});
 await get(200,{'X-Mola-Migration-Export-Token':env.MOLA_MIGRATION_EXPORT_TOKEN});
 await get(401,{cookie:'mola_refresh_token=expired','X-Mola-Migration-Export-Token':env.MOLA_MIGRATION_EXPORT_TOKEN});
 emailUser=identity('supabase:member');await get(403,{'X-Mola-Migration-Export-Token':env.MOLA_MIGRATION_EXPORT_TOKEN});
 assert.equal(JSON.stringify(tables),before);
 emailUser=identity('supabase:owner');tables.organizations[0].owner='another-owner';await get(403);
 console.log('EXPORT ACCESS PASS: both owner sign-ins, active-account precedence, member/anonymous denial, restricted service path, mixed-owner denial, original records and digest preserved.');
})().catch(e=>{console.error(e);process.exitCode=1;});
