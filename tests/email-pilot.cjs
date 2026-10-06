// Full email-session pilot using real auth/workspace routes and an in-memory D1 adapter.
// Provider requests are handled by this fictional fixture. No network, email, or money.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
const {DatabaseSync}=require('node:sqlite');
const root=path.resolve(__dirname,'..'),sql=new DatabaseSync(':memory:');
for(const file of fs.readdirSync(path.join(root,'drizzle')).filter(file=>file.endsWith('.sql')).sort())sql.exec(fs.readFileSync(path.join(root,'drizzle',file),'utf8'));
const db={prepare(query){let values=[];const statement={bind(...v){values=v;return statement;},async first(){return sql.prepare(query).get(...values)||null;},async all(){return {results:sql.prepare(query).all(...values)};},async run(){return {meta:{changes:Number(sql.prepare(query).run(...values).changes)}};}};return statement;},async batch(statements){sql.exec('BEGIN');try{const result=[];for(const statement of statements)result.push(await statement.run());sql.exec('COMMIT');return result;}catch(error){sql.exec('ROLLBACK');throw error;}}};
const accounts=new Map(),sessions=new Map(),providerCalls=[];
let legacyReads=0,passed=0,org;
const provider=async(target,init={})=>{
 const url=new URL(target);assert.equal(url.origin,'https://fictional.supabase.test','No real provider access is permitted');
 const headers=new Headers(init.headers),body=init.body?JSON.parse(init.body):null;providerCalls.push({path:url.pathname,grant:url.searchParams.get('grant_type')});
 if(url.pathname.endsWith('/signup')){
  assert.equal(url.searchParams.get('redirect_to'),'https://test.example/auth?mode=confirmed');
  const account={id:'fictional-'+accounts.size,email:body.email,password:body.password,user_metadata:body.data||{},confirmed:false};accounts.set(body.email,account);
  return Response.json({id:account.id,email:account.email});
 }
 if(url.pathname.endsWith('/token')){
  assert.equal(url.searchParams.get('grant_type'),'password');const account=accounts.get(body.email);
  if(!account||account.password!==body.password)return Response.json({message:'Invalid login credentials'},{status:400});
  if(!account.confirmed)return Response.json({message:'Email not confirmed'},{status:400});
  const token='fictional-session-'+account.id;sessions.set(token,account);
  return Response.json({access_token:token,refresh_token:'fictional-refresh-'+account.id,user:account});
 }
 if(url.pathname.endsWith('/user')){
  const token=(headers.get('Authorization')||'').replace(/^Bearer /,''),account=sessions.get(token);
  return account?Response.json({id:account.id,email:account.email,email_confirmed_at:'2026-10-04T00:00:00Z',user_metadata:account.user_metadata}):Response.json({message:'Invalid JWT'},{status:401});
 }
 if(url.pathname.endsWith('/logout')){sessions.delete((headers.get('Authorization')||'').replace(/^Bearer /,''));return new Response(null,{status:204});}
 throw new Error('Unexpected fictional provider endpoint: '+url.pathname);
};
const context=vm.createContext({Request,Response,Headers,URL,URLSearchParams,console,crypto,fetch:provider});
const cache=new Map();
function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file).exports;const module={exports:{}};cache.set(file,module);
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const req=name=>{
  if(name==='cloudflare:workers')return {env:{SUPABASE_URL:'https://fictional.supabase.test',SUPABASE_PUBLISHABLE_KEY:'fictional-publishable-key',MOLA_OWNER_EMAIL:'owner@example.test'}};
  if(name==='@/app/chatgpt-auth')return {getChatGPTUser:async()=>{legacyReads++;return null;}};
  if(name==='@/lib/database')return {database:()=>db};
  if(name.startsWith('@/'))return load(path.join(root,name.slice(2)+'.ts'));
  if(name.startsWith('.'))return load(path.resolve(path.dirname(file),name+'.ts'));
  return require(name);
 };
 vm.runInContext('(function(require,module,exports){'+code+'\n})',context,{filename:file})(req,module,module.exports);return module.exports;
}
const workspace=load(path.join(root,'app/api/workspace/route.ts')),auth=load(path.join(root,'app/api/auth/route.ts'));
const {memberStatement,statementCsv}=load(path.join(root,'lib/statements.ts'));
const clients={};for(const name of ['owner','alice','bob','outsider'])clients[name]={name,email:name+'@example.test',password:'fictional-password-'+name,cookies:new Map()};
const cookieHeader=client=>[...client.cookies].map(([key,value])=>key+'='+value).join('; ');
function remember(client,response){for(const cookie of response.headers.getSetCookie()){const pair=cookie.split(';')[0],index=pair.indexOf('=');client.cookies.set(pair.slice(0,index),pair.slice(index+1));if(cookie.includes('Max-Age=0'))client.cookies.delete(pair.slice(0,index));}}
async function authRequest(client,body,status=200){const response=await auth.POST(new Request('https://test.example/api/auth',{method:'POST',headers:{origin:'https://test.example','Content-Type':'application/json',cookie:cookieHeader(client)},body:JSON.stringify(body)}));const data=await response.json();assert.equal(response.status,status,JSON.stringify(data));assert.equal(response.headers.get('Cache-Control'),'no-store');remember(client,response);return data;}
async function read(client,status=200){const response=await workspace.GET(new Request('https://test.example/api/workspace',{headers:{cookie:cookieHeader(client)}}));const data=await response.json();assert.equal(response.status,status,JSON.stringify(data));if(status===200)assert.equal(response.headers.get('Cache-Control'),'no-store');return data;}
async function write(client,body,status=200){const response=await workspace.POST(new Request('https://test.example/api/workspace',{method:'POST',headers:{origin:'https://test.example','Content-Type':'application/json',cookie:cookieHeader(client)},body:JSON.stringify({orgId:org.id,...body})}));const data=await response.json();assert.equal(response.status,status,JSON.stringify(data));return data;}
async function current(){org=(await read(clients.owner)).organizations.find(item=>item.mode==='Shared ownership');return org;}
async function configure(client,index,{enabled=true,canReview=false,role='Member'}={}){await current();return write(clients.owner,{action:'memberAccess',version:org.version,memberId:'founder-'+index,name:client.name,email:client.email,enabled,canReview,role});}
const draft=(action,memberId,amount)=>({action,submissionId:crypto.randomUUID(),title:'Fictional email pilot '+action,memberId,amount,currency:'USD',date:'2026-10-05',method:'Bank transfer (external)',reference:'FICTIONAL-RECEIPT',purpose:'Fictional acceptance only; no funds moved'});
const review=(payment,due,credit,outcome='Verified')=>({action:'review',entryId:payment.id,reviewCount:payment.reviews?.length||0,outcome,evidence:'FICTIONAL-INDEPENDENT-EVIDENCE',obligationId:due?.id||'',credit});
const done=label=>{passed++;console.log('PASS '+passed+': '+label);};

