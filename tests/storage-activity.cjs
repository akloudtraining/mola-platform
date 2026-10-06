const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),cache=new Map();
function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file).exports;const module={exports:{}};cache.set(file,module);const source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const req=name=>{if(name.startsWith('@/'))return load(path.join(root,name.slice(2)+'.ts'));if(name.startsWith('.'))return load(path.resolve(path.dirname(file),name+'.ts'));return require(name);};vm.runInThisContext('(function(require,module,exports){'+source+'\n})',{filename:file})(req,module,module.exports);return module.exports;}
const {validateStorageActivityEventIds}=load(path.join(root,'lib/storage-activity.ts'));
const org={id:'owner:mola',name:'Mola Holdings',currency:'USD',recipientCurrency:'USD',mode:'Shared ownership',members:[{id:'founder-1',name:'Alice',role:'Member'}]};
const entry={id:'owner:mola:payment-1',orgId:org.id,type:'contribution',title:'Fictional payment',memberId:'founder-1',amountMinor:10000,currency:'USD',method:'Bank transfer (external)',date:'2026-01-05',reference:'fictional',purpose:'fictional',status:'Awaiting verification',created:'2026-01-05T12:00:00.000Z',submittedBy:'supabase:founder-1'};
const snapshot={installation:[],organizations:[{id:org.id,owner:'supabase:owner',data:JSON.stringify(org),version:1}],entries:[{id:entry.id,org_id:org.id,data:JSON.stringify(entry),created:entry.created,recorded_at:entry.created}],notification_reads:[]};
const now='2026-01-06T12:00:00.000Z';
const valid=validateStorageActivityEventIds(snapshot,org.id,[entry.id+':submitted',entry.id+':submitted'],now);assert.deepEqual(valid,{ok:true,ids:[entry.id+':submitted']});
const invalid=validateStorageActivityEventIds(snapshot,org.id,['unknown-event'],now);assert.equal(invalid.ok,false);assert.equal(invalid.status,409);
const wrongOrg=validateStorageActivityEventIds(snapshot,'owner:other',[entry.id+':submitted'],now);assert.equal(wrongOrg.ok,false);assert.equal(wrongOrg.status,403);
const tooMany=validateStorageActivityEventIds(snapshot,org.id,Array.from({length:101},(_,i)=>String(i)),now);assert.equal(tooMany.ok,false);assert.equal(tooMany.status,400);
console.log('STAGED ACTIVITY READ PASS: visible event validation, duplicate-safe ids, organization isolation, and bounded input');
