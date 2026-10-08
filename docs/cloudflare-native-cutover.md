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

1. Confirm the Cloudflare D1 binding and database ID in the Worker configuration.
2. Check the remote migration list before applying anything. The current account D1 has all checked-in migrations applied.
3. Enable R2, create/bind the private receipt bucket, and configure the email sender, auth secret, owner email, and production origin.
4. Sign up as the configured owner, verify email, sign in, and initialize Mola. Check that eight founder slots appear and that weekly minimum and group expectation can be changed.
5. Create a disposable test workspace. Exercise founder access, contributions, independent review, receipt upload/view, approval rules, agreement flow, schedule/cutoffs, exports, and activity. Delete the test workspace and confirm its R2 receipt objects are removed.
6. Verify a normal reload preserves organization setup and the regular workspace does not contain test records.
7. Only after preview acceptance should the reviewed Worker configuration be deployed to production.

## Cutover status

The Cloudflare-native implementation is on the GitHub branch `feat/cloudflare-native-backend` (latest migration-fix commit `c99f25254c831f9399f46ea0916eafb41c33865f`). The production build, deployment-config contract, and Cloudflare auth-action tests pass. The generated Wrangler config now omits the removed `legacy_env` field and resolves D1 migrations from the generated config directory.

The D1 database in the user's Cloudflare account has all six migrations applied. The Better Auth `user`, `account`, `session`, `verification`, and `auth_identity_links` tables are present. Two live organization records and the installation-owner record were copied into that database; the original private Site database was left unchanged. Test-workspace data was not copied because it contains ephemeral sessions and incomplete test records.

The updated source was also pushed to the private Site source repository and saved as version 78, but that version is not deployed. The Cloudflare account has no R2 service enabled yet, so the required private receipt bucket cannot be created. The Cloudflare Email sender is not configured, and no production Worker has been deployed with `MOLA_AUTH_SECRET`, `MOLA_APP_URL`, or `MOLA_EMAIL_FROM`.

The user's Cloudflare dashboard currently has `MOLA_OWNER_EMAIL` as its only configured variable. The private Site's runtime settings are separate and still report the old Supabase keys; do not remove those from the active Site until that Site is retired or its replacement is deployed and verified. The connected Supabase project and the original Site D1 remain available as rollback sources.
