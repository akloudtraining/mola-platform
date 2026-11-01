# Mola Holdings — roadmap and working agreement

Updated November 1, 2026. This file supersedes the checklists in `FOUNDER-HUB-ROADMAP.md` as the
place to track what comes next. That file remains the record of what shipped up to October 16.

## What Mola Holdings is

A private founder workspace (https://app.molaholdings.app) for eight founders who pool weekly
contributions into a shared capital fund and later invest it (SaaS, real estate, business
acquisitions). The app is a **record-keeper**, not a bank: payments happen in the founders' own
banking apps, and Mola records reports, receipt evidence, reviews, approvals, agreements and
decisions. Core rules that every feature must keep:

- A pending or owner-reconciled contribution never counts as verified capital.
- A different authorized founder verifies a receipt; nobody verifies their own payment.
- Forecasts are scenarios, never commitments; they never create dues or change agreed rates.
- Funding approval is an internal authorization only; no money moves through the app.
- Private receipts, sign-in emails and bank identifiers never leave their permission scope.
- AI has no write tools and no spending powers.

## Where things stand (audit, November 1)

| Area | State |
|---|---|
| Stack | Vinext (Next-style React on Vite) → one Cloudflare Worker; D1 (`DB`), R2 receipts (`BUCKET`), Email (`EMAIL`), hourly cron |
| Deploy | Cloudflare Workers Builds deploys **every push to `main`** to production. There is no staging step. |
| TypeScript | Passes |
| Behavioral suites | 48/54 pass on Node 24. Six UI suites are stale: they look for a "Refresh workspace" button and other markup that later UI commits removed. CI on `main` has been red since Oct 14 because of this. |
| Node | Project needs Node 24 (`node:sqlite`); this Mac's default is Node 23.2, where 22 suites fail to start |
| Ask Mola | Floating panel with record search, navigation and 7 regex-routed record answers. The optional AI path targeted OpenAI and was never configured, so in production it could only answer canned questions. |
| Browser acceptance | Never done for the floating assistant or calculator (Codex had no browser) |

## Chunks

Each chunk is a branch → local checks → PR → CI green → merge (which deploys). Chunks are sized
to land independently.

### Chunk 0 — Green baseline and local toolchain
- Pin Node 24 (`.nvmrc`), add `npm test` that runs TypeScript + all suites.
- Repair the six stale UI suites against the current markup without weakening what they check.
- Goal: CI green on `main` again, so a red build means a real regression.

### Chunk 1 — Ask Mola, real assistant (this branch: `ask-mola-ai`)
- Open-weight models on Cloudflare Workers AI through the `AI` binding: no API key, and founders'
  data never leaves the Cloudflare account that already holds it. Model is chosen server-side from
  an allow-list (`MOLA_AI_MODEL`), with an automatic fallback model.
- A Mola Holdings knowledge base (what the company is, how each page works, what each status
  means, the rules above) plus the caller's permission-scoped facts.
- Multi-turn conversation held in the browser session only (never saved server-side).
- Financial numbers always come from the deterministic record calculation, shown with the AI answer.
- AI can suggest pages to open; suggestions are validated against pages the caller may see.
- Privacy: explicit fact construction (no raw records), redaction of emails and long digit runs in
  questions, no logging of question text, prompt-injection framing for founder-written text.
- Local mock provider (`MOLA_AI_PROVIDER=mock`) so the whole flow is testable offline; optional
  real-model local testing with `wrangler login`.

### Chunk 2 — Ask Mola quotas, owner controls and usage
- Durable per-founder daily quota in D1 (the per-isolate limiter is not global).
- Owner setting in Workspace setup: AI on/off and model choice from the allow-list.
- Owner-visible usage counts (no question text).

### Chunk 3 — Saved private conversations
- Account-scoped storage in D1, list/rename/delete, deliberate share with a founder.

### Chunk 4 — Opportunity search mandate
- Founder-adopted criteria: geography, sectors, budget, debt limits, operator involvement.
- Ask Mola can check an opportunity against the adopted mandate.

### Chunk 5 — Internet research agent
- Dated listings with attributable sources into a review queue; never an automatic decision.

### Chunk 6 — Custody transfers and opening balance
- Record custody-to-company-account transfers without double-crediting members; reconcile the
  opening balance with evidence.

### Chunk 7 — Ownership and voting rules
- Only after valuation and voting policies are formally adopted.

### Chunk 8 — Browser acceptance pass
- Authenticated desktop and phone walkthrough of every page against a local seeded workspace,
  then on production with the owner present.

### Related: Mola voice (`~/mola`)
The separate Mola voice assistant (Workers AI Whisper + Aura) could later give Ask Mola a voice
mode. Not scheduled.

## Release process (every chunk)

1. Branch from `main`. Never commit to `main` directly: it deploys.
2. Local checks, all must pass: `npm test` (TypeScript + behavioral suites, Node 24) and `npm run build`.
3. Local run: `npm run dev` → http://localhost:5173, sign in as the local test owner from `.dev.vars`,
   walk the changed feature on desktop and phone widths.
4. Open a PR; CI must be green.
5. Production config changes (bindings, variables, secrets, D1 migrations) are listed in the PR and
   applied before or with the merge.
6. Merge → Cloudflare deploys → smoke-test production.
