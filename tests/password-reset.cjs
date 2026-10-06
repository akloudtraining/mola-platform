// Real form handler -> real auth route -> real authAction; provider HTTP is fictional.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
async function scenario({password='new-fictional-password',confirm=password,providerStatus=200}={}){
 const state=['reset','',password,confirm,'','fictional-reset-token',false,'',''];let cursor=0,calls=[],responses=[];
 const context=vm.createContext({Response,Request,Headers,URL,URLSearchParams,console,window:{location:{href:'',pathname:'/auth'},history:{replaceState(){}}},fetch:async(url,options)=>{
  if(url==='/api/auth'){
   calls.push({kind:'app',body:JSON.parse(options.body)});
   const response=await route.POST(new Request('https://test.example/api/auth',{...options,headers:{...options.headers,origin:'https://test.example'}}));
   responses.push(response);return response;
  }
  assert.equal(url,'https://fictional.supabase.test/auth/v1/user');
  calls.push({kind:'provider',method:options.method,body:JSON.parse(options.body),token:options.headers.get('Authorization')});
  return Response.json(providerStatus===200?{id:'fictional-owner'}:{message:'expired'},{status:providerStatus});
 }});
 const cache=new Map();
 function load(relative){if(cache.has(relative))return cache.get(relative).exports;const m={exports:{}};cache.set(relative,m);
  const code=ts.transpileModule(fs.readFileSync(path.join(root,relative),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const req=name=>{
   if(name==='react')return {useEffect:()=>{},useRef:value=>({current:value}),useState:()=>{const index=cursor++;return [state[index],v=>state[index]=v];}};
   if(name==='react/jsx-runtime')return {jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};
   if(name==='lucide-react')return {};
   if(name==='cloudflare:workers')return {env:{SUPABASE_URL:'https://fictional.supabase.test',SUPABASE_PUBLISHABLE_KEY:'fictional-publishable-key'}};
   if(name==='@/lib/supabase-session')return load('lib/supabase-session.ts');
   if(name==='@/lib/auth-callback')return load('lib/auth-callback.ts');
   throw new Error('Unexpected import: '+name);
  };
  vm.runInContext('(function(require,module,exports){'+code+'\n})',context)(req,m,m.exports);return m.exports;
 }
 const route=load('app/api/auth/route.ts'),page=load('app/auth/page.tsx').default();
 function find(node){if(!node||typeof node!=='object')return null;if(node.type==='form')return node;const children=node.props?.children;for(const child of Array.isArray(children)?children:[children]){const found=find(child);if(found)return found;}return null;}
 const form=find(page);assert.ok(form,'Reset form must be rendered');await form.props.onSubmit({preventDefault(){}});
 return {state,calls,responses,route};
}
(async()=>{
 let r=await scenario();assert.equal(r.calls[0].body.action,'update_password');assert.equal(r.calls[1].method,'PUT');assert.equal(r.calls[1].body.password,'new-fictional-password');assert.equal(r.calls[1].token,'Bearer fictional-reset-token');assert.equal(r.state[0],'login');assert.equal(r.state[2],'');assert.equal(r.state[3],'');assert.equal(r.state[5],'');assert.match(r.state[8],/Password updated/);assert.equal(r.state[6],false);assert.equal(r.responses[0].headers.get('Cache-Control'),'no-store');assert.match(r.responses[0].headers.get('Set-Cookie'),/Max-Age=0/);
 r=await scenario({confirm:'different'});assert.equal(r.calls.length,0);assert.equal(r.state[7],'Passwords do not match.');assert.equal(r.state[0],'reset');
 r=await scenario({providerStatus:401});assert.equal(r.state[0],'reset');assert.match(r.state[7],/missing or expired/);assert.equal(r.state[8],'');assert.equal(r.state[6],false);assert.equal(r.responses[0].status,401);
 const denied=await r.route.POST(new Request('https://test.example/api/auth',{method:'POST',headers:{origin:'https://other.example','Content-Type':'application/json'},body:JSON.stringify({action:'update_password',password:'fictional-password',accessToken:'fictional-token'})}));assert.equal(denied.status,403);assert.equal(denied.headers.get('Cache-Control'),'no-store');assert.equal(r.calls.length,2);
 console.log('PASSWORD RESET PASS: actual form reaches password update; success clears fields/session; mismatch sends nothing; expired link stays recoverable; cross-origin denied; responses uncached.');
})().catch(e=>{console.error(e);process.exitCode=1;});
