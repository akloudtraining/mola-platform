export const dynamic='force-dynamic';
export async function GET(){return Response.json({error:'This legacy external-storage endpoint has been retired. The live workspace API is backed by Cloudflare D1.'},{status:410,headers:{'Cache-Control':'no-store'}});}
