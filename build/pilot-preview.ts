import type {Plugin} from 'vite';

const previewHosts=new Set(['terminal.local:4173','localhost:4173','127.0.0.1:4173']);

// The managed preview is HTTP. This middleware exists only in Vite's dev
// server; the published Worker continues to issue Secure session cookies.
export function pilotPreview({enabled}:{enabled:boolean}):Plugin{
 return {name:'mola-pilot-preview',apply:'serve',configureServer(server){
  if(!enabled)return;
  server.middlewares.use((request,response,next)=>{
   if(!previewHosts.has(String(request.headers.host||'').toLowerCase())||request.url?.split('?')[0]!=='/api/auth'){next();return;}
   const setHeader=response.setHeader.bind(response);
   response.setHeader=(name,value)=>{
    if(name.toLowerCase()!=='set-cookie')return setHeader(name,value);
    const rewrite=(cookie:string)=>/^mola_(?:access|refresh)_token=/.test(cookie)?cookie.replace(/;\s*Secure(?=;|$)/ig,''):cookie;
    return setHeader(name,Array.isArray(value)?value.map(rewrite):typeof value==='string'?rewrite(value):value);
   };
   next();
  });
 }};
}

export function pilotPreviewVars(values:Record<string,string>,serve:boolean){
 if(!serve)return {};
 return Object.fromEntries(['SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','MOLA_OWNER_EMAIL'].filter(key=>!!values[key]).map(key=>[key,values[key]]));
}
