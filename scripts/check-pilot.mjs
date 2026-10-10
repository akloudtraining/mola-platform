import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const cwd=fileURLToPath(new URL('..',import.meta.url));
// Behavioral checks for the active D1 pilot, including actual component handlers.
// Staged PostgreSQL assertions and source-text contracts are separate checks.
const suites=['founder-workspace','founder-components','cloudflare-auth-actions','zelle-receipts','test-workspace','test-workspace-client','pilot','funding','approval-policy','bootstrap','export-access','ledger-export','workspace-save','workspace-load','weekly-dues-ui','deadline-ui','deadlines','funding-ui','statements','governance','agreements','agreements-ui','pilot-setup','owner-founder-link','owner-founder-link-ui','contribution-review','contribution-review-ui','contribution-retry','contribution-retry-ui','workspace-brand','workspace-status','pilot-diagnostics','pilot-diagnostics-ui','pilot-launch','member-overview','receipt-queue','receipt-preview','activity-status','external-payouts','external-payouts-ui','due-contribution','treasury-statement','treasury-ui','similar-receipts','collection-instructions','collection-instructions-ui'];
function run(suite){return new Promise(resolve=>{
 const child=spawn(process.execPath,[`tests/${suite}.cjs`],{cwd,stdio:['ignore','pipe','pipe']});let output='';
 child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>output+=chunk);
 child.on('error',error=>resolve({suite,ok:false,output:String(error)}));
 child.on('close',code=>resolve({suite,ok:code===0,output}));
});}
const results=[];let cursor=0;
await Promise.all(Array.from({length:4},async()=>{while(cursor<suites.length){const suite=suites[cursor++];results.push(await run(suite));}}));
for(const suite of suites){const result=results.find(r=>r.suite===suite);console.log(`${result?.ok?'PASS':'FAIL'} ${suite}`);if(!result?.ok)console.error(result?.output||'No result returned');}
const failed=results.filter(r=>!r.ok);
console.log(`${results.length-failed.length}/${suites.length} pilot behavioral suites passed. Real provider email, member access and desktop/phone acceptance are separate evidence.`);
if(failed.length)process.exitCode=1;
