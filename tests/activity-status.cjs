const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
const source=ts.transpileModule(fs.readFileSync('app/activity-feed.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,moduleRef={exports:{}};
const req=name=>name==='react'?{useState:()=>{}}:name==='react/jsx-runtime'?{jsx(){},jsxs(){}}:name==='lucide-react'?{Bell:'Bell',CheckCheck:'CheckCheck'}:name==='@/lib/deadlines'?{formatTimestamp:value=>value}:name==='@/components/ui/tabs'?{Tabs:'Tabs',TabsList:'TabsList',TabsTrigger:'TabsTrigger'}:{};
vm.runInThisContext('(function(require,module,exports){'+source+'\n})')(req,moduleRef,moduleRef.exports);const badge=moduleRef.exports.activityBadgeClass;
assert.equal(badge('Submitted'),'pending');assert.equal(badge('Resubmitted'),'resubmitted');assert.equal(badge('Verified'),'green');assert.equal(badge('Rejected'),'danger');assert.equal(badge('Owner reconciled'),'neutral');
console.log('ACTIVITY STATUS PASS: submitted, resubmitted, verified, rejected and provisional events retain distinct badge treatments.');
