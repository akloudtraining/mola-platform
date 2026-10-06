// Behavioral initialization tests: real route + migrations, fictional in-memory ledger only.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const ts=require('typescript'),{DatabaseSync}=require('node:sqlite');
const root=path.resolve(__dirname,'..');
function harness(){
 const sql=new DatabaseSync(':memory:');
 for(const file of fs.readdirSync(path.join(root,'drizzle')).filter(f=>f.endsWith('.sql')).sort())sql.exec(fs.readFileSync(path.join(root,'drizzle',file),'utf8'));
 let identity=null,legacyIdentity=null;
 const env={MOLA_OWNER_EMAIL:'owner@example.test',MOLA_RESET_ON_OWNER_BOOT:'true'};
 const db={prepare(query){let values=[];const statement={bind(...v){values=v;return statement;},async first(){return sql.prepare(query).get(...values)||null;},async all(){return {results:sql.prepare(query).all(...values)};},async run(){return {meta:{changes:Number(sql.prepare(query).run(...values).changes)}};}};return statement;},async batch(statements){sql.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());sql.exec('COMMIT');return results;}catch(e){sql.exec('ROLLBACK');throw e;}}};
 const cache=new Map();
 function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file).exports;const m={exports:{}};cache.set(file,m);
  const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const req=name=>{if(name==='cloudflare:workers')return {env};if(name==='@/lib/supabase-session')return {requestIdentity:async()=>identity};if(name==='@/app/chatgpt-auth')return {getChatGPTUser:async()=>legacyIdentity};if(name==='@/lib/database')return {database:()=>db};if(name.startsWith('@/'))return load(path.join(root,name.slice(2)+'.ts'));if(name.startsWith('.'))return load(path.resolve(path.dirname(file),name+'.ts'));return require(name);};
  vm.runInThisContext('(function(require,module,exports){'+code+'\n})',{filename:file})(req,m,m.exports);return m.exports;
 }
 const {GET,POST}=load(path.join(root,'app/api/workspace/route.ts'));
 const snapshot=()=>JSON.stringify(['installation','organizations','entries','notification_reads'].map(t=>sql.prepare('SELECT * FROM '+t+' ORDER BY id').all()));
 return {sql,env,snapshot,setLegacy(userId){legacyIdentity={userId,email:'owner@example.test',displayName:'Fictional legacy owner'};},async deniedMutation(cookie){identity=null;const response=await POST(new Request('https://test.example/api/workspace',{method:'POST',headers:{origin:'https://test.example',cookie,'Content-Type':'application/json'},body:JSON.stringify({action:'member',orgId:'fictional'})}));assert.equal(response.status,401);},async get(userId,email='owner@example.test',expected=200,cookie=''){identity=userId?{userId,email,displayName:'Fictional account'}:null;const response=await GET(new Request('https://test.example/api/workspace',{headers:{cookie}}));const data=await response.json();assert.equal(response.status,expected,JSON.stringify(data));return data;}};
}
(async()=>{
 const h=harness(),empty=h.snapshot();
 await h.get(null,'',401);assert.equal(h.snapshot(),empty);
 await h.get('supabase:outsider','other@example.test',403);assert.equal(h.snapshot(),empty);
 h.env.MOLA_OWNER_EMAIL='';await h.get('supabase:owner','owner@example.test',403);assert.equal(h.snapshot(),empty);
 h.env.MOLA_OWNER_EMAIL=' OWNER@EXAMPLE.TEST ';const first=await h.get('supabase:owner');assert.equal(first.organizations.length,2);
 const initialized=h.snapshot();await h.get('supabase:owner');assert.equal(h.snapshot(),initialized);
 await h.get('supabase:another','owner@example.test',403);assert.equal(h.snapshot(),initialized);
 h.sql.close();
 const legacy=harness();const old=await legacy.get('legacy-owner');const org=old.organizations.find(o=>o.mode==='Shared ownership');
 const record={id:'preserved-note',orgId:org.id,type:'note',title:'Fictional saved note',memberId:'founder-1',amountMinor:0,currency:'USD',method:'Test',date:'2026-10-01',reference:'fictional',purpose:'Preserve exactly',status:'Draft',created:'2026-10-01T00:00:00.000Z'};
 legacy.sql.prepare('INSERT INTO entries (id,org_id,data,created) VALUES (?,?,?,?)').run(record.id,org.id,JSON.stringify(record),record.created);
 legacy.sql.prepare('INSERT INTO notification_reads (id,user_id,org_id,event_id,read_at) VALUES (?,?,?,?,?)').run('preserved-read','legacy-owner',org.id,'fictional-event',record.created);
 const before=legacy.snapshot();
 await legacy.get('supabase:owner','owner@example.test',403);assert.equal(legacy.snapshot(),before,'Retired reset flag must not delete records or reassign the owner');
 await legacy.get('legacy-owner');assert.equal(legacy.snapshot(),before,'Original owner can still open the same ledger');
 legacy.setLegacy('legacy-owner');
 for(const cookie of ['mola_access_token=expired','mola_refresh_token=expired','mola_access_token=']){
  await legacy.get(null,'',401,cookie);await legacy.deniedMutation(cookie);
  assert.equal(legacy.snapshot(),before,'Expired email identity must not fall back to the legacy owner for reads or writes');
 }
 await legacy.get(null);assert.equal(legacy.snapshot(),before,'Legacy-only requests retain access');
 legacy.sql.close();
 console.log('BOOTSTRAP BEHAVIOR PASS: unauthenticated, wrong-email and unconfigured first users denied; configured initialization is idempotent; matching email cannot take ownership; legacy records and read state survive the retired reset flag.');
})().catch(error=>{console.error(error);process.exitCode=1;});
