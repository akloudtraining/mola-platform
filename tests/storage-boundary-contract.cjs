const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const config = read('vite.config.ts');
const env = read('cloudflare-env.d.ts');
const receipt = read('app/api/receipt/route.ts');
const receiptUi = read('app/receipt-attachment.tsx');
const tests = [
  ['D1 remains the source for the live ledger', read('lib/database.ts').includes('env.DB')],
  ['Supabase auth/storage runtime modules are removed', !fs.existsSync(path.join(root,'lib/supabase-session.ts')) && !fs.existsSync(path.join(root,'lib/supabase-storage.ts'))],
  ['Cloudflare D1 and private receipt R2 are declared', config.includes('const d1 = "DB", r2 = "BUCKET"')],
  ['receipt uploads use the private Cloudflare R2 binding', receipt.includes('BUCKET?:R2Bucket') && receipt.includes('bucket.put(')],
  ['receipt upload UI is enabled and uses the Cloudflare receipt route', receiptUi.includes('uploadReceipt(entry,file)') && receiptUi.includes('accept="image/png,image/jpeg"') && !receiptUi.includes('temporarily unavailable while storage is being moved')],
  ['only Cloudflare auth/email runtime settings remain', env.includes('MOLA_AUTH_SECRET') && env.includes('MOLA_EMAIL_FROM') && !env.includes('SUPABASE_URL')],
  ['D1 migration file set includes native authentication', fs.existsSync(path.join(root,'drizzle/0004_cloudflare_auth.sql')) && fs.existsSync(path.join(root,'drizzle/0005_auth_identity_links.sql'))],
  ['legacy external storage endpoints are explicitly retired', read('app/api/storage/reconcile/route.ts').includes('status:410') && read('app/api/storage/contribution/route.ts').includes('status:410')],
];
const missing=tests.filter(([,ok])=>!ok);
if(missing.length){console.error('CLOUDFLARE STORAGE CONTRACT FAIL');for(const [label] of missing)console.error('- '+label);process.exit(1);}
console.log(`CLOUDFLARE STORAGE CONTRACT PASS: ${tests.length} Cloudflare-only runtime safeguards present.`);
