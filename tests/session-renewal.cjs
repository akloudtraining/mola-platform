const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
function load(file,fetch,env={}){
 const m={exports:{}};
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const context=vm.createContext({fetch,Response,Request,Headers,AbortSignal,URL,console});
 vm.runInContext('(function(require,module,exports){'+code+'\n})',context)(name=>name==='./workspace-endpoint'?{workspaceEndpoint:input=>input}:{env},m,m.exports);return m.exports;
}
const reply=(status,body={})=>Response.json(body,{status});
(async()=>{
 let calls=[];
 let client=load('lib/workspace-fetch.ts',async(url,options)=>{calls.push(url);return url==='/api/auth'?reply(200,{ok:true}):reply(calls.length===1?401:200);});
 assert.equal((await client.workspaceFetch('/api/workspace')).status,200);assert.deepEqual(calls,['/api/workspace','/api/auth','/api/workspace']);
 calls=[];client=load('lib/workspace-fetch.ts',async url=>{calls.push(url);return url==='/api/auth'?reply(200,{ok:true}):reply(calls.length===1?401:200);});
 assert.equal((await client.workspaceFetch('/api/pilot/readiness?orgId=fictional%3Amola')).status,200);assert.deepEqual(calls,['/api/pilot/readiness?orgId=fictional%3Amola','/api/auth','/api/pilot/readiness?orgId=fictional%3Amola']);
 calls=[];client=load('lib/workspace-fetch.ts',async url=>{calls.push(url);return reply(401);});
 await client.workspaceFetch('https://outside.example/api/pilot/readiness?orgId=fictional');await client.workspaceFetch('/api/pilot/readiness-copy?orgId=fictional');await client.workspaceFetch('/api/pilot/readiness?orgId=fictional',{method:'POST'});assert.equal(calls.length,3,'Only the exact same-origin GET diagnostics route may renew');
 for(const status of [403,409,500]){calls=[];client=load('lib/workspace-fetch.ts',async url=>{calls.push(url);return reply(status);});assert.equal((await client.workspaceFetch('/api/workspace')).status,status);assert.equal(calls.length,1);}
 calls=[];client=load('lib/workspace-fetch.ts',async url=>{calls.push(url);return reply(401);});
 await client.workspaceFetch('/api/workspace',{method:'POST',body:'fictional-payment'});assert.equal(calls.length,1);
 await client.workspaceFetch('https://outside.example/api/workspace');assert.equal(calls.length,2);
 await client.workspaceFetch('/api/workspace');assert.equal(calls.length,4,'Failed renewal must not replay a read');
 calls=[];client=load('lib/workspace-fetch.ts',async url=>{calls.push(url);return url==='/api/auth'?reply(200,{ok:true}):reply(401);});
 assert.equal((await client.workspaceFetch('/api/workspace')).status,401);assert.equal(calls.length,3,'Second 401 must not loop');
 let release,renewed=false;calls=[];
 client=load('lib/workspace-fetch.ts',async url=>{calls.push(url);if(url==='/api/auth'){await new Promise(resolve=>release=resolve);renewed=true;return reply(200,{ok:true});}return reply(renewed?200:401);});
 const a=client.workspaceFetch('/api/workspace'),b=client.workspaceFetch('/api/workspace/export');
 await new Promise(resolve=>setImmediate(resolve));assert.equal(calls.filter(x=>x==='/api/auth').length,1);release();assert.deepEqual((await Promise.all([a,b])).map(r=>r.status),[200,200]);
 calls=[];client=load('lib/workspace-fetch.ts',async url=>{calls.push(url);if(url==='/api/auth')throw new Error('fictional offline');return reply(401);});assert.equal((await client.workspaceFetch('/api/workspace')).status,401);assert.equal(calls.length,2);
 const session=load('lib/supabase-session.ts',async()=>reply(401),{SUPABASE_URL:'https://fictional.example',SUPABASE_PUBLISHABLE_KEY:'fictional-key'});
 const r=(await session.authAction(new Request('https://test.example/api/auth',{method:'POST',headers:{origin:'https://test.example',cookie:'mola_refresh_token=expired'}}),{action:'refresh'})).response;
 assert.equal(r.status,401);assert.equal(r.headers.get('Set-Cookie'),null,'Failed renewal must retain email identity selection');
 console.log('SESSION RENEWAL PASS: one read retry, shared concurrent refresh, no mutation/external/error retries, bounded repeated 401, network failure and identity-preserving server rejection.');
})().catch(e=>{console.error(e);process.exitCode=1;});
