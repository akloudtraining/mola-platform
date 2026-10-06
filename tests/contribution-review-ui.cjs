// Actual workspace form handlers. Fictional records and deferred saves only.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
const compile=file=>ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
function harness(){
 const state=[],refs=[],calls=[],cache=new Map(),messages=[];let cursor=0,refCursor=0,resolve,reject;
 const org={id:'fictional-org',name:'Fictional Mola',mode:'Shared ownership',currency:'USD',members:[{id:'alice',name:'Fictional Alice',role:'Member'},{id:'bob',name:'Fictional Bob',role:'Member'}],permissions:{isOwner:false,canManage:false,memberId:'bob'}};
 const due={id:'jan',orgId:org.id,type:'obligation',memberId:'alice',title:'Fictional first due',date:'2026-11-01',currency:'USD',amountMinor:10000,created:'2026-10-04T00:00:00Z'};
 const nextDue={...due,id:'feb',title:'Fictional next due',date:'2026-11-08',amountMinor:5000};
 const review={outcome:'Verified',creditMinor:4000,obligationId:due.id,evidence:'Fictional previous receipt',actor:'private-reviewer',actorName:'Fictional Bob',at:'2026-10-04T01:00:00Z'};
 const payment={id:'payment-one',orgId:org.id,type:'contribution',memberId:'alice',title:'Fictional payment',date:'2026-10-03',currency:'USD',amountMinor:10000,created:'2026-10-04T00:30:00Z',reference:'Fictional reference',purpose:'Fictional payment',method:'Bank transfer (external)',status:'Verified',reviews:[review],submissionObligationId:due.id,canReview:true,canOwnerReconcile:false};
 let records=[due,nextDue,payment];
 function load(file){if(cache.has(file))return cache.get(file).exports;const mod={exports:{}};cache.set(file,mod);vm.runInThisContext('(function(require,module,exports){'+compile(file)+'\n})',{filename:file})(reqFor(file),mod,mod.exports);return mod.exports;}
 function reqFor(file){return name=>{
  if(name==='react')return {useState:initial=>{const i=cursor++;if(!(i in state))state[i]=initial;return [state[i],value=>state[i]=typeof value==='function'?value(state[i]):value];},useRef:initial=>{const i=refCursor++;return refs[i]||(refs[i]={current:initial});},useCallback:fn=>fn,useEffect(){}};
  if(name==='react/jsx-runtime')return {jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};
  if(name==='@/lib/workspace-load')return {readWorkspace:async()=>({organizations:[org],entries:records,name:'Fictional Bob',email:'bob@example.test'}),WorkspaceLoadError:class extends Error{}};
  if(name==='@/lib/workspace-save')return {saveWorkspaceRecord:body=>{calls.push(body);return new Promise((yes,no)=>{resolve=yes;reject=no;});}};
  if(name==='sonner')return {Toaster:'Toaster',toast:{success:message=>messages.push(message),error:message=>messages.push(message)}};
  if(name.startsWith('@/lib/'))return load(name.slice(2)+'.ts');
  if(name.startsWith('./')){const resolved=path.join(path.dirname(file),name)+(/contribution-review-fields$/.test(name)?'.tsx':'.ts');if(resolved.endsWith('contribution-review-fields.tsx'))return load(resolved);if(file.startsWith('lib/'))return load(resolved);return {default:name.slice(2)};}
  return new Proxy({},{get:(_,key)=>String(key)});
 };}
 function find(node,predicate){if(Array.isArray(node)){for(const child of node){const r=find(child,predicate);if(r)return r;}return null;}if(!node||typeof node!=='object')return null;if(typeof node.type==='function'&&node.type.name==='ContributionReviewFields')return find(node.type(node.props),predicate);if(predicate(node))return node;return find(node.props?.children,predicate);}
 const text=node=>typeof node==='string'?node:Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';
 const Page=load('app/page.tsx').default;
 const render=()=>{cursor=0;refCursor=0;return Page();};
 const button=(tree,label)=>find(tree,n=>n.type==='button'&&text(n).trim()===label);
 const field=(tree,label)=>{const parent=find(tree,n=>n.type==='label'&&text(n).startsWith(label));return find(parent,n=>n.type==='input'||n.type==='textarea');};
 const choice=(tree,label)=>{const parent=find(tree,n=>n.type==='label'&&text(n).startsWith(label));return find(parent,n=>n.type==='Select');};
 async function open(){let tree=render();await find(tree,n=>n.type==='button'&&n.props['aria-label']==='Refresh workspace').props.onClick();tree=render();button(tree,'View').props.onClick();tree=render();button(tree,'Verify / review payment').props.onClick();return render();}
 return {render,find,text,button,field,choice,open,calls,payment,records:()=>records,updateRecords:next=>records=next,complete:data=>resolve(data),fail:message=>reject(new Error(message)),messages};
}
(async()=>{
 let h=harness(),tree=await h.open();
 assert.equal(h.field(tree,'Amount to credit').props.value,'40.00','Reopening a reviewed payment must preserve its existing partial credit, not the full payment amount');
 assert.match(h.text(h.find(tree,n=>n.props?.className==='review-impact')),/Remaining before.*\$60\.00.*Remaining after.*\$60\.00/);
 h.field(tree,'Evidence reference').props.onChange({target:{value:'Updated receiving-account evidence'}});tree=h.render();
 // A refresh between opening and saving cannot substitute a newer review or allocation.
 h.updateRecords(h.records().map(e=>e.id===h.payment.id?{...e,status:'Rejected',reviews:[...e.reviews,{outcome:'Rejected',creditMinor:0,obligationId:''}]}:e));await h.find(tree,n=>n.type==='button'&&n.props['aria-label']==='Refresh workspace').props.onClick();tree=h.render();
 assert.equal(h.field(tree,'Amount to credit').props.value,'40.00');
 const form=h.find(tree,n=>n.type==='form'),first=form.props.onSubmit({preventDefault(){}}),second=form.props.onSubmit({preventDefault(){}});assert.equal(h.calls.length,1);assert.equal(h.calls[0].credit,'40.00');assert.equal(h.calls[0].obligationId,'jan');assert.equal(h.calls[0].reviewCount,1);assert.equal(h.calls[0].reviewSnapshot,undefined);
 tree=h.render();assert.equal(h.find(tree,n=>n.type==='fieldset').props.disabled,true);h.find(tree,n=>n.type==='Dialog'&&n.props.open).props.onOpenChange(false);assert(h.find(h.render(),n=>n.type==='form'),'Pending save cannot discard the review');
 h.fail('This payment changed. Refresh before reviewing.');await Promise.all([first,second]);tree=h.render();assert.equal(h.field(tree,'Amount to credit').props.value,'40.00');assert.equal(h.field(tree,'Evidence reference').props.value,'Updated receiving-account evidence');assert.match(h.text(tree),/This payment changed/);assert.equal(h.calls.length,1,'Failed saves are not replayed');

 h=harness();tree=await h.open();h.choice(tree,'Assign credit').props.onValueChange('feb');tree=h.render();assert.equal(h.field(tree,'Amount to credit').props.value,'50.00');const moved=h.text(h.find(tree,n=>n.props?.className==='review-impact'));assert.match(moved,/Fictional first due.*\$60\.00.*\$100\.00/);assert.match(moved,/Fictional next due.*\$50\.00.*\$0\.00/);
 h.choice(tree,'Review outcome').props.onValueChange('Rejected');tree=h.render();assert.equal(h.field(tree,'Amount to credit'),null);assert.match(h.text(h.find(tree,n=>n.props?.className==='review-impact')),/assigns no obligation credit/);
 h.choice(tree,'Review outcome').props.onValueChange('Verified');tree=h.render();assert.equal(h.field(tree,'Amount to credit').props.value,'50.00');h.choice(tree,'Assign credit').props.onValueChange('jan');tree=h.render();assert.equal(h.field(tree,'Amount to credit').props.value,'40.00');
 h.field(tree,'Amount to credit').props.onChange({target:{value:'100.01'}});tree=h.render();assert.match(h.text(h.find(tree,n=>n.props?.className==='review-impact')),/cannot exceed/);h.field(tree,'Evidence reference').props.onChange({target:{value:'Fictional receipt'}});tree=h.render();await h.find(tree,n=>n.type==='form').props.onSubmit({preventDefault(){}});assert.equal(h.calls.length,0,'Invalid credit is blocked before any mutation');assert(h.find(h.render(),n=>n.type==='form'));

 h=harness();tree=await h.open();h.choice(tree,'Review outcome').props.onValueChange('Rejected');tree=h.render();h.field(tree,'Evidence reference').props.onChange({target:{value:'Correction: receiving account did not receive funds'}});tree=h.render();const clear=h.find(tree,n=>n.type==='form').props.onSubmit({preventDefault(){}});assert.equal(h.calls[0].obligationId,'');assert.equal(h.calls[0].credit,'0.00');h.complete({entry:{...h.payment,status:'Rejected',reviews:[...h.payment.reviews,{outcome:'Rejected',creditMinor:0,obligationId:''}]}});await clear;assert.equal(h.find(h.render(),n=>n.type==='form'),null);assert(h.messages.some(m=>m.includes('Rejected')));
 console.log('CONTRIBUTION REVIEW UI PASS: actual workspace opening preserves partial credit; before/after replacement previews; frozen refresh snapshot; minimal requests; one pending save; retained failed input; outcome switching; invalid amounts blocked and confirmed corrections close the form. Browser/layout acceptance remains pending.');
})().catch(e=>{console.error(e);process.exitCode=1;});
