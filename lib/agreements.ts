import type {Entry,Org} from './model';

export const acceptanceConsent='I have read this agreement version and accept it for my own membership.';
export type AgreementAcceptance={memberId:string;memberName:string;typedName:string;actor:string;at:string;digest:string;consent:string};
export type AgreementVersion={revision:number;body:string;decisionReference:string;digest:string;publishedAt:string;publishedBy:string;publishedName:string;acceptances:AgreementAcceptance[];isCurrent?:boolean;canAccept?:boolean;acceptedByMe?:boolean};

export async function agreementDigest(input:{title:string;body:string;decisionReference:string}){
 const bytes=new TextEncoder().encode(JSON.stringify({title:input.title,body:input.body,decisionReference:input.decisionReference}));
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
}
export const sameMemberName=(a:string,b:string)=>a.trim().replace(/\s+/g,' ').toLocaleLowerCase()===b.trim().replace(/\s+/g,' ').toLocaleLowerCase();

export function publicAgreement(entry:Entry,org:Org,memberId:string,userId:string):AgreementVersion|undefined{
 if(entry.type!=='agreement'||!entry.agreement)return undefined;
 const agreement=entry.agreement,isCurrent=org.activeAgreementId===entry.id;
 return {...agreement,publishedBy:'',acceptances:agreement.acceptances.map(a=>({...a,actor:''})),isCurrent,
  acceptedByMe:agreement.acceptances.some(a=>a.memberId===memberId&&a.actor===userId),
  canAccept:isCurrent&&!!memberId&&!agreement.acceptances.some(a=>a.memberId===memberId)};
}

export function currentAgreement(org:Org,entries:Entry[]){return entries.find(e=>e.orgId===org.id&&e.id===org.activeAgreementId&&e.type==='agreement'&&e.agreement);}
