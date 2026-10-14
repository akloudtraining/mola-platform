'use client';
import {useEffect} from 'react';

// Long explanatory notes on pages are clamped to two lines by CSS; this marks the ones that
// actually overflow so they show a "more" cue and expand on tap or Enter. Forms and dialogs
// are excluded: text there must be read in full before submitting.
const NOTES='.notice p, .hub-caption, main .panel-header p.muted';

export default function ExpandableNotes(){
 useEffect(()=>{
  let frame=0;
  const mark=()=>{frame=0;document.querySelectorAll<HTMLElement>(NOTES).forEach(el=>{
   if(el.closest('form,[role="dialog"]')||el.classList.contains('is-expanded'))return;
   const clamped=el.scrollHeight>el.clientHeight+2;
   el.classList.toggle('is-clamped',clamped);
   if(clamped){el.tabIndex=0;el.setAttribute('role','button');el.setAttribute('aria-expanded','false');}
   else{el.removeAttribute('tabindex');el.removeAttribute('role');el.removeAttribute('aria-expanded');}
  });};
  const schedule=()=>{if(!frame)frame=requestAnimationFrame(mark);};
  const toggle=(event:Event)=>{
   const el=(event.target as Element|null)?.closest<HTMLElement>('.is-clamped,.is-expanded');if(!el)return;
   if(event instanceof KeyboardEvent){if(event.key!=='Enter'&&event.key!==' ')return;event.preventDefault();}
   const open=!el.classList.contains('is-expanded');
   el.classList.toggle('is-expanded',open);el.classList.toggle('is-clamped',!open);el.setAttribute('aria-expanded',String(open));
  };
  const observer=new MutationObserver(schedule);
  observer.observe(document.body,{childList:true,subtree:true});
  window.addEventListener('resize',schedule);document.addEventListener('click',toggle);document.addEventListener('keydown',toggle);
  schedule();
  return()=>{observer.disconnect();cancelAnimationFrame(frame);window.removeEventListener('resize',schedule);document.removeEventListener('click',toggle);document.removeEventListener('keydown',toggle);};
 },[]);
 return null;
}
