import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const config = JSON.parse(readFileSync('dist/server/wrangler.json', 'utf8'));
// Test the artifact Wrangler actually deploys, not just source text.
for (const name of ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'MOLA_OWNER_EMAIL']) {
  if (process.env[name]) {
    // Never include configuration values in assertion output.
    assert.ok(config.vars?.[name] === process.env[name], `${name} was lost during the production build`);
  }
}
assert.equal(config.keep_vars, true, 'Dashboard variables must survive Wrangler deployments');
assert.ok(config.d1_databases?.some(binding => binding.binding === 'DB'), 'D1 binding must remain intact');
assert.equal(config.r2_buckets?.length ?? 0, 0, 'Deployment must not require R2');
console.log('Deployment config PASS: supplied auth variables retained, dashboard variables preserved, D1 retained, no R2.');
