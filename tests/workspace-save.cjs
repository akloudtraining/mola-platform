const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
const code=ts.transpileModule(fs.readFileSync('lib/workspace-save.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
let calls=0,handler;
const m={exports:{}};
vm.runInNewContext('(function(module,exports){'+code+'\n})',{require:()=>({workspaceEndpoint:input=>input}),fetch:async(url,init)=>{calls++;assert.equal(url,'/api/workspace');assert.equal(init.method,'POST');assert.equal(JSON.parse(init.body).submissionId,'same-submission');return handler();}})(m,m.exports);
const body={action:'contribution',submissionId:'same-submission',amount:'100.00'};
async function rejected(fn,pattern){handler=fn;const before=calls;await assert.rejects(m.exports.saveWorkspaceRecord(body),pattern);assert.equal(calls,before+1,'Mutations must never be replayed');assert.equal(body.submissionId,'same-submission');}
(async()=>{
 handler=()=>Response.json({entry:{id:'fictional',status:'Pending'}});assert.equal((await m.exports.saveWorkspaceRecord(body)).entry.id,'fictional');
 handler=()=>Response.json({organization:{id:'fictional-org'}});assert.equal((await m.exports.saveWorkspaceRecord(body)).organization.id,'fictional-org');
 await rejected(()=>{throw new Error('offline');},/may already have saved/);
 await rejected(()=>Response.json({error:'unavailable'},{status:503}),/may already have saved/);
 await rejected(()=>new Response('<html>proxy error</html>'),/could not be confirmed/);
 await rejected(()=>Response.json({ok:true}),/could not be confirmed/);
 await rejected(()=>Response.json({error:'expired'},{status:401}),/Sign in in another tab/);
 await rejected(()=>Response.json({error:'Record changed. Reload before editing.'},{status:409}),/Record changed/);
 await rejected(()=>Response.json({error:'Not allowed'},{status:403}),/Not allowed/);
 console.log('WORKSPACE SAVE PASS: confirmed entry/settings, unchanged submission ID, no retries, network/5xx/malformed uncertainty, expired-session recovery and conflict/permission feedback.');
})().catch(e=>{console.error(e);process.exitCode=1;});
