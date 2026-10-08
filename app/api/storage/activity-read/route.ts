export const dynamic='force-dynamic';
export async function POST(){return Response.json({error:'This legacy external-storage endpoint has been retired. Activity reads are stored by the Cloudflare workspace API.'},{status:410,headers:{'Cache-Control':'no-store'}});}
