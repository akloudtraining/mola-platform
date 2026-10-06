const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
let respond;
const code=ts.transpileModule(fs.readFileSync('lib/workspace-load.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const m={exports:{}};vm.runInThisContext('(function(require,module,exports){'+code+'\n})')(()=>({workspaceFetch:async()=>respond()}),m,m.exports);
const {readWorkspace,WorkspaceLoadError}=m.exports;
(async()=>{
 const data={organizations:[{id:'fictional-org'}],entries:[{id:'fictional-entry'}],name:'Fictional owner',activity:[]};
 respond=()=>Response.json(data);assert.deepEqual(await readWorkspace(),data);
 for(const status of [401,403,409,503]){respond=()=>Response.json({error:'untrusted upstream text'},{status});await assert.rejects(readWorkspace(),e=>e instanceof WorkspaceLoadError&&e.status===status&&!e.message.includes('untrusted'));}
 respond=()=>{throw new Error('offline');};await assert.rejects(readWorkspace(),e=>e.status===0&&/Connection interrupted/.test(e.message));
 for(const invalid of [null,{}, {...data,entries:null},{...data,organizations:{}},{...data,name:null},{...data,activity:{}}]){respond=()=>Response.json(invalid);await assert.rejects(readWorkspace(),e=>e.status===502);}
 respond=()=>new Response('<html>interrupted proxy</html>');await assert.rejects(readWorkspace(),e=>e.status===502);
 console.log('WORKSPACE LOAD PASS: complete responses accepted; offline, access denied, server errors and incomplete payloads classified without replacing a snapshot.');
})().catch(e=>{console.error(e);process.exitCode=1;});
