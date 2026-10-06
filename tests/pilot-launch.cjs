const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
const cache=new Map();let cursor=0;const state=[];
function load(file){if(cache.has(file))return cache.get(file).exports;const module={exports:{}};cache.set(file,module);const req=name=>{
 if(name==='react')return {useState:initial=>{const i=cursor++;if(!(i in state))state[i]=typeof initial==='function'?initial():initial;return [state[i],value=>state[i]=typeof value==='function'?value(state[i]):value];}};
 if(name==='react/jsx-runtime')return {jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};
 if(name==='lucide-react'||name.startsWith('@/components/ui/'))return new Proxy({},{get:(_,key)=>String(key)});
 return load(name.startsWith('@/')?name.slice(2)+'.ts':path.join(path.dirname(file),name+'.ts'));
 };const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;vm.runInThisContext('(function(require,module,exports){'+code+'\n})')(req,module,module.exports);return module.exports;}
function find(node,predicate){if(Array.isArray(node)){for(const n of node){const match=find(n,predicate);if(match)return match;}return null;}if(!node||typeof node!=='object')return null;return predicate(node)?node:find(node.props?.children,predicate);}
const {pilotLaunchSteps}=load('lib/pilot-launch.ts'),{memberReadiness}=load('lib/pilot-setup.ts');
const org={id:'fictional:mola',name:'Fictional Mola',mode:'Shared ownership',currency:'USD',members:Array.from({length:8},(_,i)=>({id:'f'+i,name:'Founder '+(i+1),role:'Name pending'})),version:1,accountLabel:'',accountHolder:'',agreement:'',permissions:{isOwner:true,canManage:true,memberId:''}};
assert(pilotLaunchSteps(org,[]).every(s=>!s.prepared));
Object.assign(org.members[0],{name:'Alex Example',role:'Member',access:{enabled:true,email:'alex@example.test',canReview:false}});
Object.assign(org.members[1],{name:'Blair Example',role:'Treasurer',access:{enabled:true,email:'blair@example.test',canReview:true}});
assert.equal(pilotLaunchSteps(org,[]).find(s=>s.id==='reviewers').prepared,true,'Configured members need not sign in for owner preparation');
assert.equal(memberReadiness(org).independentReviewConfigured,false,'Preparation must not fabricate linked accounts');
org.members[1].access.email='ALEX@example.test';assert.equal(pilotLaunchSteps(org,[]).find(s=>s.id==='reviewers').prepared,false,'One email cannot represent independent accounts');
org.members[1].access.email='blair@example.test';org.members[1].access.enabled=false;assert.equal(pilotLaunchSteps(org,[]).find(s=>s.id==='reviewers').prepared,false);org.members[1].access.enabled=true;
org.agreement='A working draft';assert.equal(pilotLaunchSteps(org,[]).find(s=>s.id==='agreement').prepared,false);
org.activeAgreementId='agreement-1';const entry={id:'agreement-1',orgId:org.id,type:'agreement',agreement:{revision:1,digest:'a'.repeat(64),acceptances:[]}};
const agreement=pilotLaunchSteps(org,[entry]).find(s=>s.id==='agreement');assert.equal(agreement.prepared,true);assert.match(agreement.detail,/0 of 8 founders accepted/);
assert.equal(pilotLaunchSteps({...org,id:'another:mola'},[entry]).find(s=>s.id==='agreement').prepared,false,'Other organizations cannot supply agreement readiness');
const Component=load('app/pilot-launch.tsx').default,panels=Object.fromEntries(['owner','reviewers','schedule','account','agreement','funding'].map(id=>[id,id])),opened=[];
const render=(extra={})=>{cursor=0;return Component({org,entries:[entry],panels,disabled:false,onOpen:view=>opened.push(view),...extra});};
let tree=render();assert.equal(find(tree,n=>n.type==='Tabs').props.value,'owner');find(tree,n=>n.type==='Tabs').props.onValueChange('schedule');tree=render();assert.equal(find(tree,n=>n.type==='Tabs').props.value,'schedule');
tree=render({disabled:true});find(tree,n=>n.type==='Tabs').props.onValueChange('funding');tree=render({disabled:true});assert.equal(find(tree,n=>n.type==='Tabs').props.value,'schedule','Pending saves block step navigation');
assert.equal(render({org:{...org,permissions:{isOwner:false,memberId:'f0'}}}),null,'Ordinary members do not receive owner setup');
assert.equal(render({org:{...org,mode:'Individual land allocations'}}),null,'Land group does not inherit Mola setup');
assert.deepEqual(opened,[],'Readiness and navigation do not mutate records or grant access');
console.log('PILOT LAUNCH PASS: saved preparation stays distinct from account linking and agreement acceptance; duplicate emails, disabled reviewers, foreign agreements, owner/organization visibility and pending navigation are guarded.');
