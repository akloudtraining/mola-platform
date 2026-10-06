const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
const cache=new Map();
function load(file){if(cache.has(file))return cache.get(file).exports;const module={exports:{}};cache.set(file,module);const req=name=>{
 if(name==='react/jsx-runtime')return {jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};
 if(name==='./record-time')return {DeadlineTime:'DeadlineTime'};
 return load(name.startsWith('@/')?name.slice(2)+'.ts':path.join(path.dirname(file),name+'.ts'));
 };const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;vm.runInThisContext('(function(require,module,exports){'+code+'\n})')(req,module,module.exports);return module.exports;}
function all(node,predicate,out=[]){if(Array.isArray(node)){for(const n of node)all(n,predicate,out);}else if(node&&typeof node==='object'){if(predicate(node))out.push(node);all(node.props?.children,predicate,out);}return out;}
const text=node=>typeof node==='string'||typeof node==='number'?String(node):Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';
const Component=load('app/member-overview.tsx').default;
const org={id:'owner:mola',name:'Fictional group',mode:'Shared ownership',members:[{id:'a',name:'Alex Example',access:{enabled:true}},{id:'b',name:'Blair Example',access:{enabled:true}}],permissions:{memberId:'a'}};
const entry=(id,type,amountMinor,extra={})=>({id,orgId:org.id,type,title:id,memberId:'a',amountMinor,currency:'USD',date:'2020-01-01',created:'2020-01-01T12:00:00Z',status:type==='obligation'?'Recorded obligation':'Verified',...extra});
const review=(creditMinor,outcome='Verified')=>({obligationId:'first due',creditMinor,outcome,at:'2020-01-02T12:00:00Z'});
const rows=[entry('first due','obligation',10000),entry('future due','obligation',10000,{date:'2099-01-01'}),entry('verified','contribution',10000,{reviews:[review(3000)]}),entry('extra','contribution',20000),entry('pending','contribution',5000,{status:'Awaiting verification'}),entry('owner','contribution',2000,{status:'Owner reconciled',reviews:[review(2000,'Owner reconciled')]}),entry('cad','contribution',70000,{currency:'CAD'}),entry('foreign','obligation',999999,{orgId:'other:mola'}),entry('other member','obligation',999999,{memberId:'b'}),entry('foreign payment','contribution',999999,{orgId:'other:mola'})];
const calls=[];const props={org,entries:rows,disabled:false,onStatement:()=>calls.push('statement'),onOpen:e=>calls.push(e.id),onSetup:()=>calls.push('setup'),onReportDue:e=>calls.push('due:'+e.id)};
const render=extra=>Component({...props,...extra});
const currency=(tree,name)=>all(tree,n=>n.props?.['aria-label']===name+' personal summary')[0];
const figures=section=>Object.fromEntries(all(section,n=>n.type==='dl')[0].props.children.map(n=>[text(n.props.children[0]),text(n.props.children[1])]));
let tree=render();assert.deepEqual(figures(currency(tree,'USD')),{'Verified contributions':'$300.00','Awaiting verification':'$50.00','Owner reconciled · provisional':'$20.00','Remaining recorded dues':'$150.00','Overdue portion':'$50.00'});
assert.equal(figures(currency(tree,'CAD'))['Remaining recorded dues'],'Not recorded');assert(!text(tree).includes('foreign'));assert(!text(tree).includes('other member'));assert(text(tree).includes('Alex Example'));
const dues=all(tree,n=>n.props?.className==='member-overview-due');assert.equal(dues.length,2);assert(text(dues[0]).includes('Overdue'));assert(text(dues[1]).includes('2099-01-01'));
for(const button of all(render({disabled:true}),n=>n.type==='button')){assert.equal(button.props.disabled,true);button.props.onClick();}assert.deepEqual(calls,[]);
all(tree,n=>n.type==='button'&&text(n)==='My statement')[0].props.onClick();all(dues[0],n=>n.type==='button'&&text(n)==='View obligation')[0].props.onClick();assert.deepEqual(calls,['statement','first due']);all(dues[0],n=>n.type==='button'&&text(n)==='Record contribution')[0].props.onClick();assert.equal(calls.at(-1),'due:first due');
assert.equal(render({org:{...org,permissions:{memberId:''}}}),null);assert.equal(render({org:{...org,permissions:{memberId:'missing'}}}),null);assert.equal(render({org:{...org,mode:'Individual land allocations'}}),null);assert.equal(render({org:{...org,members:[{...org.members[0],access:{enabled:false}}]}}),null);
assert(text(render({entries:[]})).includes('remaining dues are not established'));
const corrected=rows.map(e=>e.id==='verified'?{...e,status:'Rejected',reviews:[review(3000),review(0,'Rejected')]}:e);assert.equal(figures(currency(render({entries:corrected}),'USD'))['Remaining recorded dues'],'$180.00');
const invalid=rows.map(e=>e.id==='verified'?{...e,reviews:[review(10001)]}:e);assert(text(render({entries:invalid})).includes('1 credit assignment(s) need review'));
const paid=[entry('first due','obligation',10000),entry('full','contribution',10000,{reviews:[review(10000)]})];assert(text(render({entries:paid})).includes('Future dues may still apply'));assert.equal(all(render({entries:paid}),n=>n.props?.className==='member-overview-due').length,0);
const unlinked=render({org:{...org,permissions:{isOwner:true,memberId:''}}});assert(text(unlinked).includes('Link my founder account'));assert.equal(all(unlinked,n=>n.type==='dl').length,0);all(unlinked,n=>n.type==='button')[0].props.onClick();assert.equal(calls.at(-1),'setup');
console.log('MEMBER OVERVIEW PASS: isolated member/org; separate currencies/statuses; partial/provisional credits; pending/extra exclusions; overdue/future dues; corrections; invalid credits; empty/unlinked/disabled/land states; guarded actions.');
