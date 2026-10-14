// Payment alert emails with fictional members and a stubbed Resend API.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
const env={RESEND_API_KEY:'re_test',MOLA_EMAIL_FROM:'Mola <alerts@example.test>',MOLA_APP_URL:'https://app.example.test',MOLA_OWNER_EMAIL:'owner@example.test'};
const sent=[];global.fetch=async(url,options)=>{assert.equal(url,'https://api.resend.com/emails');sent.push(JSON.parse(options.body));return new Response('{}',{status:200});};
const money=(minor)=>'$'+(minor/100).toFixed(2);
const mod={exports:{}};
const req=name=>name==='cloudflare:workers'?{env}:name==='./model'?{money}:{};
vm.runInThisContext('(function(require,module,exports){'+ts.transpileModule(fs.readFileSync('lib/notifications.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText+'\n})')(req,mod,mod.exports);
const {reviewRecipients,notifyReviewNeeded,notifyReviewOutcome,recordLink}=mod.exports;
const member=(id,name,access)=>({id,name,role:'Founder',access});
const org={id:'fictional:mola',members:[
 member('a','Alice Test',{email:'alice@example.test',enabled:true,canReview:true,userId:'u-a'}),
 member('b','Blair Test',{email:'blair@example.test',enabled:true,canReview:false,userId:'u-b'}),
 member('c','Casey Test',{email:'casey@example.test',enabled:true,canReview:true,userId:'u-c'}),
 member('d','Drew Test',{email:'drew@example.test',enabled:false,canReview:true,userId:'u-d'}),
]};
const payment={id:'pay-1',orgId:org.id,type:'contribution',title:'Weekly',memberId:'a',submittedBy:'u-a',amountMinor:2500,currency:'USD',method:'Zelle (external)',date:'2026-10-17',status:'Awaiting verification'};
(async()=>{
 assert.deepEqual(reviewRecipients(org,payment).map(r=>r.email),['casey@example.test'],'Only enabled reviewers other than the contributor are alerted');
 assert.deepEqual(reviewRecipients(org,{...payment,memberId:'b',submittedBy:'u-c'}).map(r=>r.email),['alice@example.test'],'The submitter is excluded too');
 assert.deepEqual(reviewRecipients({...org,members:org.members.map(m=>({...m,access:{...m.access,canReview:false}}))},payment).map(r=>r.email),['owner@example.test'],'With no reviewers the owner is alerted');
 await notifyReviewNeeded(org,payment,'https://ignored.example.test');
 assert.equal(sent.length,1);assert.deepEqual(sent[0].to,['casey@example.test'],'One recipient per email: addresses are never shared');
 assert.match(sent[0].subject,/^Payment to review: Alice Test · \$25\.00 USD$/);
 assert(sent[0].text.includes(recordLink('','pay-1'))&&sent[0].text.includes('https://app.example.test/?record=pay-1'),'Links straight to the payment');
 assert(sent[0].text.includes('If someone has already reviewed it'),'Explains what to do if another reviewer got there first');
 await notifyReviewOutcome(org,{...payment,status:'Verified'},'Verified','Casey Test','Checked bank deposit','https://ignored.example.test');
 assert.equal(sent.length,2);assert.deepEqual(sent[1].to,['alice@example.test']);assert.match(sent[1].subject,/^Your payment was verified/);
 await notifyReviewOutcome(org,{...payment,status:'Rejected'},'Rejected','Casey Test','Amount differs from the deposit','https://ignored.example.test');
 assert.match(sent[2].subject,/needs a correction/);assert(sent[2].text.includes('Amount differs from the deposit'));
 await notifyReviewOutcome(org,{...payment,status:'Awaiting verification'},'Awaiting verification','Casey Test','x','https://ignored.example.test');
 assert.equal(sent.length,3,'Returning a payment to pending sends nothing');
 global.fetch=async()=>{throw new Error('network down');};const log=console.error;console.error=()=>{};
 await notifyReviewNeeded(org,payment,'https://ignored.example.test');console.error=log;
 env.RESEND_API_KEY='';const before=sent.length;await notifyReviewNeeded(org,payment,'x');assert.equal(sent.length,before,'No provider key means no send attempt');
 console.log('PAYMENT NOTIFICATIONS PASS: reviewer-only alerts (owner fallback), contributor outcome emails, direct payment links, one recipient per email, failures never throw.');
})().catch(error=>{console.error(error);process.exitCode=1;});
