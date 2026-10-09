import {createCloudflareAuth} from '@/lib/cloudflare-auth';

export const dynamic='force-dynamic';

async function handler(req:Request){
 try{return await createCloudflareAuth(req).handler(req);}
 catch(error){
  console.error('Cloudflare auth endpoint failed',error);
  return Response.json({message:'Authentication service unavailable.'},{status:503,headers:{'Cache-Control':'no-store'}});
 }
}

export const GET=handler;
export const POST=handler;
