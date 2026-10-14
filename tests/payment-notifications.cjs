// Payment alert emails with fictional founders and a stubbed Resend API.
// Rule: every founder hears about each step except the person who took it.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
const env={RESEND_API_KEY:'re_test',MOLA_EMAIL_FROM:'Mola <alerts@example.test>',MOLA_APP_URL:'https://app.example.test',MOLA_OWNER_EMAIL:'owner@example.test'};
let sent=[];global.fetch=async(url,options)=>{assert.equal(url,'https://api.resend.com/emails');sent.push(JSON.parse(options.body));return new Response('{}',{status:200});};
const mod={exports:{}};
const emailStub={emailConfigured:()=>!!env.RESEND_API_KEY&&!!env.MOLA_EMAIL_FROM,sendEmail:async(to,subject,text,html)=>{const r=await fetch('https://api.resend.com/emails',{method:'POST',body:JSON.stringify({from:env.MOLA_EMAIL_FROM,to:[to],subject,text,html})});if(!r.ok)throw new Error('send failed');}};
const req=name=>name==='cloudflare:workers'?{env}:name==='./model'?{money:minor=>'$'+(minor/100).toFixed(2)}:name==='./email'?emailStub:{};
vm.runInThisContext('(function(require,module,exports){'+ts.transpileModule(fs.readFileSync('lib/notifications.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText+'\n})')(req,mod,mod.exports);
const {founderRecipients,notifyPaymentEvent}=mod.exports;
const member=(id,name,email,userId,enabled=true)=>({id,name,role:'Founder',access:{email,enabled,canReview:true,userId}});
const org={id:'fictional:mola',members:[member('a','Alice Test','alice@example.test','u-a'),member('b','Blair Test','blair@example.test','u-b'),member('c','Casey Test','casey@example.test','u-c'),member('d','Drew Test','drew@example.test','u-d',false),member('e','Eli Test','eli@example.test',undefined)]};
const payment={id:'pay-1',orgId:org.id,type:'contribution',title:'Weekly',memberId:'a',amountMinor:2500,currency:'USD',method:'Zelle (external)',date:'2026-10-17',status:'Awaiting verification'};
const to=()=>sent.map(m=>m.to[0]).sort();
(async()=>{
 // Owner u-owner is not linked to a founder slot, so the configured owner email is included.
 assert.deepEqual(founderRecipients(org,'u-owner','u-a').map(r=>r.email).sort(),['blair@example.test','casey@example.test','eli@example.test','owner@example.test'],'Everyone enabled except the actor; disabled access is skipped');
 assert.deepEqual(founderRecipients(org,'u-a','u-c').map(r=>r.email).sort(),['alice@example.test','blair@example.test','eli@example.test'],'A linked owner is reached through their founder slot, not twice');
 await notifyPaymentEvent('submitted',org,payment,'u-owner','u-a','','','https://ignored.example.test');
 assert.deepEqual(to(),['blair@example.test','casey@example.test','eli@example.test','owner@example.test'],'Submitter is not emailed');
 assert(sent.every(m=>m.to.length===1),'One recipient per email: addresses are never shared');
 assert.match(sent[0].subject,/^New payment submitted: Alice Test · \$25\.00 USD$/);
 assert(sent[0].text.includes('https://app.example.test/?record=pay-1'),'Links straight to the payment');
 assert(sent[0].text.includes('If someone has already reviewed it'),'Explains what happens when another reviewer got there first');
 sent=[];await notifyPaymentEvent('Rejected',org,payment,'u-owner','u-c','Casey Test','Amount differs from the deposit','x');
 assert.deepEqual(to(),['alice@example.test','blair@example.test','eli@example.test','owner@example.test'],'Rejecter is not emailed; the contributor is');
 const alice=sent.find(m=>m.to[0]==='alice@example.test'),blair=sent.find(m=>m.to[0]==='blair@example.test');
 assert(alice.text.includes('returned your payment')&&alice.text.includes('You can correct'),'The contributor reads it as their own payment');
 assert(blair.text.includes('returned Alice Test’s payment')&&blair.text.includes('Amount differs from the deposit'));
 sent=[];await notifyPaymentEvent('resubmitted',org,payment,'u-owner','u-a','Alice Test','','x');
 assert.deepEqual(to(),['blair@example.test','casey@example.test','eli@example.test','owner@example.test'],'Resubmitter is not emailed');
 assert.match(sent[0].subject,/^Payment corrected and resubmitted/);
 sent=[];await notifyPaymentEvent('Verified',org,payment,'u-owner','u-b','Blair Test','Matched deposit','x');
 assert.deepEqual(to(),['alice@example.test','casey@example.test','eli@example.test','owner@example.test'],'Verifier is not emailed');
 assert(sent.find(m=>m.to[0]==='alice@example.test').text.includes('Blair Test verified your payment'));
 global.fetch=async()=>{throw new Error('network down');};const log=console.error;console.error=()=>{};
 await notifyPaymentEvent('submitted',org,payment,'u-owner','u-a','','','x');console.error=log;
 env.RESEND_API_KEY='';sent=[];global.fetch=async()=>{sent.push(1);return new Response('{}');};
 await notifyPaymentEvent('submitted',org,payment,'u-owner','u-a','','','x');assert.equal(sent.length,0,'No provider key means no send attempt');
 console.log('PAYMENT NOTIFICATIONS PASS: every founder except the actor on submit, verify, reject and resubmit; contributor gets personal wording; direct links; one recipient per email; failures never throw.');
})().catch(error=>{console.error(error);process.exitCode=1;});
