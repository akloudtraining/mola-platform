const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const session = read('lib/supabase-session.ts');
const authRoute = read('app/api/auth/route.ts');
const authPage = read('app/auth/page.tsx');
const workspace = read('lib/workspace-handlers.ts');

const contracts = [
  ['publishable Supabase key only', session.includes('SUPABASE_PUBLISHABLE_KEY') && !session.includes('SERVICE_ROLE')],
  ['HttpOnly secure same-site cookies', /HttpOnly; Secure; SameSite=Lax/.test(session)],
  ['separate access and refresh cookies', session.includes("ACCESS_COOKIE='mola_access_token'") && session.includes("REFRESH_COOKIE='mola_refresh_token'")],
  ['same-origin mutation guard', session.includes('function sameOrigin') && session.includes("Invalid request origin.")],
  ['signup validation and Supabase call', session.includes("action==='signup'") && session.includes("authFetch('signup'")],
  ['password login flow', session.includes("action==='login'") && session.includes('token?grant_type=password')],
  ['server-side refresh flow', session.includes("action==='refresh'") && session.includes('grant_type=refresh_token')],
  ['logout revokes session and clears cookies', session.includes("authFetch('logout'") && session.includes('clearAuthCookies(response)')],
  ['non-enumerating recovery response', session.includes('If an account matches, check the email for reset instructions.')],
  ['recovery link password reset', session.includes("action==='update_password'") && session.includes('Authorization:`Bearer ${accessToken}`')],
  ['reset clears cookies after success or failure', session.match(/if\(!result\?\.ok\).*?clearAuthCookies\(response\)/s) && session.includes("Password updated. Sign in again.")],
  ['auth endpoint is dynamic and uncached', authRoute.includes("export const dynamic='force-dynamic'") && authRoute.includes("Cache-Control':'no-store'")],
  ['login, signup, recovery and reset UI states', ['Welcome back','Create your member account','Recover your account','Choose a new password'].every(text => authPage.includes(text))],
  ['workspace requires an authenticated user', workspace.includes("if(!user)return fail('Sign in to open your workspace.',401)")],
  ['fresh Supabase initialization requires the configured owner', workspace.includes('MOLA_OWNER_EMAIL') && workspace.includes('normalizeEmail(user.email)!==configured')],
  ['clean start creates both template organizations', workspace.includes('templates.map') && workspace.includes("INSERT OR IGNORE INTO organizations")],
  ['member claims use normalized sign-in email', workspace.includes('normalizeEmail(user.email)') && workspace.includes('access.email===normalizeEmail(user.email)')],
  ['duplicate member claims are rejected', workspace.includes('already linked to another member')],
  ['unmatched members are denied by the server', workspace.includes('no active membership')],
];

const missing = contracts.filter(([, ok]) => !ok);
if (missing.length) {
  console.error('AUTH SIGN-IN CONTRACT FAIL');
  for (const [label] of missing) console.error(`- ${label}`);
  process.exit(1);
}

console.log(`AUTH SIGN-IN CONTRACT PASS: ${contracts.length} authentication and membership safeguards present.`);
console.log('This is a source-level regression guard; provider configuration and owner browser/mobile acceptance remain pending.');
