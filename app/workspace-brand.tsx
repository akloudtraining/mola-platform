'use client';

import {useLayoutEffect} from 'react';
import {Landmark} from 'lucide-react';

type WorkspaceIdentity={organizationId?:string;organizationName?:string};

// Stored organization IDs are userId + ':' + template ID. Names can change.
function isMolaWorkspace(organizationId?:string){
  const suffix=':mola';
  return organizationId==='mola'||!!(organizationId&&organizationId.length>suffix.length&&organizationId.endsWith(suffix));
}

export function WorkspaceLogo({organizationId,organizationName}:WorkspaceIdentity){
  return isMolaWorkspace(organizationId)
    ?<div className="mola-brand"><img src="/mola-mark.png" alt="" width={256} height={256} decoding="async"/><span className="mola-brand-name"><strong>Mola</strong><small>Holdings</small></span></div>
    :<><div className="wordmark workspace-identity"><span className="brand-icon" aria-hidden="true"><Landmark size={24}/></span><span>{organizationName||'Mola Holdings'}</span></div><p>Mola investment workspace</p></>;
}

// Phone-only brand row: the sidebar (and its full logo) is hidden behind "More" on small screens.
export function MobileBrand({organizationId,organizationName}:WorkspaceIdentity){
  const mola=isMolaWorkspace(organizationId);
  return <header className="mobile-brand">{mola?<img src="/mola-mark.png" alt="" width={256} height={256} decoding="async"/>:<span className="brand-icon" aria-hidden="true"><Landmark size={20}/></span>}<span className="mobile-brand-name"><strong>{mola?'Mola':organizationName||'Mola Holdings'}</strong>{mola&&<small>Holdings</small>}</span></header>;
}

export default function WorkspaceBrand({organizationId,organizationName}:WorkspaceIdentity){
  useLayoutEffect(()=>{
    const root=document.documentElement;
    const previousTitle=document.title;
    const previousBrand=root.getAttribute('data-workspace-brand');
    const icons=Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="icon"], link[rel="shortcut icon"]'));
    const previousIcons=icons.map(icon=>({icon,href:icon.getAttribute('href'),type:icon.getAttribute('type')}));
    const isMola=isMolaWorkspace(organizationId);

    if(isMola)root.setAttribute('data-workspace-brand','mola');
    else root.removeAttribute('data-workspace-brand');
    document.title=organizationName?`${organizationName} — Investment Workspace`:'Mola Holdings — Investment Workspace';
    for(const icon of icons){
      icon.setAttribute('href',isMola?'/mola-mark.png':'/favicon.svg');
      icon.setAttribute('type',isMola?'image/png':'image/svg+xml');
    }

    return()=>{
      if(previousBrand===null)root.removeAttribute('data-workspace-brand');
      else root.setAttribute('data-workspace-brand',previousBrand);
      document.title=previousTitle;
      for(const {icon,href,type} of previousIcons){
        if(href===null)icon.removeAttribute('href');else icon.setAttribute('href',href);
        if(type===null)icon.removeAttribute('type');else icon.setAttribute('type',type);
      }
    };
  },[organizationId,organizationName]);
  return null;
}
