import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const config = JSON.parse(readFileSync('dist/server/wrangler.json', 'utf8'));
// Test the artifact Wrangler actually deploys, not just source text.
for (const name of ['MOLA_OWNER_EMAIL']) {
  if (process.env[name]) {
    // Never include configuration values in assertion output.
    assert.ok(config.vars?.[name] === process.env[name], `${name} was lost during the production build`);
  }
}
assert.equal(config.keep_vars, true, 'Dashboard variables must survive Wrangler deployments');
assert.equal(config.name, 'mola-platform', 'The deployed Worker must use the Mola service name');
assert.equal(config.legacy_env, undefined, 'Generated config must not contain Wrangler’s removed legacy_env field');
assert.ok(config.d1_databases?.some(binding => binding.binding === 'DB'), 'D1 binding must remain intact');
assert.ok(config.r2_buckets?.some(binding => binding.binding === 'BUCKET'), 'Private receipts require the Mola R2 bucket binding');
assert.equal(config.d1_databases?.find(binding => binding.binding === 'DB')?.migrations_dir, '../../drizzle', 'D1 migrations must resolve from the generated Wrangler config to the checked-in Drizzle files');
assert.ok(config.send_email?.some(binding => binding.name === 'EMAIL'), 'Email verification and password recovery require Cloudflare Email Service');
console.log('Deployment config PASS: owner setting retained, dashboard variables preserved, D1, R2 and email bindings configured.');
