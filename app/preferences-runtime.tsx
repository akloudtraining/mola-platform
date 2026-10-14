'use client';
import {useEffect} from 'react';
import {applyTheme,resolvedLanguage,PREFERENCES_EVENT} from './preferences';

// Keeps the theme and language in step with the saved choice and, for "system", with the device.
export default function PreferencesRuntime(){
 useEffect(()=>{
  let current='',stop:(()=>void)|undefined,cancelled=false;
  const syncLanguage=async()=>{
   const language=resolvedLanguage();if(language===current)return;current=language;
   document.documentElement.lang=language;stop?.();stop=undefined;
   if(language!=='fr')return;
   const {startTranslation}=await import('./i18n');
   if(!cancelled&&current==='fr')stop=startTranslation();
  };
  const sync=()=>{applyTheme();void syncLanguage();};
  const media=window.matchMedia('(prefers-color-scheme: dark)');
  sync();
  media.addEventListener('change',sync);window.addEventListener(PREFERENCES_EVENT,sync);window.addEventListener('languagechange',sync);window.addEventListener('storage',sync);
  return()=>{cancelled=true;media.removeEventListener('change',sync);window.removeEventListener(PREFERENCES_EVENT,sync);window.removeEventListener('languagechange',sync);window.removeEventListener('storage',sync);stop?.();};
 },[]);
 return null;
}