(async()=>{
 await read(clients.owner,401);
 for(const client of Object.values(clients)){
  assert.equal((await authRequest(client,{action:'signup',email:client.email,password:client.password,displayName:client.name})).requiresConfirmation,true);
  assert.equal(client.cookies.size,0,'Signup cannot issue a session before provider confirmation');
  await authRequest(client,{action:'login',email:client.email,password:client.password},400);
  accounts.get(client.email).confirmed=true; // Simulated provider confirmation; no real email is sent.
  await authRequest(client,{action:'login',email:client.email,password:client.password});assert.equal(client.cookies.size,2);
 }
 const ownerAccount=accounts.get(clients.owner.email);await current();assert.equal(org.members.length,8);assert.equal((await read(clients.owner)).organizations.length,2);assert.equal(sql.prepare("SELECT owner FROM installation WHERE id='primary'").get().owner,'supabase:'+ownerAccount.id);
 await read(clients.outsider,403);done('Confirmation-gated signup, real auth login/cookies, owner bootstrap and outsider denial');

 await configure(clients.owner,1,{role:'President',canReview:true});await configure(clients.alice,2);await configure(clients.bob,3,{role:'Treasurer',canReview:true});
 const alice=await read(clients.alice);await read(clients.bob);await current();
 assert.equal(alice.organizations.length,1);assert.equal(alice.organizations[0].permissions.memberId,'founder-2');assert.equal(alice.organizations[0].members.find(member=>member.id==='founder-3').access.email,'');assert.equal(alice.organizations[0].members.find(member=>member.id==='founder-2').access.userId,undefined);
 assert.equal(org.members.filter(member=>member.access?.claimed).length,3);
 const entriesBefore=sql.prepare('SELECT count(*) n FROM entries').get().n;await write(clients.alice,{action:'weeklyMinimum',version:org.version,amount:'250'},403);assert.equal(sql.prepare('SELECT count(*) n FROM entries').get().n,entriesBefore);done('Configured founder-email linking, privacy and server-enforced permissions');

 await write(clients.owner,{action:'scheduleSetup',version:org.version,effectiveDate:'2026-10-05',amount:'100',deadlineTime:'17:00',deadlineTimeZone:'America/New_York'});await current();
 const preview=(await write(clients.owner,{action:'schedulePreview',version:org.version,from:'2026-10-05',weeks:1})).preview;assert.equal(preview.records.length,8);assert.equal(preview.totalMinor,80000);assert.equal((await write(clients.owner,{action:'scheduleGenerate',version:preview.version,from:'2026-10-05',weeks:1,token:preview.token})).generated,8);
 let data=await read(clients.alice),due=data.entries.find(entry=>entry.type==='obligation'&&entry.memberId==='founder-2');assert.equal(due.deadline.timeZone,'America/New_York');
 const paymentBody={...draft('contribution','founder-2','60'),submissionObligationId:due.id};let payment=(await write(clients.alice,paymentBody)).entry;assert.equal(payment.status,'Awaiting verification');assert.equal(payment.submissionDeadline.at,due.deadline.at);assert.equal((await write(clients.alice,paymentBody)).entry.id,payment.id);await write(clients.alice,draft('contribution','founder-3','60'),403);await write(clients.alice,review(payment,due,'60'),403);await write(clients.outsider,review(payment,due,'60'),403);
 payment=(await write(clients.bob,review(payment,due,'60'))).entry;assert.equal(payment.status,'Verified');assert.equal(payment.reviews[0].actorName,'bob');data=await read(clients.alice);let statement=memberStatement(data.organizations[0],data.entries,'founder-2');assert.equal(statement.summaries[0].verified,6000);assert.equal(statement.summaries[0].remaining,4000);done('Weekly dues, own-member submission, deadline snapshot, idempotency, self-review denial and independent confirmation');

 const activity=data.activity.find(event=>event.entryId===payment.id&&event.kind==='review');assert.ok(activity);assert.match(activity.title,/alice/);assert.equal(activity.read,false);await write(clients.alice,{action:'readActivity',eventIds:[activity.id]});await write(clients.alice,{action:'readActivity',eventIds:[activity.id]});assert.equal((await read(clients.alice)).activity.find(event=>event.id===activity.id).read,true);assert.equal((await read(clients.bob)).activity.find(event=>event.id===activity.id).read,false);done('Named member notifications and persistent, private notification read state');

 let extra=(await write(clients.alice,draft('contribution','founder-2','40'))).entry;extra=(await write(clients.bob,review(extra,null,'0'))).entry;data=await read(clients.alice);assert.equal(memberStatement(data.organizations[0],data.entries,'founder-2').summaries[0].remaining,4000);extra=(await write(clients.bob,review(extra,due,'40'))).entry;data=await read(clients.alice);statement=memberStatement(data.organizations[0],data.entries,'founder-2');assert.equal(statement.summaries[0].verified,10000);assert.equal(statement.summaries[0].remaining,0);assert.equal(statement.reviews.length,3);const csv=statementCsv(data.organizations[0],statement);assert.match(csv,/alice/);assert.match(csv,/bob/);assert.match(csv,/100\.00/);assert.match(csv,/America\/New_York/);done('Extra capital stays unallocated until review, then statements/CSV reconcile');

 await current();await write(clients.owner,{action:'approvalPolicy',version:org.version,requiredApprovals:2,approverMemberIds:['founder-1','founder-3'],reason:'Fictional approved pilot rule',acknowledged:true});let request=(await write(clients.alice,draft('request','founder-2','500'))).entry;await write(clients.alice,{action:'approveRequest',entryId:request.id,token:request.funding.token},403);request=(await write(clients.bob,{action:'approveRequest',entryId:request.id,token:request.funding.token})).entry;assert.equal(request.status,'Awaiting approvals');request=(await write(clients.owner,{action:'approveRequest',entryId:request.id,token:request.funding.token})).entry;assert.equal(request.status,'Authorized');assert.equal(request.funding.count,2);assert.equal((await read(clients.alice)).entries.find(entry=>entry.id===request.id).funding.count,2);done('Explicit designated-founder rule, requester exclusion and two distinct approvals survive refresh');

 await configure(clients.bob,3,{enabled:false,canReview:true,role:'Treasurer'});await read(clients.bob,403);await write(clients.bob,review(payment,due,'60'),403);data=await read(clients.alice);assert.equal(data.entries.find(entry=>entry.id===request.id).funding.count,1);assert.equal(data.entries.find(entry=>entry.id===request.id).status,'Awaiting approvals');assert.equal(memberStatement(data.organizations[0],data.entries,'founder-2').summaries[0].remaining,0);done('Revoked member access blocks further actions and removes funding eligibility without rewriting contribution history');

 const originalCookie=clients.alice.cookies.get('mola_access_token'),legacyBefore=legacyReads;
 clients.alice.cookies.set('mola_access_token','fictional-expired');await read(clients.alice,401);await write(clients.alice,draft('contribution','founder-2','10'),401);assert.equal(legacyReads,legacyBefore,'Invalid email sessions cannot fall back to a different identity');clients.alice.cookies.set('mola_access_token',originalCookie);
 await authRequest(clients.alice,{action:'logout'});assert.equal(clients.alice.cookies.size,0);await read(clients.alice,401);done('Expired sessions and logout cannot retain member authorization or fall back to legacy identity');

 const rows=sql.prepare('SELECT count(*) n FROM entries').get();assert.equal(rows.n,11);assert.equal(sql.prepare('SELECT count(*) n FROM organizations').get().n,2);assert.equal(sql.prepare('SELECT count(*) n FROM notification_reads').get().n,1);assert.ok(providerCalls.some(call=>call.path.endsWith('/user')));done('Final isolated database has eight dues, two contributions, one funding request and no duplicate reads');
 console.log('EMAIL PILOT API PASS: '+passed+' scenarios using actual Supabase session selection and actual workspace routes. Real email delivery, real accounts, desktop and phone acceptance are still pending.');
})().catch(error=>{console.error(error);process.exitCode=1;});
