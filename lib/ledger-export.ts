export const ledgerTables=['organizations','entries','installation','notification_reads'] as const;
export type LedgerTables=Record<typeof ledgerTables[number],Record<string,unknown>[]>;
export async function ledgerExport(projectId:string,tables:LedgerTables,exportedAt=new Date().toISOString()){
 const payload={format:'mola-ledger-export/v1',projectId,exportedAt,tables};
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(payload)));
 const sha256=[...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('');
 return {...payload,counts:Object.fromEntries(ledgerTables.map(name=>[name,tables[name].length])),integrity:{algorithm:'SHA-256',sha256}};
}
