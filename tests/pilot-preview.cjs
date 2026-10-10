const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const moduleContext={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('build/pilot-preview.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:moduleContext,exports:moduleContext.exports,require});
const {pilotPreview,pilotPreviewVars}=moduleContext.exports;
function responseFor(enabled,host,path){
 let handler;const plugin=pilotPreview({enabled});assert.equal(plugin.apply,'serve');
 plugin.configureServer({middlewares:{use(fn){handler=fn;}}});
 const headers=new Map();const response={setHeader(name,value){headers.set(name.toLowerCase(),value);return this;}};
 let continued=!handler;if(handler)handler({headers:{host},url:path},response,()=>{continued=true;});
 assert.equal(continued,true);return {response,headers};
}
const access='__Secure-better-auth.session_token=fictional-session; Max-Age=3600; Path=/; HttpOnly; Secure; SameSite=Lax';
const refresh='better-auth.session_token=fictional-session; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax';
const other='unrelated_cookie=fictional; Secure; HttpOnly';
for(const host of ['terminal.local:4173','localhost:4173','127.0.0.1:4173']){
 const {response,headers}=responseFor(true,host,'/api/auth?mode=renew');
 assert.equal(response.setHeader('Set-Cookie',[access,refresh,other]),response);
 const cookies=Array.from(headers.get('set-cookie'));
 assert.deepEqual(cookies,[access.replace('__Secure-','').replace('; Secure',''),refresh.replace('; Secure',''),other]);
 response.setHeader('Set-Cookie',access);assert.equal(headers.get('set-cookie'),access.replace('__Secure-','').replace('; Secure',''));
 response.setHeader('Cache-Control','no-store');assert.equal(headers.get('cache-control'),'no-store');
}
for(const [enabled,host,path] of [[false,'terminal.local:4173','/api/auth'],[true,'live.example:4173','/api/auth'],[true,'terminal.local.evil:4173','/api/auth'],[true,'terminal.local:80','/api/auth'],[true,'terminal.local:4173','/api/auth-extra'],[true,'terminal.local:4173','/api/workspace']]){
 const {response,headers}=responseFor(enabled,host,path);response.setHeader('Set-Cookie',[access,other]);assert.deepEqual(headers.get('set-cookie'),[access,other]);
}
const environment={MOLA_OWNER_EMAIL:'owner@fictional.example',MOLA_AUTH_SECRET:'must-not-copy',MOLA_PREVIEW_HTTP_AUTH:'1'};
assert.deepEqual(JSON.parse(JSON.stringify(pilotPreviewVars(environment,false))),{});
assert.deepEqual(JSON.parse(JSON.stringify(pilotPreviewVars(environment,true))),{MOLA_OWNER_EMAIL:environment.MOLA_OWNER_EMAIL});
const sessions=fs.readFileSync('lib/cloudflare-auth.ts','utf8');assert.match(sessions,/httpOnly:true,secure:true,sameSite:'lax'/);
(async()=>{
 let envReads=0;const configModule={exports:{}};
 const dependencies={vinext:{default:()=>({name:'vinext-test'})},vite:{defineConfig:fn=>fn,loadEnv:()=>{envReads++;return environment;}},'./scripts/execution-profile.mjs':{readExecutionProfile:()=> 'managed-linux'},'./build/pilot-preview':moduleContext.exports,'@cloudflare/vite-plugin':{cloudflare:options=>({name:'cloudflare-test',options})}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('vite.config.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:configModule,exports:configModule.exports,require:name=>{assert.ok(dependencies[name],name);return dependencies[name];},process:{env:{},cwd:()=>process.cwd()}});
 const production=await configModule.exports.default({command:'build',mode:'production'});
 assert.equal(envReads,0);assert.deepEqual(JSON.parse(JSON.stringify(production.plugins.find(p=>p.name==='cloudflare-test').options.config.vars)),{});
 let middleware;production.plugins.find(p=>p.name==='mola-pilot-preview').configureServer({middlewares:{use:fn=>{middleware=fn;}}});assert.equal(middleware,undefined);
 const preview=await configModule.exports.default({command:'serve',mode:'development'});
 assert.equal(envReads,1);assert.deepEqual(JSON.parse(JSON.stringify(preview.plugins.find(p=>p.name==='cloudflare-test').options.config.vars)),JSON.parse(JSON.stringify(pilotPreviewVars(environment,true))));
 preview.plugins.find(p=>p.name==='mola-pilot-preview').configureServer({middlewares:{use:fn=>{middleware=fn;}}});assert.equal(typeof middleware,'function');
 console.log('PILOT PREVIEW PASS: opt-in dev-only HTTP login, exact preview hosts/auth route, other cookies and attributes preserved, actual build config excludes preview variables/middleware, published cookies remain Secure.');
})().catch(error=>{console.error(error);process.exitCode=1;});
