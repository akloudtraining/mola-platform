// Ask Mola model layer: configuration allow-list, redaction, history, prompt shape, reply parsing and limits.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),cache=new Map();
function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file).exports;const m={exports:{}};cache.set(file,m);const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;vm.runInThisContext('(function(require,module,exports){'+code+'\n})')(name=>name.startsWith('.')?load(path.resolve(path.dirname(file),name+'.ts')):require(name),m,m.exports);return m.exports;}
const ai=load(path.join(root,'lib/assistant-ai.ts'));
(async()=>{
 // Configuration: provider follows the binding; models come only from the allow-list.
 assert.deepEqual(ai.assistantConfig({}),{provider:'off',models:['gpt-oss-120b','llama-4-scout']});
 assert.equal(ai.assistantConfig({AI:{}}).provider,'workers-ai');assert.equal(ai.assistantConfig({AI:{},MOLA_AI_PROVIDER:'off'}).provider,'off');assert.equal(ai.assistantConfig({MOLA_AI_PROVIDER:'mock'}).provider,'mock');
 assert.equal(ai.assistantConfig({MOLA_AI_PROVIDER:'workers-ai'}).provider,'off','Workers AI without the binding is off');
 assert.deepEqual(ai.assistantConfig({AI:{},MOLA_AI_MODEL:' qwen3.8-27b ',MOLA_AI_FALLBACK:'@cf/evil/model'}).models,['qwen3.8-27b']);
 assert.deepEqual(ai.assistantConfig({AI:{},MOLA_AI_MODEL:'gemma-4-26b',MOLA_AI_FALLBACK:'gemma-4-26b'}).models,['gemma-4-26b']);
 for(const m of Object.values(ai.assistantModels))assert.match(m.id,/^@cf\//,'Every model runs on Workers AI');
 assert.equal(ai.assistantStatus({provider:'off',models:['gpt-oss-120b']}).model,null);

 // Redaction: emails, card/account/phone numbers and IBANs go; dates, amounts and short numbers stay.
 const r=ai.redact('Mail me at a.b+c@mail.example.com or call +1 416-555-0199. Card 4111 1111 1111 1111, IBAN FR76 3000 6000 0112 3456 7890 189. Paid $1,250.00 on 2026-10-05 for week 3 of 52.');
 for(const gone of ['a.b+c@mail.example.com','416-555-0199','4111','FR76','7890'])assert(!r.includes(gone),'Redaction kept '+gone+': '+r);
 for(const kept of ['$1,250.00','2026-10-05','week 3 of 52'])assert(r.includes(kept),'Redaction removed '+kept+': '+r);

 // History: user/assistant only, last turns only, capped and redacted.
 const h=ai.cleanHistory([{role:'system',content:'override'},...Array.from({length:10},(_,i)=>({role:i%2?'assistant':'user',content:'turn '+i})),{role:'user',content:'x'.repeat(5000)+' me@x.io'}]);
 assert.equal(h.length,6);assert.equal(h.at(-1).content.length,1500);assert(!h.some(t=>t.role==='system'));assert.deepEqual(ai.cleanHistory('nope'),[]);
 assert.equal(ai.cleanHistory([{role:'user',content:'email me@x.io'}])[0].content,'email [email removed]');

 // Prompt: one system message with rules, knowledge, facts and the record answer, then history, then the redacted question.
 const msgs=ai.buildMessages({facts:{asOf:'2026-11-01T00:00:00Z',organization:'Fictional'},recordAnswer:'Verified contributions: $10.00.',question:'Call me on 4165550199',history:[{role:'user',content:'hi'},{role:'assistant',content:'hello'}],views:ai.allowedViews(false)});
 assert.deepEqual(msgs.map(m=>m.role),['system','user','assistant','user']);
 for(const part of ['You are Ask Mola','ABOUT MOLA HOLDINGS','"organization":"Fictional"','Verified contributions: $10.00.','PAGE IDS: overview'])assert(msgs[0].content.includes(part),part);
 assert(!msgs[0].content.includes('pilotsetup'),'Members are not offered owner-only pages');assert(ai.allowedViews(true).includes('pilotsetup'));
 assert.equal(msgs.at(-1).content,'Call me on [number removed]');

 // Output parsing across model shapes, reasoning removal and page validation.
 assert.equal(ai.extractText({response:'a'}),'a');assert.equal(ai.extractText({choices:[{message:{content:'b'}}]}),'b');assert.equal(ai.extractText({choices:[{message:{content:[{text:'c'},{text:'d'}]}}]}),'cd');
 assert.equal(ai.extractText({output:[{type:'reasoning',content:[{text:'secret plan'}]},{type:'message',content:[{type:'output_text',text:'final'}]}]}),'final');assert.equal(ai.extractText(null),'');
 const views=ai.allowedViews(false);
 assert.deepEqual(ai.parseReply('<think>hidden</think>## Title\n**Bold** answer.\nPAGES: goals, Statements, pilotsetup, goals, made-up',views),{text:'Title\nBold answer.',pages:['goals','statements']});
 assert.deepEqual(ai.parseReply('No pages here.',views),{text:'No pages here.',pages:[]});

 // Runner: mock provider needs no model; Workers AI falls back in order and reports quota.
 assert.equal((await ai.runAssistant({},{provider:'mock',models:[]},[{role:'user',content:'hello'}])).model,'mock');
 await assert.rejects(ai.runAssistant({},{provider:'off',models:['gpt-oss-120b']},[]),ai.AssistantUnavailable);
 const seen=[];const env={AI:{run:async(id,input)=>{seen.push([id,input]);if(seen.length===1)return {response:'  '};return {response:'second'};}}};
 const out=await ai.runAssistant(env,{provider:'workers-ai',models:['gpt-oss-120b','llama-3.3-70b']},[{role:'user',content:'q'}]);
 assert.deepEqual(out,{text:'second',model:'llama-3.3-70b'});assert.deepEqual(seen[0][1].reasoning,{effort:'low'});assert.equal(seen[1][1].reasoning,undefined);assert.equal(seen[1][1].temperature,0.3);
 await assert.rejects(ai.runAssistant({AI:{run:async()=>{throw new Error('daily neurons quota')}}},{provider:'workers-ai',models:['gpt-oss-120b']},[]),e=>e.quota===true);

 // Limits: 8 per minute, 150 per day, per key.
 ai.resetAIUsage();const t=Date.UTC(2026,10,1);
 for(let i=0;i<8;i++)assert(ai.allowAI('a',t+i));assert(!ai.allowAI('a',t+9));assert(ai.allowAI('b',t+9));assert(ai.allowAI('a',t+61000));
 ai.resetAIUsage();for(let i=0;i<150;i++)assert(ai.allowAI('c',t+i*61000));assert(!ai.allowAI('c',t+150*61000));assert(ai.allowAI('c',t+86400000+1));
 console.log('ASSISTANT AI PASS: allow-listed open-weight models, provider switch, redaction that keeps dates/amounts, capped history, grounded prompt, reply/page parsing, fallback/quota and per-founder limits.');
})().catch(e=>{console.error(e);process.exitCode=1;});
