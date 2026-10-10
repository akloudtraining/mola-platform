// Actual diagnostics handlers with deferred requests, account changes and failures.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
const compile=file=>ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
function find(node,predicate){if(Array.isArray(node)){for(const child of node){const match=find(child,predicate);if(match)return match;}return null;}if(!node||typeof node!=='object')return null;if(predicate(node))return node;return find(node.props?.children,predicate);}
function harness(){const state=[],refs=[],calls=[],effects=[],opened=[];let cursor=0,refCursor=0,props={organizationId:'fictional:mola',organizationVersion:1,onOpen:view=>opened.push(view)};const module={exports:{}};
 const req=name=>{
  if(name==='react')return {useState:initial=>{const i=cursor++;if(!(i in state))state[i]=initial;return [state[i],value=>state[i]=typeof value==='function'?value(state[i]):value];},useRef:initial=>{const i=refCursor++;return refs[i]||(refs[i]={current:initial});},useCallback:fn=>fn,useEffect:fn=>effects.push(fn)};
  if(name==='react/jsx-runtime')return {jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props}),Fragment:'Fragment'};
  if(name==='lucide-react')return {RefreshCw:'RefreshCw'};
  if(name==='@/lib/workspace-fetch')return {workspaceFetch:(url,options)=>new Promise((resolve,reject)=>calls.push({url,options,resolve,reject}))};
  throw new Error('Unexpected component import '+name);
 };
 vm.runInNewContext('(function(require,module,exports){'+compile('app/pilot-diagnostics.tsx')+'\n})',{AbortController,console})(req,module,module.exports);
 return {state,calls,effects,opened,render(){cursor=0;refCursor=0;effects.length=0;return module.exports.default(props);},update(next){props={...props,...next};},mount(){return effects[0]();}};
}
const result=orgId=>({organizationId:orgId,organizationVersion:1,checkedAt:'2026-10-04T20:00:00Z',setup:[{id:'owner',title:'Link your founder',recorded:false,detail:'Choose your slot',view:'members'}],provider:[{id:'confirmation',title:'Email confirmation required',status:'pass',detail:'Confirmed setting'}],acceptance:[{id:'delivery',title:'Email delivery',status:'unverified',detail:'Needs inbox testing'}],callbacks:{confirmation:'https://test.example/auth?mode=confirmed',recovery:'https://test.example/auth?mode=reset'}});
const tick=()=>new Promise(setImmediate);
async function checkOwnerVisibility(){
 const state=[],refs=[];let cursor=0,refCursor=0;
 const org={id:'fictional:mola',version:1,name:'Fictional Mola',mode:'Shared ownership',currency:'USD',members:[{id:'founder-1',name:'Fictional Member',role:'Member'}],permissions:{isOwner:true,canManage:true,memberId:''}};
 let organizations=[org,{...org,id:'fictional:cameroon',name:'Cameroon land group',mode:'Individual land allocations'}];
 const module={exports:{}};
 const req=name=>{
  if(name==='react')return {useState:initial=>{const i=cursor++;if(!(i in state))state[i]=initial;return [state[i],value=>state[i]=typeof value==='function'?value(state[i]):value];},useRef:initial=>{const i=refCursor++;return refs[i]||(refs[i]={current:initial});},useCallback:fn=>fn,useEffect(){}};
  if(name==='react/jsx-runtime')return {jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};
  if(name==='@/lib/workspace-load')return {readWorkspace:async()=>({organizations,entries:[],name:'Fictional',email:'fictional@example.test'}),WorkspaceLoadError:class extends Error{}};
  if(name==='@/lib/model')return {money:n=>String(n),weeklyMinimum:()=>10000};
  if(name.startsWith('./'))return {default:name==='./pilot-diagnostics'?'PilotDiagnostics':'Child'};
  return new Proxy({},{get:(_,key)=>String(key)});
 };
 vm.runInThisContext('(function(require,module,exports){'+compile('app/page.tsx')+'\n})')(req,module,module.exports);
 const render=()=>{cursor=0;refCursor=0;return module.exports.default();};
 let tree=render();await find(tree,node=>node.type==='button'&&node.props['aria-label']==='Refresh workspace').props.onClick();tree=render();
 const members=find(tree,node=>node.type==='SidebarMenuButton'&&find(node,child=>child.type==='span'&&child.props.children==='Founders'));members.props.onClick();tree=render();assert(find(tree,node=>node.type==='PilotDiagnostics'),'Mola owner has the onboarding checks');
 find(tree,node=>node.props?.label==='Organization').props.onChange('fictional:cameroon');tree=render();assert.equal(find(tree,node=>node.type==='PilotDiagnostics'),null,'Land group does not inherit Mola onboarding');
 find(tree,node=>node.props?.label==='Organization').props.onChange(org.id);organizations=[{...org,permissions:{isOwner:false,canManage:false,memberId:'founder-1'}}];tree=render();await find(tree,node=>node.type==='button'&&node.props['aria-label']==='Refresh workspace').props.onClick();tree=render();assert.equal(find(tree,node=>node.type==='PilotDiagnostics'),null,'Ordinary members cannot see owner diagnostics');
}
(async()=>{
 const h=harness();let tree=h.render();const cleanup=h.mount();tree=h.render();assert.equal(h.calls.length,1);assert.equal(h.calls[0].url,'/api/pilot/readiness?orgId=fictional%3Amola');assert.equal(find(tree,node=>node.type==='button'&&node.props.onClick).props.disabled,true);
 const duplicate=find(tree,node=>node.type==='button'&&node.props.onClick).props.onClick();assert.equal(h.calls.length,1,'Pending clicks do not duplicate checks');await duplicate;
 h.calls[0].resolve(Response.json(result('fictional:mola')));await tick();tree=h.render();assert(h.state[0]);assert.equal(h.state[1],false);assert(find(tree,node=>node.type==='span'&&node.props.children==='Needs acceptance'));assert(find(tree,node=>node.type==='span'&&node.props.children==='Verified setting'));assert.equal(find(tree,node=>node.type==='checkbox'),null,'No control can certify external tests without evidence');
 find(tree,node=>node.type==='button'&&node.props.className==='setup-row').props.onClick();assert.deepEqual(h.opened,['members']);
 const pending=find(tree,node=>node.type==='button'&&node.props.onClick).props.onClick();assert.equal(h.state[0],null,'A fresh check does not keep old results appearing current');h.calls[1].resolve(Response.json({error:'Fictional owner access denied'},{status:403}));await pending;tree=h.render();assert.equal(h.state[0],null);assert.match(h.state[2],/owner access denied/);
 const malformed=find(tree,node=>node.type==='button'&&node.props.onClick).props.onClick();h.calls[2].resolve(Response.json({...result('fictional:mola'),organizationId:'another:mola'}));await malformed;assert.equal(h.state[0],null);assert.match(h.state[2],/could not be confirmed/);
 tree=h.render();const stale=find(tree,node=>node.type==='button'&&node.props.onClick).props.onClick();cleanup();assert.equal(h.calls[3].options.signal.aborted,true);h.update({organizationId:'next:mola',organizationVersion:2});h.render();const nextCleanup=h.mount();assert.equal(h.calls.length,5);h.calls[3].resolve(Response.json(result('fictional:mola')));await stale;assert.equal(h.state[0],null,'Late results from a departed organization cannot appear');h.calls[4].resolve(Response.json({...result('next:mola'),organizationVersion:2}));await tick();assert.equal(h.state[0].organizationId,'next:mola');nextCleanup();
 await checkOwnerVisibility();
 console.log('PILOT DIAGNOSTICS UI PASS: owner-only Mola visibility, duplicate-click guard, scoped setup links, distinct verified/unverified labels, retained failure, invalid response rejection and aborted/stale organization protection.');
})().catch(error=>{console.error(error);process.exitCode=1;});
