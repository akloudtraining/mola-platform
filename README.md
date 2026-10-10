# Mola Holdings

Founder workspace at https://app.molaholdings.app, built from `akloudtraining/mola-platform` on `main`.

## Production workflow

Push reviewed changes to GitHub. Source checks run TypeScript and the behavioral suites. The connected Cloudflare Workers build deploys the `mola-platform` service using:

```sh
npm run build
npx wrangler deploy --config dist/server/wrangler.json
```

The app uses Vinext/React, Better Auth with verified-email member linking, Resend email, Cloudflare D1 for company records, and private R2 receipt storage. Payment execution remains in the founders' banking apps.

The existing D1 resource identifier, database name, R2 bucket and binding names in `vite.config.ts` are preserved. Do not rename or recreate those resources as part of interface changes. `keep_vars: true` preserves dashboard variables during deployments; configure secrets in Cloudflare, never in committed files.

Authentication requires `MOLA_AUTH_SECRET`, `MOLA_APP_URL`, `MOLA_OWNER_EMAIL`, `MOLA_EMAIL_FROM` and the configured email provider credentials (`RESEND_API_KEY` for Resend). Optional Ask Mola integration uses `OPENAI_API_KEY` and `MOLA_AI_MODEL`; without them company-record answers still work. See `docs/FOUNDER-HUB-ROADMAP.md` for scope and validation limits.

## Local development and verification

Use Node 24 and the pinned pnpm version in `package.json`:

```sh
pnpm install --frozen-lockfile
pnpm exec tsc --noEmit --incremental false
node scripts/check-pilot.mjs
npm run build
npm run dev
```

Local development uses local Cloudflare storage. Preview/runtime helper scripts only configure the local execution environment; they do not publish a ChatGPT Site or supply a production identity. HTTP preview authentication is an explicit development-only option. Keep environment files, local databases and receipt bytes out of Git.

## Interface ownership

- Founder Hub: compact company and personal summaries, with links to the relevant registers.
- Contributions: the single general contribution-report action, payment instructions, authorized receipt review and the searchable register.
- Founders: account permissions and recorded obligations. Payment reporting for a specific obligation is available inside its details.
- Contribution schedule: effective-dated dues configuration and generation.
- Savings & planning: targets, scenarios and dated bank checkpoints.
- Opportunities: shared ideas and review stages. Ask Mola: permission-scoped record answers.
- Company decisions, Funding requests, Agreements & notes: their respective records and actions.
- Workspace setup: owner checklist, links to canonical settings, diagnostics and ledger backups.

## Legacy retirement

The former Collective / Mola ChatGPT Site was deleted on October 10, 2026. Its hosting metadata, build plugin and unused ChatGPT sign-in helper were removed from this repository. GitHub history retains the source history. Existing migration tools and identity links remain where needed to preserve historical records and account linking.

Buildroom remains at https://mola-buildroom.bokobal.chatgpt.site until its separate migration. This production repository does not publish Buildroom. The GitHub → Cloudflare workflow is the sole production path for the Mola founder app.
