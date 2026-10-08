import {authAction} from '@/lib/auth-actions';
import {cloudflareUser} from '@/lib/cloudflare-auth';

export const dynamic='force-dynamic';

export async function GET(req:Request){
 try{return Response.json({user:await cloudflareUser(req)},{headers:{'Cache-Control':'no-store'}});}
 catch(e){console.error(e);return Response.json({user:null},{headers:{'Cache-Control':'no-store'}});}
}

export async function POST(req:Request){
 try{
  const body=await req.json().catch(()=>null);
  const response=(await authAction(req,body)).response;
  response.headers.set('Cache-Control','no-store');
  return response;
 }catch(e){console.error(e);return Response.json({error:'Authentication service unavailable. Please retry.'},{status:503,headers:{'Cache-Control':'no-store'}});}
}
