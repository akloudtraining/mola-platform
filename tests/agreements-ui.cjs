// Actual agreement component handlers; fictional documents and deferred saves.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
const compile=file=>ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
function harness(){
 const state=[],refs=[],calls=[],saved=[],workspaceBusy=[];let cursor=0,refCursor=0,resolve,reject,reloads=0;
 const entry={id:'agreement-one',orgId:'fictional-org',type:'agreement',title:'Fictional first version',created:'2026-10-04T00:00:00Z',agreement:{revision:1,body:'Exact fictional first-version text.',decisionReference:'Fictional meeting one',digest:'a'.repeat(64),publishedAt:'2026-10-04T00:00:00Z',acceptances:[],canAccept:true}};
 let props={org:{id:'fictional-org',name:'Fictional group',version:7,agreement:'Saved fictional draft to publish.',activeAgreementId:entry.id,members:[{id:'bob',name:'Fictional Bob'},{id:'carol',name:'Fictional Carol'}],permissions:{memberId:'bob',canManage:true}},entries:[entry],editDraft(){},onBusy:busy=>workspaceBusy.push(busy),onSaved:data=>saved.push(data),reload:async()=>{reloads++;}};
 const agreementModule={exports:{}};vm.runInThisContext('(function(module,exports){'+compile('lib/agreements.ts')+'\n})')(agreementModule,agreementModule.exports);
 const mod={exports:{}};
 function req(name){
  if(name==='react')return {useState:initial=>{const i=cursor++;if(!(i in state))state[i]=initial;return [state[i],value=>state[i]=typeof value==='function'?value(state[i]):value];},useRef:initial=>{const i=refCursor++;return refs[i]||(refs[i]={current:initial});}};
  if(name==='react/jsx-runtime')return {jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};
  if(name==='@/lib/workspace-save')return {saveWorkspaceRecord:body=>{calls.push(body);return new Promise((yes,no)=>{resolve=yes;reject=no;});}};
  if(name==='@/lib/agreements')return agreementModule.exports;
  return new Proxy({},{get:(_,key)=>String(key)});
 }
 vm.runInThisContext('(function(require,module,exports){'+compile('app/membership-agreements.tsx')+'\n})')(req,mod,mod.exports);
 function find(node,predicate){if(Array.isArray(node)){for(const child of node){const r=find(child,predicate);if(r)return r;}return null;}if(!node||typeof node!=='object')return null;if(predicate(node))return node;return find(node.props?.children,predicate);}
 const render=()=>{cursor=0;refCursor=0;return mod.exports.default(props);};
 return {state,calls,saved,workspaceBusy,entry,render,find,props:()=>props,update:next=>props={...props,...next},complete:data=>resolve(data),fail:message=>reject(new Error(message)),reloads:()=>reloads};
}
const button=(h,tree,text)=>h.find(tree,n=>n.type==='button'&&n.props.children===text);
(async()=>{
 let h=harness(),tree=h.render();button(h,tree,'Publish for member acceptance').props.onClick();tree=h.render();
 const id=h.state[0].submissionId;assert.match(id,/^[a-f0-9-]{36}$/);
 h.find(tree,n=>n.type==='input'&&n.props.placeholder==='Meeting date or agreed decision reference').props.onChange({target:{value:'Fictional group decision'}});tree=h.render();h.find(tree,n=>n.type==='Checkbox').props.onCheckedChange(true);
 const originalBody=h.state[0].body;h.update({org:{...h.props().org,version:8,agreement:'A new draft appeared during refresh.'}});tree=h.render();
 const form=h.find(tree,n=>n.type==='form');const first=form.props.onSubmit({preventDefault(){}}),second=form.props.onSubmit({preventDefault(){}});
 assert.equal(h.calls.length,1);assert.deepEqual(h.workspaceBusy,[true]);assert.equal(h.calls[0].version,7);assert.equal(h.calls[0].submissionId,id);assert.equal(h.calls[0].body,originalBody,'Refresh cannot substitute unreviewed text');
 tree=h.render();assert.equal(h.find(tree,n=>n.type==='fieldset').props.disabled,true);h.find(tree,n=>n.type==='Dialog').props.onOpenChange(false);assert(h.state[0],'Pending publication cannot be dismissed');
 h.fail('The save could not be confirmed.');await Promise.all([first,second]);assert.equal(h.state[0].submissionId,id);assert.equal(h.state[0].body,originalBody);assert.equal(h.state[0].decisionReference,'Fictional group decision');assert.equal(h.state[1],false);assert.match(h.state[2],/could not be confirmed/);assert.equal(h.calls.length,1,'No automatic publication retry');assert.deepEqual(h.workspaceBusy,[true,false]);

 h=harness();tree=h.render();button(h,tree,'Review and accept this version').props.onClick();tree=h.render();
 h.find(tree,n=>n.type==='input'&&n.props.autoComplete==='name').props.onChange({target:{value:'Fictional Bob'}});tree=h.render();h.find(tree,n=>n.type==='Checkbox').props.onCheckedChange(true);
 const next={...h.entry,id:'agreement-two',title:'Replacement version',agreement:{...h.entry.agreement,digest:'b'.repeat(64),body:'Replacement text that has not been accepted.'}};
 h.update({org:{...h.props().org,version:9,activeAgreementId:next.id},entries:[next,h.entry]});tree=h.render();
 assert.equal(h.find(tree,n=>n.props?.['aria-label']==='Exact agreement text').props.children,'Exact fictional first-version text.');
 const pending=h.find(tree,n=>n.type==='form').props.onSubmit({preventDefault(){}});assert.equal(h.calls[0].entryId,'agreement-one');assert.equal(h.calls[0].digest,'a'.repeat(64));assert.equal(h.calls[0].version,7);assert.equal(h.calls[0].typedName,'Fictional Bob');
 h.fail('A new version is available. Review it before accepting.');await pending;assert.equal(h.state[0].typedName,'Fictional Bob');assert.equal(h.saved.length,0);assert.equal(h.reloads(),0);
 h.find(h.render(),n=>n.type==='Dialog').props.onOpenChange(false);tree=h.render();button(h,tree,'Review and accept this version').props.onClick();assert.equal(h.state[0].digest,'b'.repeat(64));assert.equal(h.state[0].body,next.agreement.body);

 h=harness();tree=h.render();button(h,tree,'Review and accept this version').props.onClick();tree=h.render();h.find(tree,n=>n.type==='input'&&n.props.autoComplete==='name').props.onChange({target:{value:'Fictional Bob'}});tree=h.render();h.find(tree,n=>n.type==='Checkbox').props.onCheckedChange(true);tree=h.render();const success=h.find(tree,n=>n.type==='form').props.onSubmit({preventDefault(){}});
 const accepted={...h.entry,agreement:{...h.entry.agreement,acceptedByMe:true,canAccept:false,acceptances:[{memberId:'bob',memberName:'Fictional Bob',typedName:'Fictional Bob',at:'2026-10-04T01:00:00Z'}]}};h.complete({entry:accepted});await success;
 assert.equal(h.state[0],null);assert.equal(h.saved.length,1);assert.equal(h.saved[0].entry,accepted);assert.equal(h.reloads(),1);assert.match(h.state[3],/exact agreement version/);
 h.update({entries:[accepted]});tree=h.render();assert.equal(button(h,tree,'Review and accept this version'),null,'Accepted version cannot be submitted again from the page');
 h=harness();h.update({reload:async()=>{throw new Error('Fictional refresh failure');}});tree=h.render();button(h,tree,'Review and accept this version').props.onClick();tree=h.render();h.find(tree,n=>n.type==='Checkbox').props.onCheckedChange(true);tree=h.render();const confirmed=h.find(tree,n=>n.type==='form').props.onSubmit({preventDefault(){}});h.complete({entry:accepted});await confirmed;assert.equal(h.state[0],null);assert.equal(h.saved.length,1);assert.match(h.state[3],/save is confirmed.*could not refresh/);assert.equal(h.state[2],'');assert.deepEqual(h.workspaceBusy,[true,false]);
 console.log('AGREEMENTS UI PASS: exact reviewed snapshots, one pending submission, locked dismissal/workspace switching, retained failed drafts, no automatic retry, replacement-version review and confirmed acceptance separated from refresh failure. Browser/layout acceptance remains pending.');
})().catch(e=>{console.error(e);process.exitCode=1;});
