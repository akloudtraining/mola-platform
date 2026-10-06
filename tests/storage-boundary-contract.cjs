const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const storage = read('lib/supabase-storage.ts');
const reconcile = read('app/api/storage/reconcile/route.ts');
const snapshot = read('app/api/storage/snapshot/route.ts');
const contribution = read('app/api/storage/contribution/route.ts');
const review = read('app/api/storage/contribution/review/route.ts');
const activity = read('app/api/storage/activity-read/route.ts');

const contracts = [
  ['storage backend defaults to D1', storage.includes("MOLA_STORAGE_BACKEND||'d1'")],
  ['Supabase cutover requires an explicit backend flag', storage.includes("==='supabase'")],
  ['storage calls use the member bearer token', storage.includes('Authorization:`Bearer ${token}`')],
  ['storage calls use the publishable key', storage.includes('apikey:c.key') && !storage.includes('SERVICE_ROLE')],
  ['reconciliation reads full D1 organization snapshots', reconcile.includes('SELECT id,owner,data,version FROM organizations')],
  ['reconciliation reads D1 entries and recording dates', reconcile.includes('SELECT id,org_id,data,created FROM entries')],
  ['reconciliation verifies the installation owner', reconcile.includes('Only the installation owner can run reconciliation.')],
  ['reconciliation is disabled while D1 is authoritative', reconcile.includes('D1 remains authoritative') && reconcile.includes("status:409")],
  ['snapshot route returns counts instead of ledger payloads', snapshot.includes('organizationCount') && snapshot.includes('entryCount') && !snapshot.includes('organizations:snapshot')],
  ['contribution path stays staged when D1 is authoritative', contribution.includes('live ledger still uses D1') && contribution.includes(',409)')],
  ['contribution entry id is server-constructed', contribution.includes("entry_id:body.orgId.trim()+':'+body.submissionId")],
  ['contribution does not forward caller status or reviews', !contribution.includes('status:body') && !contribution.includes('reviews:body')],
  ['review path stays staged when D1 is authoritative', review.includes('live ledger still uses D1') && review.includes(',409)')],
  ['review requires a bounded stale-review count', review.includes('Number.isInteger(body.reviewCount)') && review.includes('body.reviewCount>100000')],
  ['review forwards evidence and bounded credit only', review.includes('evidence:body.evidence.trim()') && review.includes('credit_minor:')],
  ['activity reads validate event ids against a fresh snapshot', activity.includes('validateStorageActivityEventIds') && activity.includes('normalizeStorageSnapshot(snapshot.data||{})')],
];

const missing = contracts.filter(([, ok]) => !ok);
if (missing.length) {
  console.error('STORAGE BOUNDARY CONTRACT FAIL');
  for (const [label] of missing) console.error(`- ${label}`);
  process.exit(1);
}

console.log(`STORAGE BOUNDARY CONTRACT PASS: ${contracts.length} staged-boundary safeguards present.`);
console.log('This is a source-level regression guard; D1 remains authoritative and live cutover is not enabled.');
