import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const names=['organizations','entries','installation','notification_reads'];
const fail=message=>{throw new Error(message);};
const text=(value,label)=>typeof value==='string'&&value&&!value.includes('\0')?value:fail('Invalid '+label);
const timestamp=(value,label)=>{text(value,label);if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(value)||(!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,19)!==value.slice(0,19)))fail('Invalid '+label);};
const parse=(row,label)=>{try{const value=JSON.parse(text(row.data,label));if(!value||Array.isArray(value)||typeof value!=='object')fail('Invalid '+label);return value;}catch{fail('Invalid '+label+' JSON; use the complete owner export.');}};
export function validateExport(snapshot){
 if(snapshot?.format!=='mola-ledger-export/v1'||!snapshot.tables||snapshot.model_projection)fail('Use the complete owner export, not a truncated database-viewer result.');
 text(snapshot.projectId,'project ID');timestamp(snapshot.exportedAt,'export timestamp');
 const payload={format:snapshot.format,projectId:snapshot.projectId,exportedAt:snapshot.exportedAt,tables:snapshot.tables};
 const sha256=createHash('sha256').update(JSON.stringify(payload)).digest('hex');
 if(snapshot.integrity?.algorithm!=='SHA-256'||snapshot.integrity.sha256!==sha256)fail('Export integrity check failed. Download a fresh export.');
 for(const name of names){const rows=snapshot.tables[name];if(!Array.isArray(rows)||snapshot.counts?.[name]!==rows.length)fail('Export row count mismatch: '+name);const ids=new Set();for(const row of rows){text(row.id,name+' ID');if(ids.has(row.id))fail('Duplicate '+name+' ID');ids.add(row.id);}}
 const orgs=new Map();for(const row of snapshot.tables.organizations){const org=parse(row,'organization');if(org.id!==row.id||!Array.isArray(org.members)||!Number.isSafeInteger(row.version)||row.version<1)fail('Invalid organization identity/version');text(row.owner,'organization owner');orgs.set(row.id,org);}
 const install=snapshot.tables.installation;if(install.length!==1||snapshot.tables.organizations.some(row=>row.owner!==install[0].owner))fail('The export must have one installation owner.');text(install[0].owner,'installation owner');
 const currencies=new Set(['USD','CAD','XAF']);
 const types=new Set(['contribution','obligation','request','note','decision']);
 const totals={};let missingCutoffs=0;
 for(const row of snapshot.tables.entries){const entry=parse(row,'entry'),org=orgs.get(row.org_id);if(!org||entry.orgId!==row.org_id||entry.id!==row.id)fail('Entry identity or organization mismatch');if(!types.has(entry.type)||!currencies.has(entry.currency)||!Number.isSafeInteger(entry.amountMinor)||entry.amountMinor<0)fail('Invalid entry type, currency or amount');timestamp(row.created,'recorded timestamp');if(entry.created!==row.created)fail('Recording timestamp mismatch');if(['contribution','obligation'].includes(entry.type)&&!org.members.some(m=>m.id===entry.memberId))fail('Unknown entry member');if(entry.type==='obligation'&&!entry.deadline)missingCutoffs++;if(entry.type==='contribution')totals[entry.currency]=(totals[entry.currency]||0)+entry.amountMinor;}
 const reads=new Set();for(const row of snapshot.tables.notification_reads){if(!orgs.has(row.org_id))fail('Unknown notification organization');text(row.user_id,'notification user');text(row.event_id,'notification event');timestamp(row.read_at,'notification read timestamp');const key=JSON.stringify([row.user_id,row.org_id,row.event_id]);if(reads.has(key))fail('Duplicate notification read state');reads.add(key);}
 return {projectId:snapshot.projectId,counts:snapshot.counts,reportedContributionMinorByCurrency:totals,obligationsWithoutCutoffs:missingCutoffs,sha256};
}
const quote=value=>"'"+String(value).replaceAll("'","''")+"'";
export function prepareImport(snapshot){
 const report=validateExport(snapshot);
 const sql=['-- Private ledger import. Contains member details and internal audit identities.','-- Keep private. Applies only to an empty mola_private ledger after its foundation migration.','BEGIN;',"DO $$ BEGIN IF EXISTS (SELECT 1 FROM mola_private.organizations) OR EXISTS (SELECT 1 FROM mola_private.entries) OR EXISTS (SELECT 1 FROM mola_private.installation) OR EXISTS (SELECT 1 FROM mola_private.notification_reads) OR EXISTS (SELECT 1 FROM mola_private.auth_identity_links) THEN RAISE EXCEPTION 'Target ledger is not empty; import stopped'; END IF; END $$;"];
 for(const name of names){const columns=name==='organizations'?['id','owner','data','version']:name==='entries'?['id','org_id','data','created','recorded_at']:name==='installation'?['id','owner']:['id','user_id','org_id','event_id','read_at'];for(const row of snapshot.tables[name]){const values=columns.map(c=>c==='version'?String(row.version):quote(c==='recorded_at'?row.created:row[c]));sql.push('INSERT INTO mola_private.'+name+' ('+columns.join(',')+') VALUES ('+values.join(',')+');');}}
 for(const name of names)sql.push("DO $$ BEGIN IF (SELECT count(*) FROM mola_private."+name+") <> "+report.counts[name]+" THEN RAISE EXCEPTION 'Row count mismatch for "+name+"'; END IF; END $$;");
 sql.push('COMMIT;');return {report,sql:sql.join('\n')+'\n'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 try{const [input,out]=process.argv.slice(2);if(!input||!out)fail('Usage: node scripts/prepare-supabase-import.mjs <complete-owner-export.json> <private-output-directory>');const snapshot=JSON.parse(fs.readFileSync(input,'utf8')),result=prepareImport(snapshot);fs.mkdirSync(out,{recursive:true,mode:0o700});fs.writeFileSync(path.join(out,'ledger-import.sql'),result.sql,{encoding:'utf8',mode:0o600,flag:'wx'});fs.writeFileSync(path.join(out,'validation.json'),JSON.stringify(result.report,null,2)+'\n',{encoding:'utf8',mode:0o600,flag:'wx'});console.log('Validated export and prepared import. No database was changed.');console.log(JSON.stringify({counts:result.report.counts,obligationsWithoutCutoffs:result.report.obligationsWithoutCutoffs}));}catch(e){console.error(e.message);process.exitCode=1;}
}
