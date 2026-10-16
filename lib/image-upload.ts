// Shared PNG/JPEG upload handling for payment receipts, purchase receipts and profile photos.
const limit=3*1024*1024;
// Reads a PNG/JPEG upload of at most 3 MB, checking the file signature rather than the declared type.
export async function readImage(req:Request):Promise<{bytes:Uint8Array;mime:string;total:number}|{error:string;status:number}>{
 if(Number(req.headers.get('content-length'))>limit)return {error:'Use a PNG or JPEG screenshot under 3 MB.',status:413};
 const reader=req.body?.getReader();if(!reader)return {error:'Choose a screenshot.',status:400};let total=0;const chunks:Uint8Array[]=[];
 while(true){const part=await reader.read();if(part.done)break;total+=part.value.length;if(total>limit){await reader.cancel();return {error:'Use a screenshot under 3 MB.',status:413};}chunks.push(part.value);}
 const bytes=new Uint8Array(total);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length;}
 const png=[137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b),jpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 const mime=png?'image/png':jpeg?'image/jpeg':'';if(!mime||total<16)return {error:'Only PNG and JPEG screenshots are accepted.',status:400};
 return {bytes,mime,total};
}
export const imageHeaders=(mime:string,name:string)=>({'Content-Type':mime,'Content-Disposition':`inline; filename="${name}.${mime==='image/png'?'png':'jpg'}"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"});
