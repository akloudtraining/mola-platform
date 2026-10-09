const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const root=path.resolve(__dirname,'..');
const calls=[];
let eligible=true;
const env={MOLA_OWNER_EMAIL:'owner@example.test',DB:{prepare(){return {bind(){return this;},async first(){return eligible?{eligible:1}:null;}};}}};
const context=vm.createContext({Response,Request,Headers,URL,console});
const authModule={exports:{}};
const source=ts.transpileModule(fs.readFileSync(path.join(root,'lib/auth-actions.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const mockAuth=async(_req,path,body)=>{
 calls.push({path,body});
 if(path==='sign-in/email'&&body.password==='bad')return Response.json({message:'private provider details'},{status:401});
 if(path==='sign-in/email')return new Response(JSON.stringify({user:{id:'safe-user'}}),{status:200,headers:{'Set-Cookie':'better-auth.session_token=fake; HttpOnly; Secure; SameSite=Lax','X-Auth':'yes'}});
 if(path==='get-session')return Response.json({user:{id:'safe-user'}});
 if(path==='sign-out')return new Response(JSON.stringify({success:true}),{status:200,headers:{'Set-Cookie':'better-auth.session_token=; Max-Age=0; HttpOnly; Secure'}});
 if(path==='send-verification-email'||path==='request-password-reset')return Response.json({status:true});
 if(path==='reset-password')return Response.json({status:true});
 if(path==='sign-up/email')return Response.json({user:{id:'new-user'}});
 throw new Error('Unexpected auth endpoint '+path);
};
function req(name){
 if(name==='cloudflare:workers')return {env};
 if(name==='./cloudflare-auth')return {runAuthEndpoint:mockAuth};
 throw new Error('Unexpected import '+name);
}
vm.runInContext('(function(require,module,exports){'+source+'\n})',context)(req,authModule,authModule.exports);
const action=authModule.exports.authAction;
const request=(origin='https://mola.test')=>new Request('https://mola.test/api/auth',{method:'POST',headers:{origin,'Content-Type':'application/json'}});
const call=(body,origin)=>action(request(origin),body);
(async()=>{
 let result=await call({action:'login',email:'user@example.test',password:'password123'},'https://evil.test');
 assert.equal(result.response.status,403);assert.equal(calls.length,0);
 eligible=false;result=await call({action:'signup',email:'outsider@example.test',password:'password123'});
 assert.equal(result.response.status,403);assert.equal(calls.length,0);
 result=await call({action:'signup',email:'owner@example.test',password:'password123'});
 assert.equal(result.response.status,400);assert.equal((await result.response.json()).error,'Enter your full name.');assert.equal(calls.length,0);
 eligible=true;result=await call({action:'signup',email:'owner@example.test',password:'password123',displayName:'Owner'});
 assert.equal(result.response.status,200);assert.equal((await result.response.json()).requiresConfirmation,true);assert.equal(calls.at(-1).path,'sign-up/email');assert.equal(calls.at(-1).body.callbackURL,'/auth?mode=confirmed');
 result=await call({action:'login',email:'user@example.test',password:'password123'});
 assert.equal(result.response.status,200);assert.match(result.response.headers.get('set-cookie'),/HttpOnly; Secure/);assert.equal(result.response.headers.get('x-auth'),'yes');
 result=await call({action:'login',email:'user@example.test',password:'bad'});
 assert.equal(result.response.status,401);assert.equal((await result.response.json()).error,'Email or password is incorrect.');
 result=await call({action:'recover',email:'user@example.test'});assert.equal(result.response.status,200);assert.equal(calls.at(-1).path,'request-password-reset');assert.equal(calls.at(-1).body.redirectTo,'/auth?mode=reset');
 result=await call({action:'resend_confirmation',email:'user@example.test'});assert.equal(result.response.status,200);assert.equal(calls.at(-1).path,'send-verification-email');
 result=await call({action:'update_password',password:'new-password123',token:'single-use-token'});assert.equal(result.response.status,200);assert.equal(JSON.stringify(calls.at(-1).body),JSON.stringify({newPassword:'new-password123',token:'single-use-token'}));
 result=await call({action:'refresh'});assert.equal(result.response.status,200);assert.equal((await result.response.json()).ok,true);
 result=await call({action:'logout'});assert.equal(result.response.status,200);assert.match(result.response.headers.get('set-cookie'),/Max-Age=0/);
 result=await call({action:'update_password',password:'short',token:'x'});assert.equal(result.response.status,400);
 // Exercise real Better Auth link generation and callback validation without
 // sending email or touching production data. Each request host must produce
 // a link that can be opened on the configured authentication host.
 const {betterAuth}=await import('better-auth');
 const {memoryAdapter}=await import('better-auth/adapters/memory');
 for(const host of ['https://molaholdings.app','https://app.molaholdings.app','https://mola-platform.armand-kounchou.workers.dev']){
  const canonical='https://app.molaholdings.app';
  const data={user:[],account:[],session:[],verification:[]};
  let emailLink;
  const options={baseURL:canonical,secret:'local-callback-regression-secret-1234567890',database:memoryAdapter(data),
   emailAndPassword:{enabled:true,requireEmailVerification:true,autoSignIn:false,sendResetPassword:async({url})=>{emailLink=url;}},
   emailVerification:{sendOnSignUp:true,sendVerificationEmail:async({url})=>{emailLink=url;}},logger:{disabled:true}};
  const sending=betterAuth({...options,trustedOrigins:[canonical,host]});
  const receiving=betterAuth({...options,trustedOrigins:[canonical]});
  const invoke=async(actionName)=>{
   const response=await action(new Request(host+'/api/auth',{method:'POST',headers:{origin:host}}),{action:actionName,email:'owner@example.test',password:'test-password-123',displayName:'Test Founder'});
   assert.equal(response.response.status,200);
   const captured=calls.at(-1);
   const real=await sending.handler(new Request(host+'/api/auth/'+captured.path,{method:'POST',headers:{origin:host,'Content-Type':'application/json'},body:JSON.stringify(captured.body)}));
   assert.equal(real.status,200,await real.text());
   assert.equal(new URL(emailLink).origin,canonical);
  };
  await invoke('signup');
  await invoke('resend_confirmation');
  let opened=await receiving.handler(new Request(emailLink));
  assert.equal(opened.status,302,await opened.text());
  assert.equal(new URL(opened.headers.get('location'),emailLink).href,canonical+'/auth?mode=confirmed');
  assert.equal(data.user[0].emailVerified,true);
  await invoke('recover');
  opened=await receiving.handler(new Request(emailLink));
  assert.equal(opened.status,302,await opened.text());
  const reset=new URL(opened.headers.get('location'),emailLink);
  assert.equal(reset.origin,canonical);assert.equal(reset.pathname,'/auth');assert.equal(reset.searchParams.get('mode'),'reset');assert.ok(reset.searchParams.get('token'));
  const forbidden=new URL(emailLink);forbidden.searchParams.set('callbackURL','https://untrusted.example/auth');
  assert.equal((await receiving.handler(new Request(forbidden))).status,403);
 }
 console.log('CLOUDFLARE AUTH ACTIONS PASS: auth guards, real verification and recovery callbacks across root/app/Worker domains; untrusted redirects rejected.');
})().catch(error=>{console.error(error);process.exitCode=1;});
