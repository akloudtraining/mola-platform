// Per-device display preferences. They are not account data, so they live in this browser only.
export type ThemeChoice='system'|'light'|'dark';
export type LanguageChoice='en'|'fr'|'system';
// 'ink' is the Graphite style: a dark-only palette (graphite surfaces, mint accent).
export type PaletteChoice='mola'|'ink';
export const PALETTE_KEY='mola-palette',THEME_KEY='mola-theme',LANGUAGE_KEY='mola-language',PREFERENCES_EVENT='mola-preferences';

function read(key:string){try{return window.localStorage.getItem(key);}catch{return null;}}
export function themeChoice():ThemeChoice{const v=read(THEME_KEY);return v==='light'||v==='dark'?v:'system';}
export function paletteChoice():PaletteChoice{return read(PALETTE_KEY)==='ink'?'ink':'mola';}
export function languageChoice():LanguageChoice{const v=read(LANGUAGE_KEY);return v==='fr'||v==='system'?v:'en';}
export function resolvedTheme(choice=themeChoice()):'light'|'dark'{return choice==='system'?(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):choice;}
export function resolvedLanguage(choice=languageChoice()):'en'|'fr'{return choice==='system'?(navigator.languages?.[0]||navigator.language||'en').toLowerCase().startsWith('fr')?'fr':'en':choice;}

export function savePreference(key:typeof THEME_KEY|typeof LANGUAGE_KEY|typeof PALETTE_KEY,value:string){
 try{window.localStorage.setItem(key,value);}catch{/* private mode: the choice still applies to this visit */}
 window.dispatchEvent(new CustomEvent(PREFERENCES_EVENT,{detail:{key,value}}));
}

export function applyTheme(){const ink=paletteChoice()==='ink',theme=ink?'dark':resolvedTheme(),root=document.documentElement;root.dataset.theme=theme;root.style.colorScheme=theme;if(ink)root.dataset.palette='ink';else delete root.dataset.palette;}

// Runs in <head> before first paint so a dark-mode visit never flashes the light theme.
export const preferenceBootScript=`(function(){try{var r=document.documentElement,t=localStorage.getItem('${THEME_KEY}'),l=localStorage.getItem('${LANGUAGE_KEY}');if(t!=='light'&&t!=='dark')t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';if(localStorage.getItem('${PALETTE_KEY}')==='ink'){t='dark';r.dataset.palette='ink';}r.dataset.theme=t;r.style.colorScheme=t;if(l==='system')l=((navigator.languages&&navigator.languages[0])||navigator.language||'en').toLowerCase().indexOf('fr')===0?'fr':'en';if(l==='fr')r.lang='fr';}catch(e){}})();`;
