import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';

// Build first with dummy values; this test must never contact a real provider.
const config = JSON.parse(readFileSync('dist/server/wrangler.json', 'utf8'));
assert.ok(config.vars?.SUPABASE_URL === 'https://mola-config-test.invalid', 'Build with the auth test fixture before running this check');
const worker = spawn(process.execPath, [
  'node_modules/wrangler/bin/wrangler.js', 'dev', '--config',
  'dist/server/wrangler.json', '--local', '--ip', '127.0.0.1',
  '--port', '8796', '--inspector-port', '0',
], {env: {...process.env, CLOUDFLARE_CF_FETCH_ENABLED:'false', WRANGLER_SEND_METRICS:'false'}});
// Suppress Wrangler's binding value output, even for the dummy fixture.
worker.stdout.resume();
worker.stderr.resume();
try {
  let response;
  for (let attempt = 0; attempt < 40; attempt++) {
    if (worker.exitCode !== null) throw new Error('Local Worker stopped before the auth check');
    try {
      response = await fetch('http://127.0.0.1:8796/api/auth', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:'login'}), signal:AbortSignal.timeout(2000),
      });
      break;
    } catch {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  assert.ok(response, 'Local Worker did not start');
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, 'Enter your email and password.');
  console.log('Worker auth runtime PASS: configuration detected; empty login reaches credential validation instead of the missing-config error.');
} finally {
  worker.kill('SIGTERM');
}
