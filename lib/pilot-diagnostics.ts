export type PilotCheck={id:string;title:string;status:'pass'|'fail'|'unverified';detail:string};
export type PilotDiagnostics={organizationId:string;organizationVersion:number;checkedAt:string;setup:{id:string;title:string;recorded:boolean;detail:string;view:string}[];provider: PilotCheck[];acceptance: PilotCheck[];callbacks:{confirmation:string;recovery:string}};

const providerTitles=[['email','Email sign-in enabled'],['signup','Member signup enabled'],['confirmation','Email confirmation required']] as const;
const unknownProvider=(detail:string):PilotCheck[]=>providerTitles.map(([id,title])=>({id,title,status:'unverified',detail}));

// The public settings endpoint verifies these flags, not SMTP or redirect configuration.
export async function checkEmailProvider(config:{url:string;key:string},request:typeof fetch=fetch):Promise<PilotCheck[]>{
 if(!config.url||!config.key)return providerTitles.map(([id,title])=>({id,title,status:'fail',detail:'Email authentication is not configured. Configure the authentication URL and publishable key before onboarding.'}));
 let url:URL;try{url=new URL(config.url);if(url.protocol!=='https:'||url.username||url.password)throw new Error('Invalid provider URL');}catch{return providerTitles.map(([id,title])=>({id,title,status:'fail',detail:'The authentication service URL must be a valid HTTPS address.'}));}
 try{
  const response=await request(config.url.replace(/\/$/,'')+'/auth/v1/settings',{headers:{apikey:config.key},cache:'no-store',signal:AbortSignal.timeout(7000)});
  if(!response.ok)return unknownProvider('The authentication service did not confirm its settings. Check its configuration and try again.');
  const data:any=await response.json();
  const flags=[data?.external?.email,data?.disable_signup,data?.mailer_autoconfirm];
  return providerTitles.map(([id,title],index)=>{
   if(typeof flags[index]!=='boolean')return {id,title,status:'unverified',detail:'The authentication service did not return this setting.'};
   const passed=index===0?flags[index]:!flags[index];
   return {id,title,status:passed?'pass':'fail',detail:passed?['The authentication service reports email sign-in enabled.','The authentication service reports signup enabled.','Members must confirm their email before signing in.'][index]:['Enable email sign-in in the authentication settings.','Enable member signup before testing onboarding.','Require email confirmation before onboarding pilot members.'][index]};
  });
 }catch{return unknownProvider('The authentication settings could not be checked. Try again; email delivery has not been tested.');}
}

export function manualPilotChecks():PilotCheck[]{return [
 {id:'sender',title:'Cloudflare sender domain verified',status:'unverified',detail:'Onboard and verify a domain with Cloudflare Email Service, configure the Worker EMAIL binding, and set MOLA_EMAIL_FROM. A configured sender does not yet prove delivery.'},
 {id:'callbacks',title:'Email links verified',status:'unverified',detail:'Open the actual confirmation and recovery messages on desktop and phone. Confirm each link returns to the Mola sign-in page and works only once.'},
 {id:'delivery',title:'Confirmation and recovery emails received',status:'unverified',detail:'Test signup, confirmation resend and password recovery with the intended member accounts. Record inbox arrival and successful link use in Buildroom.'},
 {id:'sharing',title:'Named pilot users allowed through Site sharing',status:'unverified',detail:'Configure the agreed member accounts first, then allow only those named users through Site sharing. App membership and Site access are separate.'},
 {id:'devices',title:'Desktop, phone and separate-member acceptance',status:'unverified',detail:'Use separate contributor and reviewer accounts. Record the contribution, review, balance, correction and refresh results on desktop and phone in Buildroom.'}
];}
