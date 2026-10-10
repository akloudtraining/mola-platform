'use client';
import {useState,useRef,useEffect} from 'react';
import {MessageSquare,ArrowUpRight,Send,BookOpen,Search,ArrowLeft,X} from 'lucide-react';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogTrigger} from '@/components/ui/dialog';
import {type Org,type Entry} from '@/lib/model';
import {workspaceEndpoint} from '@/lib/workspace-endpoint';
import {searchWorkspace,navigationIntent,type AssistantResult} from '@/lib/assistant-search';
const prompts=['How much have I contributed, and what do I owe?','How much has the group contributed?','What is our current weekly minimum?'];
type Answer={question:string;answer:string;asOf:string;mode:string;sources:{label:string;view:string;entryId?:string}[]};
export default function AskMola({org,entries=[],open=false,onOpenChange=()=>{},disabled=false,onNavigate,onRecord}:{org:Org;entries?:Entry[];open?:boolean;onOpenChange?:(open:boolean)=>void;disabled?:boolean;onNavigate:(view:string)=>void;onRecord:(id:string,view?:string)=>void}){
 const askingNow=useRef(false),requestRef=useRef<AbortController|null>(null),messageEnd=useRef<HTMLDivElement|null>(null),questionInput=useRef<HTMLTextAreaElement|HTMLInputElement|null>(null);
 const [searchQuery,setSearchQuery]=useState('');
 const [question,setQuestion]=useState(''),[answers,setAnswers]=useState<Answer[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[aiAvailable,setAIAvailable]=useState(false),[useAI,setUseAI]=useState(false),[mode,setMode]=useState<'ask'|'search'>('ask');
 useEffect(()=>()=>{requestRef.current?.abort();},[]);
 useEffect(()=>{if(open&&mode==='ask')messageEnd.current?.scrollIntoView({block:'nearest'});},[open,mode,answers,busy]);
 const results=searchWorkspace(org,entries,searchQuery);
 const navigate=(view:string)=>{if(!disabled){onNavigate(view);setQuestion('');setSearchQuery('');setError('');}};
 const choose=(result:AssistantResult)=>{if(disabled)return;if(result.entryId){onOpenChange(false);onRecord(result.entryId,result.view);}else navigate(result.view);};
 async function ask(value:string){
  if(askingNow.current||disabled||!value.trim())return;
  const intent=navigationIntent(value,org.permissions?.isOwner);if(intent){navigate(intent);return;}
  const find=value.match(/^(?:search(?: for)?|find|look for)\s+(.+)$/i);if(find){setMode('search');setSearchQuery(find[1]);setQuestion('');return;}
  const controller=new AbortController();requestRef.current=controller;askingNow.current=true;setBusy(true);setError('');
  try{const response=await fetch(workspaceEndpoint('/api/workspace'),{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.any([controller.signal,AbortSignal.timeout(25000)]),body:JSON.stringify({action:'askMola',orgId:org.id,question:value.trim(),useAI})});const data:any=await response.json();if(controller.signal.aborted)return;if(!response.ok)throw new Error(data.error||'The answer is unavailable.');setAnswers(prev=>[...prev,{...data,question:value.trim()}]);setAIAvailable(data.aiAvailable===true);setQuestion('');}
  catch(e){if(!controller.signal.aborted)setError((e as Error).message);}finally{if(!controller.signal.aborted){askingNow.current=false;setBusy(false);}}
 }
 return <Dialog modal={false} open={open} onOpenChange={onOpenChange}>
  <DialogTrigger asChild><button className="mola-assistant-launcher" aria-label="Open Ask Mola assistant"><MessageSquare size={21}/><span>Ask Mola</span></button></DialogTrigger>
  <DialogContent className="mola-assistant" showCloseButton={false} onOpenAutoFocus={e=>{e.preventDefault();questionInput.current?.focus();}} onInteractOutside={e=>e.preventDefault()}>
   <DialogHeader className="assistant-header"><div><span className="assistant-avatar"><MessageSquare size={20}/></span><div><DialogTitle>Ask Mola</DialogTitle><DialogDescription>Your company assistant</DialogDescription></div></div><button type="button" className="icon-button" aria-label="Close Ask Mola" onClick={()=>onOpenChange(false)}><X size={18}/></button></DialogHeader>
   <div className="assistant-mode" role="group" aria-label="Assistant mode"><button type="button" aria-pressed={mode==='ask'} onClick={()=>setMode('ask')}><MessageSquare size={15}/> Chat</button><button type="button" aria-pressed={mode==='search'} onClick={()=>{setMode('search');setError('');}}><Search size={15}/> Quick search</button><span>{useAI?'AI explanations':'Record answers'}</span></div>
   <div className="assistant-scroll">
   {mode==='search'?<section className="assistant-search"><label className="field">Search pages and company records<input ref={element=>{questionInput.current=element;}} autoFocus type="search" value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} maxLength={200} placeholder="Payment, founder, goal or page…"/></label><p className="assistant-caption">{searchQuery?`${results.length} matching results${results.length===20?' · first 20 shown':''}`:'Quick shortcuts'}</p><div className="assistant-results" aria-live="polite">{results.map(r=><button type="button" key={r.key} disabled={disabled} onClick={()=>choose(r)}><span><strong>{r.label}</strong><small>{r.detail}</small></span><ArrowUpRight size={16}/></button>)}{!results.length&&<p>No matching records. Try a name, title or date.</p>}</div><p className="assistant-caption">Searches records your account can access. Internet research is not connected.</p></section>:<>
    {!answers.length?<section className="assistant-welcome"><h3>How can I help?</h3><p>Ask about Mola, find a record, or say “open savings” to move around your workspace.</p><div className="assistant-prompts">{prompts.map(p=><button type="button" key={p} disabled={busy||disabled} onClick={()=>void ask(p)}>{p}<ArrowUpRight size={14}/></button>)}</div></section>:<div className="assistant-messages" aria-live="polite">{answers.map((a,i)=><article key={i}><p className="assistant-question">{a.question}</p><div className="assistant-answer"><span>{a.mode==='ai'?'AI EXPLANATION':'FROM YOUR RECORDS'}</span><p>{a.answer}</p><small>Checked {new Date(a.asOf).toLocaleString()}</small><div className="assistant-sources">{a.sources.map((s,n)=><button type="button" key={n} disabled={disabled} onClick={()=>{if(s.entryId){onOpenChange(false);onRecord(s.entryId,s.view);}else navigate(s.view);}}><BookOpen size={13}/>{s.label}</button>)}</div></div></article>)}</div>}
    {busy&&<p className="assistant-caption" role="status">Checking company records…</p>}<div ref={messageEnd}/>
   </>}
   </div>
   {mode==='ask'&&<form className="assistant-composer" onSubmit={e=>{e.preventDefault();void ask(question);}}><label className="sr-only" htmlFor="mola-assistant-question">Your question</label><textarea ref={element=>{questionInput.current=element;}} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void ask(question);}}} id="mola-assistant-question" disabled={busy||disabled} value={question} maxLength={1000} rows={2} onChange={e=>setQuestion(e.target.value)} placeholder="Ask a question or open a page…"/>{error&&<p className="form-error" role="alert">{error}</p>}<div><span>Session only · not saved to Mola</span><button type="submit" className="primary" disabled={busy||disabled||!question.trim()} aria-label="Send question"><Send size={16}/></button></div></form>}
   <details className="assistant-info"><summary>Privacy & AI connection</summary><p>Questions are not shared with other founders or saved as a conversation. Private receipt images and sign-in details are excluded from AI context.</p>{aiAvailable?<><label className="check-field"><input type="checkbox" checked={useAI} onChange={e=>setUseAI(e.target.checked)}/>Use AI for broader explanations</label><p>Your question and selected company facts go to the configured AI provider when enabled. Financial answers still use calculated records.</p></>:<p>Record answers work now. Broader explanations need a server-side AI connection. Ask a record question to check availability.</p>}<button type="button" className="text-button" disabled={busy} onClick={()=>{setAnswers([]);setError('');setQuestion('');}}><ArrowLeft size={13}/> Clear conversation</button></details>
  </DialogContent>
 </Dialog>;
}
