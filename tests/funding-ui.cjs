// Actual funding component handlers, with fictional records and a deferred save.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
const code=ts.transpileModule(fs.readFileSync('app/funding-requests.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
function harness(edit){
 const entry={id:'fictional-request',title:'Fictional purchase',amountMinor:10000,currency:'USD',date:'2026-10-01',created:'2026-10-01T00:00:00Z',status:'Awaiting approvals',canApprove:true,funding:{token:'current-version-token',revision:1,count:0,required:3,availableApprovers:4,canEdit:true}};
 const state=[entry,edit,false,''];let cursor=0,calls=[],resolve,reject,reloads=0,locks=[];
 const ref={current:false},m={exports:{}};
 const req=name=>{
  if(name==='react')return {useRef:()=>ref,useState:()=>{const index=cursor++;return [state[index],v=>state[index]=v];}};
  if(name==='react/jsx-runtime')return {jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};
  if(name==='@/lib/workspace-save')return {saveWorkspaceRecord:body=>{calls.push(body);return new Promise((yes,no)=>{resolve=yes;reject=no;});}};
  if(name==='@/lib/model')return {money:()=> '100.00'};
  return new Proxy({},{get:(_,key)=>String(key)});
 };
 vm.runInThisContext('(function(require,module,exports){'+code+'\n})')(req,m,m.exports);
 const tree=m.exports.default({org:{id:'fictional-org'},requests:[entry],onCreate(){},onBusy:value=>locks.push(value),reload:async()=>{reloads++;}});
 function find(predicate,node){if(!node||typeof node!=='object')return null;if(predicate(node))return node;const children=node.props?.children;for(const child of Array.isArray(children)?children:[children]){if(Array.isArray(child)){for(const nested of child){const result=find(predicate,nested);if(result)return result;}}else{const result=find(predicate,child);if(result)return result;}}return null;}
 return {state,calls,entry,ref,locks,find:predicate=>find(predicate,tree),complete:data=>resolve(data),fail:()=>reject(new Error('The save could not be confirmed.')),reloads:()=>reloads};
}
(async()=>{
 const draft={title:'Revised title',amount:'200',currency:'USD',date:'2026-10-01',reference:'masked',purpose:'Fictional investment',reason:'Recorded meeting decision'};
 let h=harness(draft),form=h.find(n=>n.type==='form');
 form.props.onSubmit({preventDefault(){}});form.props.onSubmit({preventDefault(){}});
 assert.equal(h.calls.length,1);assert.deepEqual(h.locks,[true]);assert.equal(h.calls[0].token,'current-version-token');assert.equal(h.calls[0].reason,draft.reason);
 h.find(n=>n.type==='Dialog').props.onOpenChange(false);assert.equal(h.state[0],h.entry,'Pending request must not be dismissed');
 h.fail();await new Promise(r=>setImmediate(r));assert.equal(h.state[1],draft);assert.match(h.state[3],/could not be confirmed/);assert.equal(h.ref.current,false);assert.deepEqual(h.locks,[true,false]);
 h=harness(null);const approve=h.find(n=>n.type==='button'&&n.props.children==='Approve this version');approve.props.onClick();approve.props.onClick();assert.equal(h.calls.length,1);assert.equal(h.calls[0].action,'approveRequest');assert.equal(h.calls[0].token,'current-version-token');
 const saved={...h.entry,status:'Authorized'};h.complete({entry:saved});await new Promise(r=>setImmediate(r));assert.equal(h.state[0],saved);assert.equal(h.reloads(),1);assert.equal(h.state[2],false);
 console.log('FUNDING UI PASS: revision/approval duplicate clicks blocked; version token retained; pending dismissal blocked; failed revision preserves draft; confirmed approval updates the displayed request.');
})().catch(e=>{console.error(e);process.exitCode=1;});
