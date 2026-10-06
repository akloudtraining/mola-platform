import {activityFor} from './activity';
import type {Entry,Org} from './model';
import type {StorageSnapshot} from './storage-reconcile';

type Validation={ok:true;ids:string[]}|{ok:false;error:string;status:400|403|409|503};

const parse=(value:unknown)=>{
 if(typeof value==='string')return JSON.parse(value);
 return value;
};

/**
 * Validate activity ids against the same visible snapshot that will receive
 * the read receipt. This keeps the staged Supabase route from accepting
 * arbitrary notification keys or another organization's records.
 */
export function validateStorageActivityEventIds(snapshot:StorageSnapshot,orgId:string,eventIds:unknown[],today=new Date().toISOString()):Validation{
 if(!orgId||orgId.length>200||!Array.isArray(eventIds)||!eventIds.length||eventIds.length>100||!eventIds.every(id=>typeof id==='string'&&id.length<500))return {ok:false,error:'Select up to 100 activity records.',status:400};
 const organization=snapshot.organizations.find(row=>String(row.id||'')===orgId);
 if(!organization)return {ok:false,error:'Organization is unavailable.',status:403};
 let org:Org;
 let entries:Entry[];
 try{
  org=parse(organization.data) as Org;
  entries=snapshot.entries.filter(row=>String(row.org_id||'')===orgId).map(row=>parse(row.data) as Entry);
 }catch{
  return {ok:false,error:'Activity state is unavailable.',status:503};
 }
 if(org.id!==orgId||org.mode!=='Shared ownership')return {ok:false,error:'Activity read state is available for Mola only.',status:400};
 const valid=new Set(activityFor(org,entries,today).map(event=>event.id));
 const ids=[...new Set(eventIds as string[])];
 if(ids.some(id=>!valid.has(id)))return {ok:false,error:'Activity changed. Refresh before marking it read.',status:409};
 return {ok:true,ids};
}
