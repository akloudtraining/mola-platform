const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const foundation = read('tests/supabase-foundation.sql');
const contribution = read('tests/supabase-contribution-write.sql');
const review = read('tests/supabase-review-write.sql');

const contracts = [
  ['foundation SQL is transaction-scoped and rollback-only', foundation.startsWith('BEGIN;') && foundation.includes('ROLLBACK;')],
  ['private tables require row-level security', foundation.includes('c.relrowsecurity')],
  ['anon and authenticated table privileges are denied', foundation.includes("has_table_privilege('anon'") && foundation.includes("has_table_privilege('authenticated'")],
  ['private schema usage is denied to browser roles', foundation.includes("has_schema_privilege('anon','mola_private','USAGE')")],
  ['service role cannot delete ledger rows', foundation.includes("has_table_privilege('service_role','mola_private.'||tbl,'DELETE')")],
  ['recording timestamps are immutable', foundation.includes('Mutable timestamp accepted')],
  ['captured submission cutoffs are immutable', foundation.includes('Mutable submission cutoff accepted')],
  ['submitter provenance is immutable', foundation.includes('Mutable submitter accepted')],
  ['organization versions cannot be invalidated', foundation.includes('Invalid version accepted')],
  ['entries require an existing organization', foundation.includes('Unknown organization accepted')],
  ['notification read state is duplicate-safe', foundation.includes('Duplicate read state accepted')],
  ['contribution SQL is fictional-only and rollback-scoped', contribution.includes('Fictional-only regression coverage') && contribution.includes('ROLLBACK;')],
  ['contribution status is server-owned', contribution.includes("status', 'Verified'") && contribution.includes("'Awaiting verification'")],
  ['caller reviews are not accepted during contribution', contribution.includes('These caller-controlled fields must be ignored') && contribution.includes("? 'reviews'")],
  ['contribution snapshots the obligation cutoff', contribution.includes("submissionDeadline' ->> 'at'")],
  ['contribution retries are idempotent', contribution.includes('idempotent retry assertion failed')],
  ['cross-member contribution is denied', contribution.includes('cross-member submission was not denied')],
  ['review SQL is fictional-only and rollback-scoped', review.includes('Fictional-only regression coverage') && review.includes('ROLLBACK;')],
  ['review provenance records the independent actor', review.includes("reviews' -> 0 ->> 'actor' <> 'supabase:reviewer'")],
  ['stale review counts are rejected', review.includes('Stale review attempt') && review.includes('stale review was not denied')],
  ['reviewer self-review is denied', review.includes('Self-review attempt') && review.includes('reviewer self-review was not denied')],
  ['owner replacement cannot erase independent verification', review.includes('Owner replacement attempt') && review.includes('owner replacement of independent verification was not denied')],
];

const missing = contracts.filter(([, ok]) => !ok);
if (missing.length) {
  console.error('SUPABASE SQL CONTRACT FAIL');
  for (const [label] of missing) console.error(`- ${label}`);
  process.exit(1);
}

console.log(`SUPABASE SQL CONTRACT PASS: ${contracts.length} private-boundary, provenance, rollback, and review safeguards present.`);
console.log('No SQL was executed; the fictional SQL suites remain rollback-only and D1 remains authoritative.');
