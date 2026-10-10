// Actual component handlers; isolated fictional setup and deferred requests.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
const compile=file=>ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
function harness(){
 const state=[],refs=[],calls=[],saved=[],workspaceBusy=[];let cursor=0,refCursor=0,resolve,reject,reloads=0;
 let props={org:{id:'fictional-org',mode:'Shared ownership',version:7,members:[{id:'founder-1',name:'Founder 1',role:'Name pending'},{id:'founder-2',name:'Fictional Assigned',role:'Member',access:{email:'someone@example.test',enabled:true,claimed:false}},{id:'founder-3',name:'Fictional Linked',role:'Member',access:{email:'linked@example.test',enabled:true,claimed:true}}],permissions:{isOwner:true,memberId:''}},email:'owner@example.test',disabled:false,onBusy:busy=>workspaceBusy.push(busy),onSaved:org=>saved.push(org),reload:async()=>{reloads++;}};
 const helper={exports:{}};vm.runInThisContext('(function(module,exports){'+compile('lib/founder-link.ts')+'\n})')(helper,helper.exports);
 const mod={exports:{}};
 function req(name){
  if(name==='react')return {useState:initial=>{const i=cursor++;if(!(i in state))state[i]=initial;return [state[i],value=>state[i]=typeof value==='function'?value(state[i]):value];},useRef:initial=>{const i=refCursor++;return refs[i]||(refs[i]={current:initial});}};
  if(name==='react/jsx-runtime')return {jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};
  if(name==='@/lib/workspace-save')return {saveWorkspaceRecord:body=>{calls.push(body);return new Promise((yes,no)=>{resolve=yes;reject=no;});}};
  if(name==='@/lib/founder-link')return helper.exports;
  return new Proxy({},{get:(_,key)=>String(key)});
 }
 vm.runInThisContext('(function(require,module,exports){'+compile('app/owner-founder-link.tsx')+'\n})')(req,mod,mod.exports);
 function find(node,predicate){if(Array.isArray(node)){for(const child of node){const r=find(child,predicate);if(r)return r;}return null;}if(!node||typeof node!=='object')return null;if(predicate(node))return node;return find(node.props?.children,predicate);}
 function all(node,predicate,out=[]){if(Array.isArray(node)){for(const child of node)all(child,predicate,out);return out;}if(!node||typeof node!=='object')return out;if(predicate(node))out.push(node);all(node.props?.children,predicate,out);return out;}
 const render=()=>{cursor=0;refCursor=0;return mod.exports.default(props);};
 return {state,calls,saved,workspaceBusy,render,find,all,props:()=>props,update:next=>props={...props,...next},complete:data=>resolve(data),fail:message=>reject(new Error(message)),reloads:()=>reloads};
}
const button=(h,tree,text)=>h.find(tree,n=>n.type==='button'&&n.props.children===text);
function prepare(h){let tree=h.render();button(h,tree,'Link my founder account').props.onClick();tree=h.render();assert.equal(h.state[0].memberId,'','No founder slot is selected automatically');assert.equal(h.all(tree,n=>n.type==='SelectItem').length,1,'Assigned or already linked founder accounts cannot be chosen');h.find(tree,n=>n.type==='Select').props.onValueChange('founder-1');tree=h.render();h.find(tree,n=>n.type==='input').props.onChange({target:{value:'Fictional Owner'}});tree=h.render();h.find(tree,n=>n.type==='Checkbox').props.onCheckedChange(true);return h.render();}
async function checkWorkspaceGuard(){
 const state=[],refs=[];let cursor=0,refCursor=0;
 const org={id:'fictional-org',name:'Fictional Mola',mode:'Shared ownership',currency:'USD',members:[{id:'founder-1',name:'Founder 1',role:'Name pending'}],permissions:{isOwner:true,canManage:true,memberId:''}};
 const mod={exports:{}};
 const req=name=>{
  if(name==='react')return {useState:initial=>{const i=cursor++;if(!(i in state))state[i]=initial;return [state[i],value=>state[i]=typeof value==='function'?value(state[i]):value];},useRef:initial=>{const i=refCursor++;return refs[i]||(refs[i]={current:initial});},useCallback:fn=>fn,useEffect(){}};
  if(name==='react/jsx-runtime')return {jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};
  if(name==='@/lib/workspace-load')return {readWorkspace:async()=>({organizations:[org,{...org,id:'second-org',name:'Fictional Second'}],entries:[],name:'Fictional Owner',email:'owner@example.test'}),WorkspaceLoadError:class extends Error{}};
  if(name==='@/lib/model')return {money:n=>String(n),weeklyMinimum:()=>10000};
  if(name.startsWith('./'))return {default:name==='./member-access'?'MemberAccess':name==='./governance'?'Governance':name==='./owner-founder-link'?'OwnerFounderLink':'Child'};
  return new Proxy({},{get:(_,key)=>String(key)});
 };
 vm.runInThisContext('(function(require,module,exports){'+compile('app/page.tsx')+'\n})')(req,mod,mod.exports);
 const find=harness().find;
 const render=()=>{cursor=0;refCursor=0;return mod.exports.default();};
 const text=node=>typeof node==='string'?node:Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';
 const nav=(tree,label)=>find(tree,n=>n.type==='SidebarMenuButton'&&text(n).includes(label));
 let tree=render();await find(tree,n=>n.type==='button'&&n.props['aria-label']==='Refresh workspace').props.onClick();tree=render();nav(tree,'Founders').props.onClick();tree=render();
 const ownerSetup=find(tree,n=>n.type==='MemberAccess').props.ownerSetup;assert.equal(ownerSetup.type,'OwnerFounderLink');assert.equal(ownerSetup.props.email,'owner@example.test');
 ownerSetup.props.onBusy(true);tree=render();nav(tree,'Company decisions').props.onClick();tree=render();assert(find(tree,n=>n.type==='MemberAccess'),'Pending linking cannot unmount the member setup view');assert.equal(find(tree,n=>n.type==='Governance'),null);
 const selector=find(tree,n=>n.props?.label==='Organization');selector.props.onChange('second-org');tree=render();assert.equal(find(tree,n=>n.type==='MemberAccess').props.org.id,'fictional-org','Pending save cannot change the organization');
 assert.equal(find(tree,n=>n.type==='button'&&n.props['aria-label']==='Refresh workspace').props.disabled,true);
 ownerSetup.props.onBusy(false);tree=render();nav(tree,'Company decisions').props.onClick();tree=render();assert(find(tree,n=>n.type==='Governance'),'Navigation resumes after save completion');
}
(async()=>{
 let h=harness(),tree=prepare(h);h.update({org:{...h.props().org,version:8,members:[{id:'founder-1',name:'Changed elsewhere',role:'Member'}]},email:'different@example.test'});tree=h.render();assert.equal(h.state[0].email,'owner@example.test');
 const form=h.find(tree,n=>n.type==='form'),first=form.props.onSubmit({preventDefault(){}}),second=form.props.onSubmit({preventDefault(){}});
 assert.equal(h.calls.length,1);assert.equal(h.calls[0].version,7);assert.equal(h.calls[0].memberId,'founder-1');assert.equal(h.calls[0].name,'Fictional Owner');assert.equal(h.calls[0].email,undefined,'Client does not choose the identity being linked');assert.deepEqual(h.workspaceBusy,[true]);
 tree=h.render();assert.equal(h.find(tree,n=>n.type==='fieldset').props.disabled,true);h.find(tree,n=>n.type==='Dialog').props.onOpenChange(false);assert(h.state[0],'Pending save cannot be dismissed');
 h.fail('Member setup changed. Refresh before linking.');await Promise.all([first,second]);assert.equal(h.state[0].version,7);assert.equal(h.state[0].name,'Fictional Owner');assert.match(h.state[2],/Member setup changed/);assert.equal(h.calls.length,1,'Failed save is never replayed automatically');assert.deepEqual(h.workspaceBusy,[true,false]);
 h.find(h.render(),n=>n.type==='Dialog').props.onOpenChange(false);tree=h.render();button(h,tree,'Link my founder account').props.onClick();assert.equal(h.state[0].version,8);assert.equal(h.state[0].name,'');assert.equal(h.state[0].acknowledged,false);

 h=harness();tree=prepare(h);const pending=h.find(tree,n=>n.type==='form').props.onSubmit({preventDefault(){}});const linked={...h.props().org,version:8,permissions:{isOwner:true,memberId:'founder-1'},members:[{id:'founder-1',name:'Fictional Owner',access:{email:'owner@example.test',claimed:true,enabled:true}}]};h.complete({organization:linked});await pending;assert.equal(h.saved[0],linked);assert.equal(h.state[0],null);assert.equal(h.reloads(),1);assert.match(h.state[3],/founder account is linked/);h.update({org:linked});tree=h.render();assert.equal(button(h,tree,'Link my founder account'),null);
 h=harness();h.update({reload:async()=>{throw new Error('Fictional refresh failure');}});tree=prepare(h);const confirmed=h.find(tree,n=>n.type==='form').props.onSubmit({preventDefault(){}});h.complete({organization:linked});await confirmed;assert.equal(h.saved.length,1);assert.equal(h.state[0],null);assert.equal(h.state[2],'');assert.match(h.state[3],/link is confirmed.*could not refresh/);
 h=harness();tree=prepare(h);const uncertain=h.find(tree,n=>n.type==='form').props.onSubmit({preventDefault(){}});h.complete({organization:{...linked,id:'wrong-org'}});await uncertain;assert.equal(h.saved.length,0);assert(h.state[0]);assert.match(h.state[2],/could not be confirmed/);
 h=harness();h.update({org:{...h.props().org,permissions:{isOwner:false,memberId:'founder-1'}}});assert.equal(h.render(),null);
 h=harness();h.update({email:''});tree=h.render();assert.equal(button(h,tree,'Link my founder account').props.disabled,true);
 h=harness();h.update({disabled:true});tree=h.render();button(h,tree,'Link my founder account').props.onClick();assert.equal(h.state[0],null);
 await checkWorkspaceGuard();
 console.log('OWNER FOUNDER LINK UI PASS: explicit unassigned slot, captured setup, server-selected identity, duplicate/pending guards, retained failed drafts, fresh reopening, confirmed save vs refresh failure, response validation and owner-only visibility. Browser/layout acceptance remains pending.');
})().catch(e=>{console.error(e);process.exitCode=1;});
