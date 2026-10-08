# Mola Cloudflare pilot setup

Mola uses Cloudflare for the site and its backend: Workers serves the app and auth routes, D1 stores workspace configuration and records, R2 holds private receipts, and Cloudflare Email Service sends verification and password-reset email. Supabase is not required at runtime.

## What carries forward

The implementation includes the Mola setup flow, eight founder slots, flexible weekly contribution minimums, dues schedules and cutoffs, per-member standing, contribution evidence and review, private receipts, collection instructions, membership agreements, approval policies, funding requests, activity history, exports, and an isolated test workspace.

Organization setup is stored in each D1 `organizations.data` record. On an empty D1 database, the verified configured owner initializes the built-in workspaces; the Mola template creates eight founder slots and the weekly-minimum behavior defaults to $100 per member. The owner can change the minimum in setup, and the group expectation recalculates from the member count and current rate. Financial records and screenshots created only for testing can be left behind; the owner can complete organization-specific setup in the pilot flow.

## Cloudflare resources and settings

- D1 binding `DB` points to `site-creator-d1`; migration files are in `drizzle/`.
- Private R2 bucket `mola-receipts` is bound as `BUCKET`. Keep receipt objects private; do not enable public bucket access.
- Cloudflare Email Service is bound as `EMAIL`. Set `MOLA_EMAIL_FROM` to a sender on an onboarded domain.
- Set `MOLA_AUTH_SECRET` as a Cloudflare secret with a new random value of at least 32 characters. Do not put it in Git or a public build variable.
- Set `MOLA_OWNER_EMAIL` to the configured founder/owner email.
- Set `MOLA_APP_URL` to the exact production origin after the domain is chosen.
- Keep `keep_vars` enabled so runtime configuration survives deployments.

The resource bindings are represented in `vite.config.ts` and `.openai/hosting.json`. Runtime secrets and production account settings must be configured in Cloudflare; they are not stored in this repository.

## Safe preview and verification

1. Confirm the Cloudflare D1 binding and database ID in the preview Worker configuration.
2. Apply pending D1 migrations to the preview database only; first inspect the migration list so the existing foundation is not applied twice.
3. Create/bind the private R2 bucket and configure the email sender, auth secret, owner email, and preview origin.
4. Sign up as the configured owner, verify email, sign in, and initialize Mola. Check that eight founder slots appear and that weekly minimum and group expectation can be changed.
5. Create a disposable test workspace. Exercise founder access, contributions, independent review, receipt upload/view, approval rules, agreement flow, schedule/cutoffs, exports, and activity. Delete the test workspace and confirm its R2 receipt objects are removed.
6. Verify a normal reload preserves organization setup and the regular workspace does not contain test records.
7. Only after preview acceptance should the same reviewed configuration and pending migrations be applied to production.

## Current branch limits

The local feature branch contains Cloudflare-native auth and D1 migrations, and local build, type, lint, and pilot suites have passed. It has not been pushed or deployed, and no Cloudflare remote resource, secret, or database has been changed in this work. The connected Supabase project is outside this local cutover and should remain untouched until the Cloudflare preview is accepted and the group separately decides whether to retain or close it.
