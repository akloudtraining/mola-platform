// Actual auth-page effects and handlers; actual auth route; fictional provider only.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
const root=path.resolve(__dirname,'..');

function harness(url='https://test.example/auth',provider=async()=>Response.json({id:'fictional-user'})){
 const state=['login','','','','','',false,'',''],refs=[],effects=[],calls=[],history=[];
 let stateCursor=0,refCursor=0;
 const address=new URL(url);
 const location={get href(){return address.href;},set href(value){address.href=new URL(value,address).href;},get search(){return address.search;},get hash(){return address.hash;},get pathname(){return address.pathname;}};
 const context=vm.createContext({Response,Request,Headers,URL,URLSearchParams,console,window:{location,history:{replaceState(_,__,target){history.push(target);const next=new URL(target,location.href);location.href=next.href;}}},fetch:async(target,init)=>{
  if(target==='/api/auth'){
   calls.push({kind:'app',body:JSON.parse(init.body)});
   return route.POST(new Request('https://test.example/api/auth',{...init,headers:{...init.headers,origin:'https://test.example'}}));
  }
  assert.equal(new URL(target).origin,'https://fictional.supabase.test','Tests must not use real provider endpoints');
  const call={kind:'provider',url:new URL(target),init,body:init.body?JSON.parse(init.body):null};calls.push(call);return provider(call);
 }});
 const cache=new Map();
 function load(file){if(cache.has(file))return cache.get(file).exports;const module={exports:{}};cache.set(file,module);
  const code=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const req=name=>{
   if(name==='react')return {useEffect:fn=>effects.push(fn),useState:()=>{const i=stateCursor++;return [state[i],value=>state[i]=value];},useRef:initial=>{const i=refCursor++;return refs[i]||(refs[i]={current:initial});}};
   if(name==='react/jsx-runtime')return {jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};
   if(name==='lucide-react')return {};
   if(name==='cloudflare:workers')return {env:{SUPABASE_URL:'https://fictional.supabase.test',SUPABASE_PUBLISHABLE_KEY:'fictional-key'}};
   if(name.startsWith('@/'))return load(name.slice(2)+'.ts');
   throw new Error('Unexpected import: '+name);
  };
  vm.runInContext('(function(require,module,exports){'+code+'\n})',context)(req,module,module.exports);return module.exports;
 }
 const route=load('app/api/auth/route.ts'),Page=load('app/auth/page.tsx').default;
 const render=()=>{stateCursor=0;refCursor=0;effects.length=0;return Page();};
 const runEffects=()=>{for(const effect of [...effects])effect();};
 function find(node,predicate){if(!node||typeof node!=='object')return null;if(predicate(node))return node;const children=node.props?.children;for(const child of Array.isArray(children)?children:[children]){const found=find(child,predicate);if(found)return found;}return null;}
 const submit=()=>find(render(),n=>n.type==='form').props.onSubmit({preventDefault(){}});
 const auth=body=>route.POST(new Request('https://test.example/api/auth',{method:'POST',headers:{origin:'https://test.example','Content-Type':'application/json'},body:JSON.stringify(body)}));
 return {state,calls,history,location,render,runEffects,find,submit,auth};
}

