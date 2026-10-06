// Authorized read-only migration export. Access credentials arrive on hidden stdin.
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {prepareImport} from './prepare-supabase-import.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'work','supabase-migration');
const quoted=value=>{if(typeof value!=='string'||/[\r\n\0]/.test(value))throw new Error('Invalid private export configuration');return '"'+value.replaceAll('\\','\\\\').replaceAll('"','\\"')+'"';};
if(process.stdin.isTTY)process.stdin.setRawMode(true);
process.stdout.write('Ready for private export access JSON on stdin (input is hidden).\n');
let input='';
process.stdin.on('data',async chunk=>{
 input+=chunk.toString();if(!input.includes('\n'))return;process.stdin.pause();
 try{
  const config=JSON.parse(input.slice(0,input.indexOf('\n')));input='';
  const url=new URL('/api/workspace/export',config.siteUrl);if(url.protocol!=='https:')throw new Error('HTTPS required');
  fs.mkdirSync(out,{recursive:true,mode:0o700});const snapshotPath=path.join(out,'source-ledger.json');
  fs.writeFileSync(snapshotPath,'',{mode:0o600,flag:'w'});
  const curl=spawn('curl',['--fail','--silent','--show-error','--max-time','30','--config','-'],{stdio:['pipe','ignore','pipe']});
  let error='';curl.stderr.on('data',chunk=>{error+=chunk.toString();});
  curl.stdin.end(['url = '+quoted(url.href),'header = '+quoted('OAI-Sites-Authorization: Bearer '+config.siteServiceToken),'header = '+quoted('X-Mola-Migration-Export-Token: '+config.migrationToken),'output = '+quoted(snapshotPath)].join('\n')+'\n');
  const status=await new Promise(resolve=>curl.on('close',resolve));if(status!==0)throw new Error('Private export request failed (curl '+status+').');
  const snapshot=JSON.parse(fs.readFileSync(snapshotPath,'utf8'));const {report,sql}=prepareImport(snapshot);
  fs.writeFileSync(path.join(out,'ledger-import.sql'),sql,{mode:0o600});fs.writeFileSync(path.join(out,'validation.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
  process.stdout.write(JSON.stringify({complete:true,counts:report.counts,obligationsWithoutCutoffs:report.obligationsWithoutCutoffs})+'\n');
  if(process.stdin.isTTY)process.stdin.setRawMode(false);process.exit(0);
 }catch(e){if(process.stdin.isTTY)process.stdin.setRawMode(false);process.stderr.write(e.message+'\n');process.exit(1);}
});
