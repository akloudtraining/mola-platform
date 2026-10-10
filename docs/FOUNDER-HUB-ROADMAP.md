# Mola founder experience — implementation checklist

Production source: akloudtraining/mola-platform, main. Hosting: existing Cloudflare deployment. Preserve Better Auth, D1, private receipts and existing payment/reviewer controls.

## This release
- [x] Review production source and existing workflows.
- [x] Reorganize navigation around Founder Hub, contributions, savings, founders, opportunities and company knowledge.
- [x] Create a responsive forest-green/gold design with accessible labels and honest empty states.
- [x] Show verified capital, pending/provisional records, reported spending and personal obligations separately.
- [x] Persist shared savings targets with owner-only edits and change history.
- [x] Add a five-year scenario calculator; forecasts never generate dues or change agreed rates.
- [x] Record dated, human-checked bank-balance checkpoints separately from contribution totals.
- [x] Persist opportunities with sources, capital estimates, risks, next steps and stage history.
- [x] Enforce author/owner editing and owner-only review-stage changes. Opportunity approval never authorizes spending.
- [x] Add permission-scoped Ask Mola with deterministic financial answers and source references.
- [x] Provide optional server-side LLM integration; disclose when it is unconfigured. Do not save conversations or expose receipts, credentials, sign-in emails or raw banking identifiers to the model.
- [x] Run TypeScript, production build and existing behavioral regressions; add meaningful validation/privacy/concurrency coverage.
- [x] Update Buildroom roadmap without claiming browser acceptance or deployment before evidence exists.

## Follow-on work
- [ ] Record custody-to-company-account transfers without crediting members twice; reconcile opening balance with evidence.
- [ ] Founder-adopted opportunity search mandate: geography, sectors, budget, debt limits and operator involvement.
- [ ] Internet research agent with dated listings and attributable sources, review queue, no automatic investment decisions.
- [ ] Saved private conversations and deliberate sharing, with account-scoped storage and deletion.
- [ ] Activate ownership/voting rules only after the valuation and voting policies are formally adopted.

## Acceptance
Eight founders' existing logins and payment flows stay operational. Financial values retain currency and basis. A pending contribution never advances verified savings. A forecast is a scenario, not a commitment. Shared founder financial status excludes private receipts and account access details. Bank checkpoints are historical human reports, not a live feed. AI has no write tools or spending powers.

## Validation limits
TypeScript, production build and behavioral/component checks are used. Browser visual acceptance remains pending because supported browser control is unavailable in this session. Optional AI responses are tested with a mocked provider; no live AI credential has been configured. No production financial records are created by this work.

## Optional AI setup
On the existing Cloudflare Worker, configure `OPENAI_API_KEY` as a secret and `MOLA_AI_MODEL` as the chosen enabled model ID. No key is stored in source or the browser. Until configured, Ask Mola remains in record-answer mode. Broad AI explanations require an explicit per-session opt-in; financial questions retain deterministic record calculations. Provider request uses `store: false`, bounded output and a 30-second per-user cooldown within each Worker isolate. Provider-level spend limits should also be configured before enabling; the isolate cooldown is not a durable global quota.

## Interface cleanup — October 10, 2026
- [x] Restrict the general contribution action to Contributions; retain obligation-specific reporting inside record details.
- [x] Remove duplicate payment panels, creation buttons, stage filters, founder financial tables and repeated account/profile text.
- [x] Replace duplicated setup forms with shortcuts to their canonical pages.
- [x] Move owner diagnostics and ledger backups into Workspace setup.
- [x] Remove obsolete pilot, private-Site-sharing and external sign-in-provider claims.
- [x] Remove unused preferences that did not control app behavior.
- [x] Delete the old Collective / Mola ChatGPT Site and verify Buildroom remains active.
- [x] Remove legacy Site hosting metadata, build plugin and ChatGPT sign-in helper; retain deployed Cloudflare binding identities.
- [x] Validate the cleanup with TypeScript, the production build and 47 behavioral suites.
- [ ] Review the deployed interface in an authenticated desktop and phone browser.

## Floating assistant and detailed scenarios — October 10, 2026
- [x] Move Ask Mola out of sidebar navigation and the hub into a lower-right nonmodal chat panel.
- [x] Keep session conversation state across closing and page navigation; reset and abort pending answers when account/organization changes.
- [x] Add quick search for permitted pages, record titles, founder names and savings goals; exclude private receipt, sign-in and bank-reference fields.
- [x] Interpret navigation and search commands locally; link answers back to source pages and records.
- [x] Add start dates, years plus extra months, 3/5/6-year presets and a 10-year upper limit.
- [x] Count exact weekly payment dates and show partial calendar years, weekly rates, monthly averages, yearly contributions and projected capital.
- [x] Offer January 1 or anniversary increases, collection assumptions and prorated spending.
- [x] Show exact monthly totals/payment dates and separate verified actuals for the group and current founders.
- [x] Validate TypeScript, the production build and all 51 behavioral suites, including calendar math, calculator inputs, assistant search and chat handlers.
- [ ] Review the floating panel and detailed calculator in an authenticated desktop and phone browser.
