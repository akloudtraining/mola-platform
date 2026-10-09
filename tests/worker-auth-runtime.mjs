import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';

const config = JSON.parse(readFileSync('dist/server/wrangler.json', 'utf8'));
assert.ok(!config.vars?.SUPABASE_URL && !config.vars?.SUPABASE_PUBLISHABLE_KEY, 'Supabase must not be configured in the Cloudflare-native build');
const worker = spawn(process.execPath, [
  'node_modules/wrangler/bin/wrangler.js', 'dev', '--config',
  'dist/server/wrangler.json', '--local', '--ip', '127.0.0.1',
  '--port', '8796', '--inspector-port', '0',
], {env: {
  ...process.env,
  CLOUDFLARE_CF_FETCH_ENABLED:'false',
  WRANGLER_SEND_METRICS:'false',
  WRANGLER_WRITE_LOGS:'false',
  XDG_CONFIG_HOME:'/tmp/mola-wrangler-config',
}});
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
  assert.equal((await response.json()).error, 'Enter a valid email address.');
  console.log('Worker auth runtime PASS: empty login is rejected before any D1 or email-provider operation.');
} finally {
  worker.kill('SIGTERM');
}
