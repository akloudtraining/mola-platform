import type {Entry,Org} from '@/lib/model';
import {pilotSetupRows} from '@/lib/pilot-setup';

export function workspaceStatus(test:boolean,recorded:boolean){
 if(test)return {label:'Test workspace',tone:'test-workspace'};
 return recorded?{label:'Group setup recorded',tone:'setup-complete'}:{label:'Group setup in progress',tone:'setup-progress'};
}

export default function WorkspaceStatus({org,entries,test=false}:{org:Org;entries:Entry[];test?:boolean}){
 const rows=pilotSetupRows(org,entries),status=workspaceStatus(test,rows.length>0&&rows.every(row=>row.recorded));
 return <span className={'setup-pill '+status.tone}>{status.label}</span>;
}
