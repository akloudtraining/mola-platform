const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
function harness(file){
 const states=[],ref={current:false},calls=[],notices=[];let cursor=0,resolve,reject;
 const m={exports:{}};
 const req=name=>{
  if(name==='react')return {useRef:()=>ref,useState:initial=>{const index=cursor++;if(!(index in states))states[index]=initial;return [states[index],v=>states[index]=v];}};
  if(name==='react/jsx-runtime')return {jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};
  if(name==='@/lib/workspace-save')return {saveWorkspaceRecord:body=>{calls.push(body);return new Promise((yes,no)=>{resolve=yes;reject=no;});}};
  if(name==='sonner')return {toast:{success:s=>notices.push(s),warning:s=>notices.push(s)}};
  return new Proxy({},{get:(_,key)=>String(key)});
 };
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 vm.runInThisContext('(function(require,module,exports){'+code+'\n})')(req,m,m.exports);
 let tree;
 function find(predicate,node=tree){if(!node||typeof node!=='object')return null;if(predicate(node))return node;for(const child of [node.props?.children].flat(2)){if(child===undefined)continue;const result=find(predicate,child);if(result)return result;}return null;}
 return {calls,notices,render(props){cursor=0;tree=m.exports.default(props);},find,fail:()=>reject(new Error('Conflict: close and refresh before editing.')),succeed:()=>resolve({entry:{id:'due'},organization:{id:'org'}})};
}
(async()=>{
 for(const name of ['weekly-cutoff','obligation-deadline']){
  const h=harness('app/'+name+'.tsx'),locks=[];
  const props={org:{id:'org',version:1,permissions:{canManage:true},members:[{id:'founder',name:'Fictional founder'}],weeklySchedule:{startDate:'2026-10-05',deadlineRule:{time:'17:00',timeZone:'UTC'}}},entry:{id:'due',memberId:'founder',title:'Weekly due',date:'2026-10-05',deadline:{at:'old-cutoff',localDateTime:'2026-10-05T17:00',timeZone:'UTC'},deadlineHistory:[]},reload:async()=>{},onBusy:value=>locks.push(value)};
  h.render(props);h.find(n=>n.type==='button').props.onClick();h.render(props);
  h.find(n=>n.type==='textarea').props.onChange({target:{value:'Agreed meeting change'}});
  const newer={...props,org:{...props.org,version:9},entry:{...props.entry,deadline:{...props.entry.deadline,at:'new-cutoff'},deadlineHistory:[{deadline:props.entry.deadline,actorName:'Fictional owner',reason:'Another change',at:'2026-10-03T00:00:00Z'}]}};
  h.render(newer);
  const form=h.find(n=>n.type==='form'),a=form.props.onSubmit({preventDefault(){}}),b=form.props.onSubmit({preventDefault(){}});
  assert.equal(h.calls.length,1);assert.deepEqual(locks,[true]);assert.equal(h.calls[0].version,1,'Save must retain the opening version despite new props');assert.equal(h.calls[0].reason,'Agreed meeting change');
  if(name==='obligation-deadline'){assert.equal(h.calls[0].deadlineAt,'old-cutoff');assert.equal(h.calls[0].historyCount,0);}
  h.find(n=>n.type==='Dialog').props.onOpenChange(false);h.render(newer);assert.equal(h.find(n=>n.type==='Dialog').props.open,true);
  h.fail();await Promise.all([a,b]);h.render(newer);assert.equal(h.find(n=>n.type==='textarea').props.value,'Agreed meeting change');assert.equal(h.find(n=>n.type==='Dialog').props.open,true);assert.equal(h.notices.length,0);assert.deepEqual(locks,[true,false]);
 }
 console.log('DEADLINE UI PASS: both editors retain opening version through refreshed props, block rapid duplicate saves and dismissal, and preserve drafts on conflicts; individual cutoff/history baseline is unchanged.');
})().catch(e=>{console.error(e);process.exitCode=1;});
