export const dynamic='force-dynamic';
export async function POST(){return Response.json({error:'This legacy external-storage endpoint has been retired. Use the normal receipt review workflow.'},{status:410,headers:{'Cache-Control':'no-store'}});}
