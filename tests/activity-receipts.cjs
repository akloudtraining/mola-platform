// The activity feed is built from public entries (receipt keys removed, hasReceipt kept).
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
const cache=new Map();
function load(file){
 if(cache.has(file))return cache.get(file).exports;const mod={exports:{}};cache.set(file,mod);
 const req=name=>name.startsWith('./')||name.startsWith('@/lib/')?load(path.join(name.startsWith('@/')?'lib':path.dirname(file),name.replace(/^@\/lib\//,'').replace(/^\.\//,''))+'.ts'):require(name);
 vm.runInThisContext('(function(require,module,exports){'+ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText+'\n})')(req,mod,mod.exports);
 return mod.exports;
}
const {activityFor}=load('lib/activity.ts');
const org={id:'fictional:mola',mode:'Shared ownership',members:[{id:'a',name:'Alice Test',role:'Founder'}]};
const base={orgId:org.id,type:'contribution',title:'Weekly',memberId:'a',amountMinor:2500,currency:'USD',method:'Zelle (external)',date:'2026-10-14',reference:'',purpose:'',status:'Awaiting verification',created:'2026-10-14T09:00:00.000Z'};
const events=activityFor(org,[{...base,id:'public',receipt:undefined,hasReceipt:true},{...base,id:'legacy'}],new Date('2026-10-15T00:00:00Z'));
const text=id=>events.find(e=>e.entryId===id&&e.kind==='submission').description;
assert(text('public').endsWith('· screenshot attached'),'A public entry with a screenshot is not reported as legacy');
assert(text('legacy').endsWith('· no screenshot (older record)'),'Records without any screenshot keep the legacy wording');
console.log('ACTIVITY RECEIPTS PASS: submission events read the public screenshot flag.');
