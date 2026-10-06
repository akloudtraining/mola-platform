// Actual workspace and save-service handlers; fictional records and simulated connection failures.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),originalFetch=global.fetch;
function harness(){
 const state=[],refs=[],calls=[],messages=[],cache=new Map();let cursor=0,refCursor=0,resolve,reject,records=[];
 const org={id:'fictional-org',name:'Fictional Mola',mode:'Shared ownership',currency:'USD',members:[{id:'alice',name:'Fictional Alice',role:'Member'},{id:'bob',name:'Fictional Bob',role:'Member'}],permissions:{isOwner:false,canManage:false,memberId:'alice'}};
 const compile=file=>ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 global.fetch=async(url,init)=>{assert.equal(url,'/api/workspace');assert.equal(init.method,'POST');calls.push(JSON.parse(init.body));return new Promise((yes,no)=>{resolve=yes;reject=no;});};
 function load(file){if(cache.has(file))return cache.get(file).exports;const mod={exports:{}};cache.set(file,mod);vm.runInThisContext('(function(require,module,exports){'+compile(file)+'\n})',{filename:file})(reqFor(file),mod,mod.exports);return mod.exports;}
 function reqFor(file){return name=>{
  if(name==='react')return {useState:initial=>{const i=cursor++;if(!(i in state))state[i]=initial;return [state[i],v=>state[i]=typeof v==='function'?v(state[i]):v];},useRef:initial=>{const i=refCursor++;return refs[i]||(refs[i]={current:initial});},useCallback:fn=>fn,useEffect(){}};
  if(name==='react/jsx-runtime')return {jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};
  if(name==='@/lib/workspace-load')return {readWorkspace:async()=>({organizations:[org],entries:records,name:'Fictional Alice',email:'alice@example.test'}),WorkspaceLoadError:class extends Error{}};
  if(name==='sonner')return {Toaster:'Toaster',toast:{success:s=>messages.push(s),error:s=>messages.push(s)}};
  if(name.startsWith('@/lib/'))return load(name.slice(2)+'.ts');
  if(name.startsWith('./'))return file.startsWith('lib/')?load(path.join(path.dirname(file),name)+'.ts'):{default:name.slice(2)};
  return new Proxy({},{get:(_,key)=>String(key)});
 };}
 const text=node=>typeof node==='string'?node:Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';
 function find(node,predicate){if(Array.isArray(node)){for(const child of node){const hit=find(child,predicate);if(hit)return hit;}return null;}if(!node||typeof node!=='object')return null;if(predicate(node))return node;return find(node.props?.children,predicate);}
 const Page=load('app/page.tsx').default,render=()=>{cursor=0;refCursor=0;return Page();};
 const button=(tree,label)=>find(tree,n=>n.type==='button'&&text(n).trim()===label);
 const field=(tree,label)=>find(find(tree,n=>n.type==='label'&&text(n).startsWith(label)),n=>n.type==='input'||n.type==='textarea');
 return {org,calls,messages,text,render,button,field,find,respond:(status,data)=>resolve(Response.json(data,{status})),fail:()=>reject(new Error('Fictional interrupted connection')),setRecords:next=>records=next};
}
(async()=>{
 const h=harness();let tree=h.render();await h.find(tree,n=>n.type==='button'&&n.props['aria-label']==='Refresh workspace').props.onClick();tree=h.render();h.button(tree,'Record contribution').props.onClick();tree=h.render();h.field(tree,'Amount reported').props.onChange({target:{value:'150.00'}});tree=h.render();
 const first=h.find(tree,n=>n.type==='form').props.onSubmit({preventDefault(){}}),duplicate=h.find(tree,n=>n.type==='form').props.onSubmit({preventDefault(){}});assert.equal(h.calls.length,1);const initial=h.calls[0];assert.equal(initial.memberId,'alice');assert.equal(initial.amount,'150.00');assert.match(initial.submissionId,/^[a-f0-9-]{36}$/);
 tree=h.render();assert(h.find(tree,n=>n.type==='fieldset').props.disabled);h.find(tree,n=>n.type==='Dialog'&&n.props.open).props.onOpenChange(false);assert(h.find(h.render(),n=>n.type==='form'));h.fail();await Promise.all([first,duplicate]);tree=h.render();assert.match(h.text(tree),/may already have saved it/);assert.equal(h.field(tree,'Amount reported').props.value,'150.00');assert.equal(h.calls.length,1);assert.equal(h.messages.length,0);
 const confirmed={id:h.org.id+':'+initial.submissionId,orgId:h.org.id,type:'contribution',memberId:'alice',title:initial.title,amountMinor:15000,currency:initial.currency,date:initial.date,method:initial.method,reference:initial.reference,purpose:initial.purpose,status:'Awaiting verification',created:'2026-10-04T23:00:00.000Z'};h.setRecords([confirmed]);await h.find(tree,n=>n.type==='button'&&n.props['aria-label']==='Refresh workspace').props.onClick();tree=h.render();assert.equal(h.field(tree,'Amount reported').props.value,'150.00');
 h.field(tree,'Amount reported').props.onChange({target:{value:'200.00'}});tree=h.render();const changed=h.find(tree,n=>n.type==='form').props.onSubmit({preventDefault(){}});assert.equal(h.calls.length,2);assert.equal(h.calls[1].submissionId,initial.submissionId,'Changing a retained draft must not mint a second submission');assert.equal(h.calls[1].amount,'200.00');h.respond(409,{error:'An earlier record was already saved from this form with different details. Check the recorded details before submitting another report.'});await changed;tree=h.render();assert.match(h.text(tree),/already saved.*different details/);assert.equal(h.field(tree,'Amount reported').props.value,'200.00');assert(h.find(tree,n=>n.type==='form'));assert.equal(h.messages.length,0,'A rejected conflict cannot announce success');assert.equal(h.calls.length,2,'Conflicts are not automatically replayed');
 // The member deliberately restores the original report; an exact retry can confirm it.
 h.field(tree,'Amount reported').props.onChange({target:{value:'150.00'}});tree=h.render();const same=h.find(tree,n=>n.type==='form').props.onSubmit({preventDefault(){}});assert.equal(h.calls.length,3);assert.equal(h.calls[2].submissionId,initial.submissionId);h.respond(200,{entry:confirmed});await same;assert.equal(h.find(h.render(),n=>n.type==='form'),null);assert.equal(h.messages.length,1);assert.match(h.messages[0],/Awaiting verification/);
 console.log('CONTRIBUTION RETRY UI PASS: interrupted saves and background refresh preserve the original submission ID; conflicting details stay editable without success/replay; exact retry confirms one saved report. Browser/layout acceptance remains pending.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{global.fetch=originalFetch;});
