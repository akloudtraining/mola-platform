import {fr,frPatterns} from './i18n-fr';

// Display-layer translation. Components keep rendering English; this swaps known
// interface text for French in the DOM and restores it when French is switched off.
// Record content people typed (names, notes, references) never matches the catalogue,
// and form fields, scripts and anything marked translate="no" are left alone.
const ATTRIBUTES=['placeholder','aria-label','title','alt'];
const SKIP='script,style,textarea,code,pre,[contenteditable="true"],[translate="no"]';

function lookup(text:string):string|null{
 const match=/^(\s*)([\s\S]*?)(\s*)$/.exec(text);if(!match||!match[2])return null;
 const core=match[2].replace(/\s+/g,' ');
 let out:string|undefined=fr[core];
 if(out===undefined)for(const [pattern,replace] of frPatterns){const hit=pattern.exec(core);if(hit){out=typeof replace==='string'?core.replace(pattern,replace):replace(...hit.slice(1));break;}}
 return out===undefined?null:match[1]+out+match[3];
}

export function translate(text:string){return lookup(text)??text;}

export function startTranslation(){
 const originalText=new WeakMap<Text,string>(),writtenText=new WeakMap<Text,string>();
 const originalAttr=new WeakMap<Element,Map<string,string>>(),touchedText=new Set<Text>(),touchedAttr=new Set<Element>();
 const originalTitle=document.title;
 const skipped=(node:Node)=>{const el=node.nodeType===1?node as Element:node.parentElement;return !el||!!el.closest(SKIP);};
 const text=(node:Text)=>{
  const value=node.nodeValue||'';if(writtenText.get(node)===value||skipped(node))return;
  const next=lookup(value);if(next===null||next===value)return;
  originalText.set(node,value);writtenText.set(node,next);touchedText.add(node);node.nodeValue=next;
 };
 const attributes=(el:Element)=>{
  if(skipped(el))return;
  for(const name of ATTRIBUTES){
   const value=el.getAttribute(name);if(!value)continue;
   const saved=originalAttr.get(el);if(saved?.has(name)&&lookup(saved.get(name)!)===value)continue;
   const next=lookup(value);if(next===null||next===value)continue;
   const map=saved||new Map<string,string>();map.set(name,value);originalAttr.set(el,map);touchedAttr.add(el);el.setAttribute(name,next);
  }
 };
 const walk=(root:Node)=>{
  if(root.nodeType===3){text(root as Text);return;}
  if(root.nodeType!==1&&root.nodeType!==9&&root.nodeType!==11)return;
  if(root.nodeType===1)attributes(root as Element);
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT|NodeFilter.SHOW_ELEMENT);
  for(let node=walker.nextNode();node;node=walker.nextNode()){if(node.nodeType===3)text(node as Text);else attributes(node as Element);}
 };
 const observer=new MutationObserver(records=>{
  for(const record of records){
   if(record.type==='characterData')text(record.target as Text);
   else if(record.type==='attributes')attributes(record.target as Element);
   else record.addedNodes.forEach(walk);
  }
  document.title=translate(document.title);
 });
 walk(document.body);document.title=translate(document.title);
 observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:ATTRIBUTES});
 return ()=>{
  observer.disconnect();
  for(const node of touchedText){if(node.nodeValue===writtenText.get(node))node.nodeValue=originalText.get(node)!;}
  for(const el of touchedAttr){originalAttr.get(el)?.forEach((value,name)=>el.setAttribute(name,value));}
  document.title=originalTitle;
 };
}