(async()=>{
 let h=harness('https://test.example/auth?mode=confirmed#access_token=signup-secret&refresh_token=refresh-secret&type=signup');
 h.render();h.runEffects();assert.equal(h.state[0],'login');assert.equal(h.state[5],'');assert.match(h.state[8],/Sign in with your password/);assert.equal(h.location.href,'https://test.example/auth');assert.equal(h.calls.length,0,'Confirmation callback does not create a session or update a password');
 h.runEffects();assert.match(h.state[8],/Sign in/,'Strict effect replay must retain the result');

 h=harness('https://test.example/auth?mode=reset#type=signup&access_token=signup-secret');h.render();h.runEffects();assert.equal(h.state[0],'login');assert.equal(h.state[5],'','Signup type wins over stale reset query');
 h=harness('https://test.example/auth#access_token=unknown-secret&refresh_token=unknown-refresh');h.render();h.runEffects();assert.equal(h.state[0],'login');assert.equal(h.state[5],'');assert.equal(h.location.hash,'');

 h=harness('https://test.example/auth?mode=reset#type=recovery&access_token=recovery-secret&refresh_token=refresh-secret');h.render();h.runEffects();assert.equal(h.state[0],'reset');assert.equal(h.state[5],'recovery-secret');assert.equal(h.location.href,'https://test.example/auth?mode=reset');h.runEffects();assert.equal(h.state[5],'recovery-secret','Replay cannot discard the token after history cleanup');
 h.state[2]='fictional-new-password';h.state[3]=h.state[2];await h.submit();assert.equal(h.calls[0].body.action,'update_password');assert.equal(h.calls[0].body.accessToken,'recovery-secret');assert.equal(h.calls[1].init.headers.get('Authorization'),'Bearer recovery-secret');assert.equal(h.state[0],'login');assert.equal(h.state[5],'');assert.equal(h.location.search,'','Successful recovery must not reopen reset after refresh');

 for(const url of ['https://test.example/auth?mode=reset','https://test.example/auth?mode=reset#type=recovery&error_code=otp_expired&error_description=private-details&access_token=bad-secret']){
  h=harness(url);h.render();h.runEffects();assert.equal(h.state[0],'recover');assert.equal(h.state[5],'');assert.match(h.state[7],/missing or expired|invalid or expired/);assert(!h.state[7].includes('private-details'));assert.equal(h.location.hash,'');assert.equal(h.calls.length,0);
 }
 h=harness('https://test.example/auth?mode=confirmed&error=access_denied&code=private-code');h.render();h.runEffects();assert.equal(h.state[0],'confirm');assert.match(h.state[7],/confirmation link/);assert.equal(h.location.search,'?mode=confirm');assert.equal(h.find(h.render(),n=>n.type==='input'&&n.props.type==='password'),null);assert.equal(h.calls.length,0,'An expired link must not automatically send an email');

 h=harness();let response=await h.auth({action:'signup',email:'MEMBER@example.test',password:'fictional-password',displayName:'Fictional Member'});assert.equal(response.status,200);assert.equal((await response.json()).requiresConfirmation,true);assert.equal(response.headers.get('Set-Cookie'),null);assert.equal(response.headers.get('Cache-Control'),'no-store');let call=h.calls[0];assert.equal(call.url.pathname,'/auth/v1/signup');assert.equal(call.url.searchParams.get('redirect_to'),'https://test.example/auth?mode=confirmed');assert.equal(call.body.email,'member@example.test');assert.equal(call.body.redirect_to,undefined);

 for(const action of ['recover','resend_confirmation'])for(const status of [200,400,404,422]){
  h=harness(undefined,async()=>Response.json({message:'private-account-outcome'},{status}));response=await h.auth({action,email:'MEMBER@example.test',type:'email_change',redirectTo:'https://untrusted.example'});assert.equal(response.status,200);const data=await response.json();assert.match(data.message,action==='recover'?/If an account matches/:/If an account needs confirmation/);assert(!JSON.stringify(data).includes('private-account-outcome'));assert.equal(response.headers.get('Set-Cookie'),null);assert.equal(response.headers.get('Cache-Control'),'no-store');call=h.calls[0];assert.equal(call.url.pathname,action==='recover'?'/auth/v1/recover':'/auth/v1/resend');assert.equal(call.url.searchParams.get('redirect_to'),action==='recover'?'https://test.example/auth?mode=reset':'https://test.example/auth?mode=confirmed');assert.equal(call.body.email,'member@example.test');assert.equal(call.body.redirect_to,undefined);assert.equal(call.body.type,action==='recover'?undefined:'signup');
 }
 // Account-independent delivery failures are visible, with no provider details exposed.
 for(const action of ['recover','resend_confirmation'])for(const failure of [
  {status:429,code:'over_email_send_rate_limit',expected:429},
  {status:400,code:'over_request_rate_limit',expected:429},
  {status:500,code:'private-failure',expected:503},
  {status:401,code:'private-failure',expected:503},
  {status:400,code:'email_address_not_authorized',expected:503},
  {status:400,code:'email_provider_disabled',expected:503}
 ]){
  h=harness(undefined,async()=>Response.json({code:failure.code,message:'private-error-details'},{status:failure.status,headers:{'Retry-After':'60'}}));response=await h.auth({action,email:'member@example.test'});assert.equal(response.status,failure.expected);const data=await response.json();assert.equal(data.ok,undefined);assert(!JSON.stringify(data).includes('private-error-details'));assert.equal(response.headers.get('Cache-Control'),'no-store');assert.equal(response.headers.get('Set-Cookie'),null);if(failure.expected===429){assert.match(data.error,/Wait before/);assert.equal(response.headers.get('Retry-After'),'60');}else assert.match(data.error,/try again later|Contact the workspace owner/);
 }
 h=harness(undefined,async()=>{throw new Error('private-network-error');});h.state[0]='confirm';h.state[1]='member@example.test';await h.submit();assert.equal(h.state[0],'confirm');assert.equal(h.state[1],'member@example.test');assert.equal(h.state[6],false);assert.match(h.state[7],/could not confirm/);assert.equal(h.state[8],'');assert.equal(h.location.pathname,'/auth');
 h=harness();response=await h.auth({action:'resend_confirmation',email:'not-an-email'});assert.equal(response.status,400);assert.equal(h.calls.length,0);response=await h.auth({action:'resend_confirmation',email:'x'.repeat(255)+'@example.test'});assert.equal(response.status,400);assert.equal(h.calls.length,0);
 const denied=await h.auth({action:'unsupported'});assert.equal(denied.status,400);

 // Signup leaves an email-only resend form; repeating it does not register again.
 h=harness('https://test.example/auth?mode=signup');h.render();h.runEffects();h.state[1]='member@example.test';h.state[2]='fictional-password';await h.submit();assert.equal(h.state[0],'confirm');assert.equal(h.state[2],'');assert.equal(h.location.search,'?mode=confirm');assert.match(h.state[8],/Check your email/);assert.equal(h.find(h.render(),n=>n.type==='input'&&n.props.type==='password'),null);await h.submit();assert.equal(h.calls.filter(c=>c.kind==='provider'&&c.url.pathname.endsWith('/signup')).length,1);assert.equal(h.calls.filter(c=>c.kind==='provider'&&c.url.pathname.endsWith('/resend')).length,1);assert.match(h.state[8],/If an account needs confirmation/);assert.equal(h.location.pathname,'/auth');
 h=harness();h.state[1]='member@example.test';h.state[2]='old-password';const help=h.find(h.render(),n=>n.type==='button'&&n.props.children==='Resend confirmation email');help.props.onClick();assert.equal(h.state[0],'confirm');assert.equal(h.state[2],'');assert.equal(h.state[1],'member@example.test');assert.equal(h.location.search,'?mode=confirm');

 let finish;h=harness(undefined,()=>new Promise(resolve=>finish=resolve));h.state[1]='member@example.test';h.state[2]='fictional-password';const form=h.find(h.render(),n=>n.type==='form');const first=form.props.onSubmit({preventDefault(){}}),second=form.props.onSubmit({preventDefault(){}});assert.equal(h.calls.filter(c=>c.kind==='app').length,1);await new Promise(setImmediate);assert.equal(h.calls.filter(c=>c.kind==='provider').length,1);let page=h.render();assert.equal(h.find(page,n=>n.type==='fieldset').props.disabled,true);assert.equal(h.find(page,n=>n.type==='button'&&n.props.children==='Create account').props.disabled,true);finish(Response.json({access_token:'fictional-access',refresh_token:'fictional-refresh'}));await Promise.all([first,second]);assert.equal(h.location.pathname,'/');assert.equal(h.state[6],false);
 console.log('AUTH LINKS PASS: confirmation/recovery distinction, URL cleanup, effect replay, expired links, email-only confirmation resend, non-enumerating responses, visible service/rate errors, provider redirects, confirmation-gated cookies, and duplicate-submit protection. Provider delivery/browser acceptance remains pending.');
})().catch(error=>{console.error(error);process.exitCode=1;});
