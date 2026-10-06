export const storageTableNames=['installation','organizations','entries','notification_reads'] as const;
type Row=Record<string,unknown>;
export type StorageSnapshot={installation:Row[];organizations:Row[];entries:Row[];notification_reads:Row[]};

const text=(value:unknown)=>value===undefined||value===null?'':String(value);

function canonical(value:unknown):string{
 if(value===undefined)return 'null';
 if(value===null||typeof value==='boolean'||typeof value==='number'||typeof value==='string')return JSON.stringify(value);
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 const record=value as Record<string,unknown>;
 return '{'+Object.keys(record).sort().map(key=>JSON.stringify(key)+':'+canonical(record[key])).join(',')+'}';
}

function canonicalData(value:unknown){
 if(typeof value!=='string')return canonical(value??null);
 try{return canonical(JSON.parse(value));}catch{return value;}
}

function rows(value:unknown){return Array.isArray(value)?value.filter(row=>!!row&&typeof row==='object') as Row[]:[];}
function byId(list:Row[]){return [...list].sort((a,b)=>text(a.id).localeCompare(text(b.id)));}

export function normalizeStorageSnapshot(input:unknown):StorageSnapshot{
 const source=input&&typeof input==='object'?input as Record<string,unknown>:{};
 const rawInstallation=source.installation&&typeof source.installation==='object'&&!Array.isArray(source.installation)?[source.installation]:source.installation;
 const installation=byId(rows(rawInstallation).map(row=>({id:text(row.id||'primary'),owner:text(row.owner)})));
 const organizations=byId(rows(source.organizations).map(row=>({id:text(row.id),owner:text(row.owner),data:canonicalData(row.data),version:Number(row.version||0)})));
 const entries=byId(rows(source.entries).map(row=>({id:text(row.id),org_id:text(row.org_id),data:canonicalData(row.data),created:text(row.created),recorded_at:text(row.recorded_at||row.created)})));
 const notification_reads=byId(rows(source.notification_reads).map(row=>({id:text(row.id),user_id:text(row.user_id),org_id:text(row.org_id),event_id:text(row.event_id),read_at:text(row.read_at)})));
 return {installation,organizations,entries,notification_reads};
}

type TableComparison={match:boolean;d1Count:number;supabaseCount:number;missingInSupabase:string[];extraInSupabase:string[];changed:string[]};
function compareTable(left:Row[],right:Row[]):TableComparison{
 const l=new Map(left.map(row=>[text(row.id),canonical(row)])),r=new Map(right.map(row=>[text(row.id),canonical(row)]));
 const missingInSupabase=[...l.keys()].filter(id=>!r.has(id)).sort();
 const extraInSupabase=[...r.keys()].filter(id=>!l.has(id)).sort();
 const changed=[...l.keys()].filter(id=>r.has(id)&&l.get(id)!==r.get(id)).sort();
 return {match:missingInSupabase.length===0&&extraInSupabase.length===0&&changed.length===0,d1Count:left.length,supabaseCount:right.length,missingInSupabase,extraInSupabase,changed};
}

export async function digestSnapshot(snapshot:StorageSnapshot){
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(snapshot)));
 return [...new Uint8Array(digest)].map(value=>value.toString(16).padStart(2,'0')).join('');
}

export async function reconcileStorageSnapshots(d1Input:unknown,supabaseInput:unknown){
 const d1=normalizeStorageSnapshot(d1Input),supabase=normalizeStorageSnapshot(supabaseInput);
 const tables=Object.fromEntries(storageTableNames.map(name=>[name,compareTable(d1[name],supabase[name])])) as Record<typeof storageTableNames[number],TableComparison>;
 const match=Object.values(tables).every(table=>table.match);
 return {match,d1:{counts:Object.fromEntries(storageTableNames.map(name=>[name,d1[name].length])),digest:await digestSnapshot(d1)},supabase:{counts:Object.fromEntries(storageTableNames.map(name=>[name,supabase[name].length])),digest:await digestSnapshot(supabase)},tables};
}
