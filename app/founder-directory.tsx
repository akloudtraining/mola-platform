'use client';
import type {Org} from '@/lib/model';
import MemberAvatar from './member-avatar';
// What founders other than the owner see on Founders: everyone's profile, with no access or permission controls.
export default function FounderDirectory({org,onEditProfile}:{org:Org;onEditProfile:()=>void}){
 const me=org.permissions?.memberId;
 return <section className="panel founder-directory"><div className="panel-header"><div><h2>{org.members.length} founders</h2><p className="muted">Officer roles do not change voting weight.</p></div></div>
  <div className="directory-grid">{org.members.map(m=>{const role=['Member','Name pending'].includes(m.role)?'':m.role,p=m.profile,empty=!p?.location&&!p?.bio;
   return <article key={m.id} className="directory-card"><MemberAvatar orgId={org.id} member={m} className="avatar light directory-photo"/><div>
    <h3>{m.name}{m.id===me&&<small className="badge neutral">You</small>}</h3>
    {role&&<p className="directory-line">{role}</p>}
    {p?.location&&<p className="directory-meta">{p.location}</p>}
    {p?.bio&&<p className="directory-bio">{p.bio}</p>}
    {empty&&<p className="directory-meta">{m.id===me?'Add your photo and a few details':'No profile details yet.'}</p>}
    {m.id===me&&<button type="button" className="text-button" onClick={onEditProfile}>Edit my profile</button>}
   </div></article>;})}</div>
 </section>;
}
