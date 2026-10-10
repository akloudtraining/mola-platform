import type {Org,Entry} from './model';
export const assistantPages=[
 {view:'overview',label:'Founder Hub',aliases:['home','dashboard','overview']},
 {view:'contributions',label:'Contributions',aliases:['payments','payment reports','contribution']},
 {view:'members',label:'Founders',aliases:['members','founder accounts','permissions']},
 {view:'statements',label:'Statements',aliases:['statement','my statement','group statement','treasury']},
 {view:'activity',label:'Activity',aliases:['notifications','updates']},
 {view:'goals',label:'Savings & planning',aliases:['savings','planning','calculator','goals','forecast']},
 {view:'projects',label:'Contribution schedule',aliases:['schedule','weekly schedule']},
 {view:'opportunities',label:'Opportunities',aliases:['ideas','business ideas','opportunity']},
 {view:'requests',label:'Funding requests',aliases:['funding','withdrawals']},
 {view:'governance',label:'Company decisions',aliases:['decisions','governance','votes']},
 {view:'accounts',label:'Accounts & recipients',aliases:['accounts','bank details','payment instructions','recipients']},
 {view:'agreements',label:'Agreements & notes',aliases:['agreements','notes','meeting notes']},
 {view:'help',label:'Help & guides',aliases:['help','guides']},
 {view:'pilotsetup',label:'Workspace setup',aliases:['setup','diagnostics'],ownerOnly:true},
 {view:'settings',label:'My account',aliases:['settings','profile','my account']},
];
const normalize=(value:string)=>value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
export function navigationIntent(question:string,isOwner=false){
 const q=normalize(question).replace(/^(open|go to|show me|show|take me to|navigate to) /,'');
 return assistantPages.find(p=>(!p.ownerOnly||isOwner)&&[p.label,...p.aliases].some(a=>normalize(a)===q))?.view||null;
}
export type AssistantResult={key:string;kind:'page'|'record'|'founder'|'goal';label:string;detail:string;view:string;entryId?:string};
const views:Record<string,string>={contribution:'contributions',obligation:'members',request:'requests',note:'agreements',agreement:'agreements',decision:'governance',opportunity:'opportunities'};
// Input is the permission-filtered workspace response. Explicitly index display
// fields; do not index sign-in emails, receipts, actor IDs or banking references.
export function searchWorkspace(org:Org,entries:Entry[],query:string):AssistantResult[]{
 const q=normalize(query).slice(0,200),tokens=q.split(' ').filter(Boolean);
 const matches=(value:string)=>tokens.every(t=>normalize(value).includes(t));
 const pages=assistantPages.filter(p=>(!p.ownerOnly||org.permissions?.isOwner)&&(!q?['contributions','goals','statements','opportunities'].includes(p.view):matches([p.label,...p.aliases].join(' ')))).map(p=>({key:'page:'+p.view,kind:'page' as const,label:p.label,detail:'Open page',view:p.view}));
 if(!q)return pages;
 const records=entries.filter(e=>e.orgId===org.id&&views[e.type]&&matches([e.title,e.purpose||'',e.type,e.date,e.status].join(' '))).map(e=>({key:'record:'+e.id,kind:'record' as const,label:e.title,detail:`${e.type} · ${e.date} · ${e.status}`,view:views[e.type],entryId:e.id}));
 const founders=org.members.filter(m=>matches(m.name+' '+m.role)).map(m=>({key:'founder:'+m.id,kind:'founder' as const,label:m.name,detail:'Founder · '+m.role,view:'members'}));
 const goals=(org.savingsGoals||[]).filter(g=>matches(g.title+' '+g.description)).map(g=>({key:'goal:'+g.id,kind:'goal' as const,label:g.title,detail:'Savings goal · '+g.status,view:'goals'}));
 return [...pages,...records,...founders,...goals].slice(0,20);
}
