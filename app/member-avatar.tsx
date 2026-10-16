'use client';
import {useState} from 'react';
import type {Org} from '@/lib/model';
import {avatarUrl} from '@/lib/avatar';
type Member=Org['members'][number];
// Shows a founder's photo when one exists, falling back to their initial (or the given fallback) if it is missing or fails to load.
export default function MemberAvatar({orgId,member,className='avatar light',fallback}:{orgId?:string;member?:Member;className?:string;fallback?:React.ReactNode}){
 const photoAt=member?.profile?.photoAt,[failed,setFailed]=useState('');
 if(orgId&&member&&photoAt&&failed!==photoAt)return <span className={className+' has-photo'}><img src={avatarUrl(orgId,member.id,photoAt)} alt="" onError={()=>setFailed(photoAt)}/></span>;
 return <span className={className}>{fallback??(member?.name.slice(0,1).toUpperCase()||'—')}</span>;
}
