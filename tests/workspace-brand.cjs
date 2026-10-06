// Render the actual brand components with persisted organization IDs and a minimal document.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
const compile=file=>ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const element=attributes=>({attributes:{...attributes},getAttribute(key){return this.attributes[key]??null;},setAttribute(key,value){this.attributes[key]=value;},removeAttribute(key){delete this.attributes[key];}});
const root=element({}),icons=[element({href:'/favicon.svg',type:'image/svg+xml'}),element({href:'/favicon.svg'})];
const document={documentElement:root,title:'Collective — Investment Workspace',querySelectorAll:()=>icons};
let pendingEffect,cleanup;
const mod={exports:{}};
const req=name=>{
 if(name==='react')return {useLayoutEffect:fn=>{pendingEffect=fn;}};
 if(name==='react/jsx-runtime')return {jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props}),Fragment:'Fragment'};
 if(name==='lucide-react')return {Landmark:'Landmark'};
 throw new Error('Unexpected brand dependency: '+name);
};
vm.runInNewContext('(function(require,module,exports){'+compile('app/workspace-brand.tsx')+'\n})',{document})(req,mod,mod.exports);
function apply(props){cleanup?.();pendingEffect=null;mod.exports.default(props);assert(pendingEffect,'Brand effect is mounted');cleanup=pendingEffect();}
function find(node,predicate){if(Array.isArray(node)){for(const child of node){const match=find(child,predicate);if(match)return match;}return null;}if(!node||typeof node!=='object')return null;if(predicate(node))return node;return find(node.props?.children,predicate);}
function logo(props){assert.equal(typeof mod.exports.WorkspaceLogo,'function');return mod.exports.WorkspaceLogo(props);}
function assertMola(props){
 apply(props);
 assert.equal(root.getAttribute('data-workspace-brand'),'mola','Saved Mola organization must enable its theme');
 assert.equal(document.title,props.organizationName+' — Investment Workspace');
 for(const icon of icons){assert.equal(icon.getAttribute('href'),'/mola-logo.png');assert.equal(icon.getAttribute('type'),'image/png');}
 const img=find(logo(props),node=>node.type==='img');assert(img,'Saved Mola organization must show its supplied logo');
 assert.equal(img.props.src,'/mola-logo.png');assert.equal(img.props.alt,'Mola Holdings');
}
function assertNeutral(props){
 apply(props);assert.equal(root.getAttribute('data-workspace-brand'),null,'Other workspaces must clear the Mola theme');
 assert.equal(document.title,props.organizationName?props.organizationName+' — Investment Workspace':'Collective — Investment Workspace');
 for(const icon of icons){assert.equal(icon.getAttribute('href'),'/favicon.svg');assert.equal(icon.getAttribute('type'),'image/svg+xml');}
 const tree=logo(props);assert.equal(find(tree,node=>node.type==='img'),null,'Other workspaces must not display the Mola logo');
 assert(find(tree,node=>node.type==='span'&&node.props.children===(props.organizationName||'Collective')),'Other workspaces retain their own name');
}
// The bootstrap persists userId + ':' + the template ID, including nested email-identity prefixes.
assertMola({organizationId:'fictional-account:mola',organizationName:'Mola Holdings'});
assertNeutral({organizationId:'fictional-account:cameroon',organizationName:'Cameroon land group'});
assertMola({organizationId:'supabase:fictional-account:mola',organizationName:'Mola Holdings'});
assertNeutral({organizationId:'supabase:fictional-account:cameroon',organizationName:'Cameroon land group'});
assertMola({organizationId:'mola',organizationName:'Mola Holdings'});
assertNeutral({organizationId:'cameroon',organizationName:'Cameroon land group'});
assertMola({organizationId:'fictional-account:mola',organizationName:'Renamed Mola workspace'});
assertNeutral({organizationId:'fictional-account:cameroon',organizationName:'Mola Holdings'});
for(const organizationId of [undefined,'',':mola','molaland','fictional-account:mola-copy','fictional-account:cameroon:mola-copy'])assertNeutral({organizationId});
assertMola({organizationId:'fictional-account:mola',organizationName:'Mola Holdings'});
cleanup();cleanup=undefined;
assert.equal(root.getAttribute('data-workspace-brand'),null,'Leaving the workspace restores the neutral root');
assert.equal(document.title,'Collective — Investment Workspace');
assert.equal(icons[0].getAttribute('href'),'/favicon.svg');assert.equal(icons[0].getAttribute('type'),'image/svg+xml');
assert.equal(icons[1].getAttribute('href'),'/favicon.svg');assert.equal(icons[1].getAttribute('type'),null);
async function checkSelectedWorkspace(){
 const state=[],refs=[];let cursor=0,refCursor=0;
 const common={version:1,members:[{id:'founder-1',name:'Fictional Member',role:'Member'}],permissions:{isOwner:true,canManage:true,memberId:''},accountLabel:'',accountHolder:'',accountLast4:'',recipientLabel:'',recipientCountry:'',recipientLast4:'',agreement:''};
 const mola={...common,id:'fictional-account:mola',name:'Mola Holdings',currency:'USD',recipientCurrency:'USD',mode:'Shared ownership'};
 const land={...common,id:'fictional-account:cameroon',name:'Cameroon land group',currency:'XAF',recipientCurrency:'XAF',mode:'Individual land allocations'};
 const page={exports:{}};
 const pageReq=name=>{
  if(name==='react')return {useState:initial=>{const i=cursor++;if(!(i in state))state[i]=initial;return [state[i],value=>state[i]=typeof value==='function'?value(state[i]):value];},useRef:initial=>{const i=refCursor++;return refs[i]||(refs[i]={current:initial});},useCallback:fn=>fn,useEffect(){}};
  if(name==='react/jsx-runtime')return req(name);
  if(name==='./workspace-brand')return mod.exports;
  if(name==='@/lib/workspace-load')return {readWorkspace:async()=>({organizations:[mola,land],entries:[],name:'Fictional Owner',email:'owner@example.test'}),WorkspaceLoadError:class extends Error{}};
  if(name==='@/lib/model')return {money:n=>String(n),weeklyMinimum:()=>10000};
  if(name.startsWith('./'))return {default:'Child'};
  return new Proxy({},{get:(_,key)=>String(key)});
 };
 vm.runInThisContext('(function(require,module,exports){'+compile('app/page.tsx')+'\n})')(pageReq,page,page.exports);
 const render=()=>{cursor=0;refCursor=0;return page.exports.default();};
 const check=(tree,org,molaSelected)=>{
  const brand=find(tree,node=>node.type===mod.exports.default);
  const header=find(tree,node=>node.type==='SidebarHeader');
  const mark=find(header,node=>node.type===mod.exports.WorkspaceLogo);
  assert(brand&&mark,'Page mounts the theme and the sidebar logo');
  assert.equal(brand.props.organizationId,org.id);assert.equal(brand.props.organizationName,org.name);
  assert.equal(mark.props.organizationId,brand.props.organizationId);assert.equal(mark.props.organizationName,brand.props.organizationName);
  assert.equal(find(header,node=>node.type===mod.exports.default),null,'Theme remains mounted outside the mobile drawer');
  if(molaSelected)assertMola(mark.props);else assertNeutral(mark.props);
 };
 let tree=render();await find(tree,node=>node.type==='button'&&node.props['aria-label']==='Refresh workspace').props.onClick();tree=render();check(tree,mola,true);
 find(tree,node=>node.props?.label==='Organization').props.onChange(land.id);tree=render();check(tree,land,false);
 await find(tree,node=>node.type==='button'&&node.props['aria-label']==='Refresh workspace').props.onClick();tree=render();check(tree,land,false);
 find(tree,node=>node.props?.label==='Organization').props.onChange(mola.id);tree=render();check(tree,mola,true);
 cleanup();cleanup=undefined;assert.equal(root.getAttribute('data-workspace-brand'),null);
}
checkSelectedWorkspace().then(()=>console.log('WORKSPACE BRAND PASS: actual page selection and refresh, persisted and email-prefixed Mola IDs, supplied sidebar logo, title/icon switching, neutral land group, stable identity across name changes, mobile drawer independence and unmount cleanup.')).catch(error=>{console.error(error);process.exitCode=1;});
