# GitHub source migration

Imported from the Mola Sites project on 2026-10-06.

This is an initial source snapshot. Earlier commits remain preserved in the original Sites repository; they are not yet imported into this GitHub branch history.

The live application and its databases remain on Sites. Pushing here does not deploy the live application. Database records, uploaded receipts, identity documents and runtime secrets are not included.

## Local checks

Use Node.js 24 and pnpm 11.25.0. Run `pnpm install --frozen-lockfile`, then `pnpm exec tsc --noEmit --incremental false`.

Run `node scripts/check-pilot.mjs` for the pilot behavioral suites.

GitHub Actions runs these checks on pushes and pull requests. It does not deploy or access production data.
