// payoutId targets a purchase receipt on a funding request's payout instead of a contribution screenshot.
export function receiptUrl(orgId:string,entryId:string,payoutId?:string){
 const params=new URLSearchParams({orgId,entryId});if(payoutId)params.set('payoutId',payoutId);
 if(typeof window!=='undefined'&&/^\/test(?:\/|$)/.test(window.location.pathname)){
  const query=new URLSearchParams(window.location.search),session=query.get('session'),role=query.get('role');if(!session||!role)throw new Error('Open a current test workspace first.');params.set('session',session);params.set('role',role);
 }
 return '/api/receipt?'+params;
}
