import type {Org} from './model';
export const avatarUrl=(orgId:string,memberId:string,photoAt:string)=>'/api/avatar?'+new URLSearchParams({orgId,memberId,v:photoAt});
// Centre-crops to a 256 px square JPEG in the browser so a large phone photo uploads in a few KB.
async function squareJpeg(file:File):Promise<Blob>{
 const bitmap=await createImageBitmap(file).catch(()=>{throw new Error('Choose a photo (PNG, JPEG or a phone photo).');});
 const side=Math.min(bitmap.width,bitmap.height),size=Math.min(256,side),canvas=document.createElement('canvas');canvas.width=canvas.height=size;
 canvas.getContext('2d')!.drawImage(bitmap,(bitmap.width-side)/2,(bitmap.height-side)/2,side,side,0,0,size,size);bitmap.close();
 return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('The photo could not be prepared.')),'image/jpeg',.86));
}
export async function uploadAvatar(orgId:string,file:File):Promise<Org>{
 const body=await squareJpeg(file);
 const r=await fetch('/api/avatar?'+new URLSearchParams({orgId}),{method:'POST',headers:{'Content-Type':'image/jpeg'},body});
 const d=await r.json().catch(()=>({})) as {error?:string;organization?:Org};if(!r.ok||!d.organization)throw new Error(d.error||'The photo could not be saved. Please retry.');return d.organization;
}
