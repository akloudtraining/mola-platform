// Actual workspace and save-service handlers; fictional records and simulated connection failures.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),originalFetch=global.fetch;
function harness(){
 const state=[],refs=[],calls=[],receiptCalls=[],messages=[],cache=new Map();let cursor=0,refCursor=0,resolve,reject,records=[],lastSaved;
 const org={id:'fictional-org',name:'Fictional Mola',mode:'Shared ownership',currency:'USD',members:[{id:'alice',name:'Fictional Alice',role:'Member'},{id:'bob',name:'Fictional Bob',role:'Member'}],permissions:{isOwner:false,canManage:false,memberId:'alice'}};
 const compile=file=>ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 global.fetch=async(url,init)=>{if(String(url).startsWith('/api/receipt?')){assert.equal(init.method,'POST');receiptCalls.push(String(url));return Response.json({entry:{...lastSaved,status:'Awaiting verification',hasReceipt:true,canViewReceipt:true,canUploadReceipt:false}});}assert.equal(url,'/api/workspace');assert.equal(init.method,'POST');calls.push(JSON.parse(init.body));return new Promise((yes,no)=>{resolve=yes;reject=no;});};
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
 return {org,calls,receiptCalls,messages,text,render,button,field,find,respond:(status,data)=>{if(data.entry)lastSaved=data.entry;resolve(Response.json(data,{status}));},fail:()=>reject(new Error('Fictional interrupted connection')),setRecords:next=>records=next};
}
const all=(node,predicate,out=[])=>{if(Array.isArray(node)){node.forEach(child=>all(child,predicate,out));return out;}if(!node||typeof node!=='object')return out;if(predicate(node))out.push(node);all(node.props?.children,predicate,out);return out;};
(async()=>{
 const h=harness();h.org.permissions.isOwner=true;h.org.permissions.canManage=true;
 let tree=h.render();await h.find(tree,n=>n.type==='button'&&n.props['aria-label']==='Refresh workspace').props.onClick();tree=h.render();
 const visit=label=>{h.find(tree,n=>n.type==='SidebarMenuButton'&&h.text(n)===label).props.onClick();tree=h.render();};
 for(const label of ['Founder Hub','Contributions','Founders','Statements','Activity','Savings & planning','Contribution schedule','Opportunities','Ask Mola','Funding requests','Company decisions','Accounts & recipients','Agreements & notes','Help & guides','Workspace setup','My account']){
  visit(label);const recordButtons=all(tree,n=>n.type==='button'&&h.text(n)==='Record contribution');
  assert.equal(recordButtons.length,label==='Contributions'?1:0,`Contribution action scope: ${label}`);
  const heading=h.find(tree,n=>n.props?.className==='page-heading');
  assert.equal(all(heading,n=>n.type==='button').length,['Contributions','Funding requests'].includes(label)?1:0,`Unrelated heading actions: ${label}`);
  if(label==='Workspace setup'){
   const launch=h.find(tree,n=>n.type==='pilot-launch');assert(launch);
   for(const panel of Object.values(launch.props.panels)){assert.equal(all(panel,n=>n.type==='form').length,0);assert.equal(all(panel,n=>n.type==='button').length,1);}
   assert(h.find(tree,n=>n.type==='pilot-diagnostics'));assert(h.find(tree,n=>n.type==='ledger-backup'));
  }
  if(label==='Founders')assert.equal(h.find(tree,n=>n.type==='pilot-diagnostics'),null);
  if(label==='Accounts & recipients')assert.equal(h.find(tree,n=>n.type==='ledger-backup'),null);
 }
 visit('Contributions');const header=h.find(tree,n=>n.props?.className==='page-heading');all(header,n=>n.type==='button')[0].props.onClick();tree=h.render();assert(h.find(tree,n=>n.type==='form'),'Canonical action opens the existing receipt form');
 console.log('WORKSPACE NAVIGATION PASS: one contribution entry point, contextual headings on all 16 pages, setup shortcuts instead of duplicate forms, and diagnostics/backups in owner setup.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{global.fetch=originalFetch;});
