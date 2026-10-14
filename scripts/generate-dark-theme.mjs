// Generates app/mola-dark.css from the light stylesheets.
// Every rule that sets a colour gets a twin under :root[data-theme="dark"], with the colour
// remapped by role: light surfaces become dark, dark text becomes light, brand and status
// colours (saturated mid tones, and already-dark surfaces such as the hero) keep their identity.
// Twins are emitted for every colour declaration so the light cascade order is preserved.
// Run: node scripts/generate-dark-theme.mjs   (re-run after changing any light stylesheet)
import {readFileSync,writeFileSync} from 'node:fs';

const SOURCES=['globals.css','workspace-refresh.css','mola-brand.css','founder-experience.css','mola-mobile.css'];
const DARK=':root[data-theme="dark"]';

// ---------- minimal CSS parser (rules, @media/@supports nesting, comments, strings) ----------
function parse(css){
 css=css.replace(/\/\*[\s\S]*?\*\//g,'');
 let i=0;
 function block(){
  const nodes=[];
  while(i<css.length){
   while(i<css.length&&/\s/.test(css[i]))i++;
   if(i>=css.length||css[i]==='}'){i++;return nodes;}
   let start=i,depth=0,quote='';
   while(i<css.length){const c=css[i];if(quote){if(c===quote&&css[i-1]!=='\\')quote='';}else if(c==='"'||c==="'")quote=c;else if(c==='(')depth++;else if(c===')')depth--;else if(depth===0&&(c==='{'||c===';'||c==='}'))break;i++;}
   const head=css.slice(start,i).trim();
   if(css[i]===';'){i++;continue;}               // @import / stray statement
   if(css[i]==='}'){continue;}
   i++;                                          // consume '{'
   if(head.startsWith('@')){
    const name=head.slice(1).split(/[\s(]/)[0];
    if(['media','supports','layer'].includes(name)&&!/^@layer\s+[\w-]+\s*;/.test(head))nodes.push({type:'at',head,children:block()});
    else skipBlock();
   }else nodes.push({type:'rule',selector:head,decls:declarations()});
  }
  return nodes;
 }
 function skipBlock(){let depth=1;while(i<css.length&&depth){if(css[i]==='{')depth++;else if(css[i]==='}')depth--;i++;}}
 function declarations(){
  const out=[];let start=i,depth=0,quote='';
  while(i<css.length){
   const c=css[i];
   if(quote){if(c===quote&&css[i-1]!=='\\')quote='';}
   else if(c==='"'||c==="'")quote=c;else if(c==='(')depth++;else if(c===')')depth--;
   else if(depth===0&&c==='{'){skipBlock();start=i;continue;}            // nested rule (e.g. &:hover in @utility): ignore
   else if(depth===0&&(c===';'||c==='}')){const d=css.slice(start,i).trim();if(d)out.push(d);i++;start=i;if(c==='}')return out;continue;}
   i++;
  }
  return out;
 }
 return block();
}

// ---------- colour helpers ----------
const NAMED={white:'#ffffff',black:'#000000'};
const COLOR=/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|\b(?:white|black)\b/g;
function toRgb(token){
 token=NAMED[token]||token;
 if(token[0]==='#'){let h=token.slice(1);if(h.length<=4)h=[...h].map(c=>c+c).join('');const n=parseInt(h.slice(0,6),16);return {r:n>>16&255,g:n>>8&255,b:n&255,a:h.length===8?parseInt(h.slice(6),16)/255:1};}
 const p=token.slice(token.indexOf('(')+1,-1).split(/[\s,/]+/).filter(Boolean).map(v=>v.endsWith('%')?parseFloat(v)*2.55:parseFloat(v));
 return {r:p[0],g:p[1],b:p[2],a:p.length>3?(String(p[3]).includes('.')||p[3]<=1?Math.min(1,p[3]):p[3]/255):1};
}
function toHsl({r,g,b}){r/=255;g/=255;b/=255;const max=Math.max(r,g,b),min=Math.min(r,g,b),l=(max+min)/2;let h=0,s=0;if(max!==min){const d=max-min;s=l>.5?d/(2-max-min):d/(max+min);h=max===r?(g-b)/d+(g<b?6:0):max===g?(b-r)/d+2:(r-g)/d+4;h/=6;}return {h,s,l};}
function fromHsl({h,s,l}){const f=n=>{const k=(n+h*12)%12,a=s*Math.min(l,1-l);return Math.round(255*(l-a*Math.max(-1,Math.min(k-3,9-k,1))));};return {r:f(0),g:f(8),b:f(4)};}
function out({r,g,b},a){const hex='#'+[r,g,b].map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join('');return a>=.999?hex:hex+Math.round(Math.max(0,Math.min(1,a))*255).toString(16).padStart(2,'0');}
const accent=({s,l})=>s>.42&&l>.3&&l<.8;     // brand gold, status reds/greens/ambers

function remap(token,role){
 const rgb=toRgb(token),hsl=toHsl(rgb),a=rgb.a;
 if(role==='shadow')return out({r:0,g:0,b:0},Math.min(1,a*1.8+.04));
 if(role==='text'){
  if(hsl.l>=.75)return token;                             // already light: text on dark/brand surfaces
  return out(fromHsl({h:hsl.h,s:Math.min(hsl.s,.55),l:Math.max(.68,.93-hsl.l*.5)}),a);   // muted greys stay readable
 }
 if(role==='border'){
  if(hsl.l<.55||accent(hsl))return token;
  return out(fromHsl({h:hsl.h,s:hsl.s*.45,l:.17+(1-hsl.l)*.55}),a);
 }
 // background
 if(hsl.l<.45)return token;                                // dark brand surface (hero, sidebar, primary)
 if(accent(hsl)&&hsl.l<.75)return token;                  // gold buttons, status chips
 return out(fromHsl({h:hsl.h,s:hsl.s*.55,l:Math.min(.3,.085+(1-hsl.l)*.85)}),a);
}

function roleFor(prop,value){
 if(prop.startsWith('--')){if(!/#[0-9a-f]{3}|rgba?\(|\b(white|black)\b/i.test(value))return null;if(/foreground|text/.test(prop))return 'text';if(/border|input|ring/.test(prop))return 'border';if(/shadow/.test(prop))return 'shadow';return 'background';}
 if(/^(color|-webkit-text-fill-color|caret-color|fill|stroke|text-decoration-color|accent-color)$/.test(prop))return 'text';
 if(/^(background|background-color|background-image)$/.test(prop))return 'background';
 if(/^(border|border-(top|right|bottom|left|block|inline)(-(start|end))?|border(-(top|right|bottom|left|block|inline)(-(start|end))?)?-color|outline|outline-color|column-rule|column-rule-color)$/.test(prop))return 'border';
 if(/^(box-shadow|text-shadow)$/.test(prop))return 'shadow';
 if(/^(-webkit-)?filter$/.test(prop)&&/drop-shadow/.test(value))return 'shadow';
 return null;
}

// A rule that keeps a light brand background (gold buttons, active gold nav items) keeps its dark text too.
function keepsLightAccent(decls){
 return decls.some(decl=>{const colon=decl.indexOf(':'),prop=decl.slice(0,colon).trim().toLowerCase();if(!/^background(-color)?$/.test(prop))return false;
  return (decl.slice(colon+1).match(COLOR)||[]).some(tok=>{const hsl=toHsl(toRgb(tok));return hsl.l>=.5&&accent(hsl);});});
}

function darkDeclaration(decl,keepText=false){
 const colon=decl.indexOf(':');if(colon<0)return null;
 const prop=decl.slice(0,colon).trim().toLowerCase(),value=decl.slice(colon+1).trim();
 // Colour-bearing properties are twinned even when the value has no colour (transparent, none, 0),
 // otherwise an earlier rule's dark twin would outrank a later light-mode reset.
 let role=roleFor(prop,value);if(!role)return null;
 // Inset hairlines in box-shadow behave like borders; other shadows just deepen.
 if(role==='shadow'&&/\binset\b/.test(value))role='border';
 if(role==='text'&&keepText)return `${prop}:${value}`;
 const mapped=value.replace(COLOR,tok=>remap(tok,role));
 return `${prop}:${mapped}`;
}

// ---------- selector scoping ----------
function splitSelectors(selector){const parts=[];let depth=0,start=0;for(let i=0;i<selector.length;i++){const c=selector[i];if(c==='('||c==='[')depth++;else if(c===')'||c===']')depth--;else if(c===','&&depth===0){parts.push(selector.slice(start,i));start=i+1;}}parts.push(selector.slice(start));return parts.map(s=>s.trim()).filter(Boolean);}
function scope(sel){
 if(/^:root\b/.test(sel))return sel.replace(/^:root/,DARK);
 if(/^html\b/.test(sel))return sel.replace(/^html/,'html[data-theme="dark"]');
 if(/^\.dark\b/.test(sel))return null;                     // shadcn's own .dark variant is unused
 return `${DARK} ${sel}`;
}

function emit(nodes,indent=''){
 let css='';
 for(const node of nodes){
  if(node.type==='at'){const inner=emit(node.children,indent+'  ');if(inner)css+=`${indent}${node.head}{\n${inner}${indent}}\n`;continue;}
  if(/^(from|to|\d+%)/.test(node.selector))continue;
  const keepText=keepsLightAccent(node.decls);
  const decls=node.decls.map(d=>darkDeclaration(d,keepText)).filter(Boolean);if(!decls.length)continue;
  const selectors=splitSelectors(node.selector).map(scope).filter(Boolean);if(!selectors.length)continue;
  css+=`${indent}${selectors.join(',')}{${decls.join(';')}}\n`;
 }
 return css;
}

const root=new URL('../app/',import.meta.url);
let body='';
for(const file of SOURCES){const generated=emit(parse(readFileSync(new URL(file,root),'utf8')));if(generated)body+=`/* from ${file} */\n${generated}`;}
const tuned=readFileSync(new URL('mola-dark-tuning.css',root),'utf8');
writeFileSync(new URL('mola-dark.css',root),`/* GENERATED by scripts/generate-dark-theme.mjs from the light stylesheets. Do not edit by hand;\n   adjust app/mola-dark-tuning.css (appended last) or the mapping in the script, then re-run. */\n${body}\n/* hand tuning */\n${tuned}`);
console.log(`mola-dark.css: ${body.split('\n').length} generated rules`);
