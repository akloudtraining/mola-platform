const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
const code=ts.transpileModule(fs.readFileSync('app/weekly-dues.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
function harness(){
 const preview={records:[{id:'due-1',date:'2026-10-05',memberId:'founder-1',amountMinor:10000}],skipped:0,totalMinor:10000,firstDate:'2026-10-05',token:'preview-token',version:3};
 const state=[false,'100','2026-10-05','2026-10-05','4',preview,false,'','','UTC'];let cursor=0,resolve,reject,calls=[],notices=[],reloads=0;const ref={current:false},m={exports:{}};
 const req=name=>{
  if(name==='@/lib/workspace-endpoint')return {workspaceEndpoint:input=>input};
  if(name==='react')return {useRef:()=>ref,useState:()=>{const index=cursor++;return [state[index],v=>state[index]=v];}};
  if(name==='react/jsx-runtime')return {jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};
  if(name==='@/lib/model')return {money:()=> '100.00',weeklyMinimum:()=>10000};
  if(name==='sonner')return {toast:{success:message=>notices.push(message)}};
  return new Proxy({},{get:(_,key)=>String(key)});
 };
 vm.runInNewContext('(function(require,module,exports){'+code+'\n})',{fetch:async(url,init)=>{calls.push(JSON.parse(init.body));return new Promise((yes,no)=>{resolve=yes;reject=no;});}})(req,m,m.exports);
 const tree=m.exports.default({org:{id:'org-test',version:3,currency:'USD',members:[{id:'founder-1',name:'Fictional founder'}],permissions:{canManage:true},weeklySchedule:{startDate:'2026-10-05',rates:[],history:[],deadlineRule:{}}},reload:async()=>{reloads++;}});
 function find(predicate,node){if(!node||typeof node!=='object')return null;if(predicate(node))return node;for(const child of [node.props?.children].flat(2)){const found=find(predicate,child);if(found)return found;}return null;}
 return {state,calls,notices,ref,find:p=>find(p,tree),respond:data=>resolve(Response.json(data)),fail:()=>reject(new Error('offline')),reloads:()=>reloads};
}
(async()=>{
 let h=harness(),button=h.find(n=>n.type==='button'&&n.props.children==='Generate previewed obligations');
 const first=button.props.onClick(),second=button.props.onClick();assert.equal(h.calls.length,1);assert.equal(h.calls[0].token,'preview-token');assert.equal(h.calls[0].version,3);assert.equal(h.state[5],null);
 h.fail();await Promise.all([first,second]);assert.match(h.state[7],/some records may already have been saved/);assert.equal(h.state[5],null);assert.equal(h.notices.length,0);assert.equal(h.ref.current,false);
 h=harness();const request=h.find(n=>n.type==='button'&&n.props.children==='Generate previewed obligations').props.onClick();h.respond({generated:1});await request;assert.equal(h.reloads(),1);assert.equal(h.notices[0],'1 weekly obligations generated');assert.equal(h.state[5],null);
 h=harness();h.find(n=>n.type==='form'&&n.props.className==='schedule-controls').props.onSubmit({preventDefault(){}});assert.equal(h.state[5],null,'An old preview must clear before a replacement request');h.respond({preview:null});await new Promise(r=>setImmediate(r));assert.match(h.state[7],/preview could not be loaded/);assert.equal(h.state[5],null);
 console.log('WEEKLY DUES UI PASS: one generation for duplicate clicks, preview token/version retained, uncertain generation requires a fresh preview, confirmed count reported, failed preview clears stale data.');
})().catch(e=>{console.error(e);process.exitCode=1;});
