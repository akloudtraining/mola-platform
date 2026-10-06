const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
let states=[],cursor=0;const cache=new Map();function load(file){if(cache.has(file))return cache.get(file).exports;const module={exports:{}};cache.set(file,module);const req=name=>{
 if(name==='react')return {useState:initial=>{const i=cursor++;if(states[i]===undefined)states[i]=initial;return [states[i],v=>states[i]=typeof v==='function'?v(states[i]):v];}};
 if(name==='react/jsx-runtime')return {jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};
 if(name==='lucide-react'||name==='@/components/ui/table')return new Proxy({},{get:(_,key)=>String(key)});
 if(name==='./member-statements'||name==='./treasury-statement')return {default:name};
 return load(name.startsWith('@/')?name.slice(2)+'.ts':path.join(path.dirname(file),name+'.ts'));
};const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;vm.runInThisContext('(function(require,module,exports){'+code+'\n})')(req,module,module.exports);return module.exports;}
function all(node,predicate,out=[]){if(Array.isArray(node))for(const n of node)all(n,predicate,out);else if(node&&typeof node==='object'){if(predicate(node))out.push(node);all(node.props?.children,predicate,out);}return out;}
const text=n=>typeof n==='string'||typeof n==='number'?String(n):Array.isArray(n)?n.map(text).join(''):n?.props?text(n.props.children):'';
const button=(tree,label)=>all(tree,n=>n.type==='button'&&text(n)===label)[0];
const Component=load('app/treasury-statement.tsx').default;
const org={id:'mola',name:'Fictional group',mode:'Shared ownership',members:[{id:'a',name:'Alex Example'}]};const entries=Array.from({length:80},(_,i)=>({id:'payment'+i,orgId:org.id,type:'contribution',memberId:'a',title:'Payment '+i,date:'2026-10-01',created:'2026-10-01T00:00:00Z',amountMinor:10000,currency:'USD',status:'Verified',reference:'receipt-'+i}));
const opened=[];const render=()=>{cursor=0;return Component({org,entries,onOpen:e=>opened.push(e.id)});};
let blob,clicked=0,removed=0;global.document={createElement:()=>({click(){clicked++;},remove(){removed++;}}),body:{appendChild(){}}};URL.createObjectURL=b=>{blob=b;return 'blob:test';};URL.revokeObjectURL=()=>{};
(async()=>{
 let tree=render();assert.equal(all(tree,n=>n.type==='TableRow').length,51);assert(text(tree).includes('$8,000.00'));button(tree,'Open contribution').props.onClick();assert.equal(opened[0],'payment0');button(tree,'Download group CSV').props.onClick();assert.equal(clicked,1);assert.equal(removed,1);assert.equal((await blob.text()).split('\r\n').filter(l=>l.startsWith('"Contribution"')).length,80,'Export includes rows beyond page limit');
 button(tree,'Show more records').props.onClick();tree=render();assert.equal(all(tree,n=>n.type==='TableRow').length,81);
 let inputs=all(tree,n=>n.type==='input');inputs[0].props.onChange({target:{value:'2026-10-02'}});tree=render();assert(text(tree).includes('No group records'));inputs=all(tree,n=>n.type==='input');inputs[1].props.onChange({target:{value:'2026-10-01'}});tree=render();assert(text(tree).includes('Choose a valid date range'));assert.equal(button(tree,'Download group CSV').props.disabled,true);button(tree,'Download group CSV').props.onClick();assert.equal(clicked,1);button(tree,'All dates').props.onClick();tree=render();assert.equal(all(tree,n=>n.type==='TableRow').length,51);
 URL.createObjectURL=()=>{throw Error('Download unavailable');};button(tree,'Download group CSV').props.onClick();assert(text(render()).includes('CSV could not be downloaded'));
 const Workspace=load('app/statements-workspace.tsx').default;states=[];cursor=0;let workspace=Workspace({org,entries,onOpen(){}});assert.equal(all(workspace,n=>n.type==='./member-statements').length,1);button(workspace,'Group treasury statement').props.onClick();cursor=0;workspace=Workspace({org,entries,onOpen(){}});assert.equal(all(workspace,n=>n.type==='./treasury-statement').length,1);cursor=0;workspace=Workspace({org:{...org,mode:'Individual land allocations'},entries,onOpen(){}});assert.equal(workspace.type,'./member-statements');
 console.log('TREASURY UI PASS: totals, record navigation, all-row CSV, inclusive filters, invalid-range guard, pagination reset, download errors, statement switch and separate land workspace.');
})().catch(e=>{console.error(e);process.exitCode=1;});
