import type {Member} from './model';

// Public organization data omits principal IDs. Keep the chooser conservative;
// the server checks the authenticated principal again before writing.
export function founderSlotAvailable(member:Member,email:string){
 const access=member.access,normalized=email.trim().toLowerCase();
 if(access?.claimed||access?.userId)return false;
 if(access?.email){
  if(!access.enabled)return false;
  if(access.email.trim().toLowerCase()!==normalized)return false;
 }
 return true;
}
export function founderNameMatches(a:string,b:string){
 return a.trim().replace(/\s+/g,' ').toLocaleLowerCase()===b.trim().replace(/\s+/g,' ').toLocaleLowerCase();
}
export function validFounderName(name:string){
 return name.trim().length>=2&&name.length<=100&&!/^founder\s+\d+$/i.test(name.trim());
}
