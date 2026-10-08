const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const auth = read('lib/cloudflare-auth.ts');
const actions = read('lib/auth-actions.ts');
const route = read('app/api/auth/route.ts');
const catchAll = read('app/api/auth/[...all]/route.ts');
const workspace = read('lib/workspace-handlers.ts');
const config = read('vite.config.ts');
const schema = read('db/schema.ts');
const contracts = [
  ['Better Auth stores identities in Cloudflare D1 through Drizzle', auth.includes("drizzle-orm/d1") && auth.includes("drizzleAdapter")],
  ['email/password requires verified email before sign-in', auth.includes('requireEmailVerification:true') && auth.includes('sendOnSignUp:true')],
  ['sessions use secure HttpOnly same-site cookies', auth.includes('useSecureCookies:true') && auth.includes("sameSite:'lax'") && auth.includes('httpOnly:true')],
  ['password resets revoke other active sessions', auth.includes('revokeSessionsOnPasswordReset:true')],
  ['transactional emails use Cloudflare Email binding', auth.includes('emailBinding.send') && config.includes('send_email: [{ name: "EMAIL" }]')],
  ['sign-up is allowlisted to owner/member emails', actions.includes('isEligibleSignup') && actions.includes('access.enabled')],
  ['authentication mutations require same-origin requests', actions.includes('function sameOrigin') && actions.includes('Invalid request origin.')],
  ['reset links redeem a one-use Better Auth token', actions.includes("runAuthEndpoint(req,'reset-password'") && actions.includes('token})')],
  ['email-account recovery remains non-enumerating', actions.includes('If an account matches, check the email for reset instructions.')],
  ['native verification and recovery callbacks are routed', catchAll.includes('createCloudflareAuth(req).handler(req)')],
  ['auth JSON is not cached', route.includes("Cache-Control':'no-store'")],
  ['only verified email sessions enter workspace', read('lib/workspace-identity.ts').includes('user?.emailVerified?user:null')],
  ['legacy identities can be linked by verified email with audit trail', workspace.includes('Verified email linked this account') && workspace.includes('auth_identity_links')],
  ['identity links are durably stored in D1', schema.includes("sqliteTable('auth_identity_links'")],
  ['D1 data and ledger remain additive', schema.includes("sqliteTable('organizations'") && schema.includes("sqliteTable('entries'")],
];
const missing = contracts.filter(([, ok]) => !ok);
if (missing.length) { console.error('CLOUDFLARE AUTH CONTRACT FAIL'); for (const [label] of missing) console.error('- ' + label); process.exit(1); }
console.log(`CLOUDFLARE AUTH CONTRACT PASS: ${contracts.length} native-auth and migration safeguards present.`);
console.log('This is a source-level guard. Real mail delivery and owner/member acceptance still require Cloudflare bindings and account testing.');
