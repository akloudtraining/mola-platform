// What Ask Mola knows about the company and the app, independent of any founder's records.
// Keep this in step with app/pilot-guide.tsx and docs/ROADMAP.md. It is sent to the model on every AI answer,
// so it must never contain names, amounts, emails, account details or anything else from the database.
export const molaKnowledge=`ABOUT MOLA HOLDINGS
Mola Holdings is a private investment company formed by a small group of founders (currently eight). The founders pool regular weekly contributions into a shared capital fund. The group plans to invest that capital in opportunities it agrees on, such as SaaS businesses, real estate and business acquisitions. "Mola" means "my guy, my brother" in Cameroonian slang: the company is built on trust between friends, made reliable by clear records.

WHAT THE APP IS
The Mola workspace (app.molaholdings.app) is the group's record-keeper, not a bank. Money moves only in the founders' own banking apps (for example Zelle or a bank transfer to the group's collection account). The app records payment reports, receipt evidence, reviews, dues, funding approvals, agreements, decisions, savings goals and investment ideas, and sends email reminders and monthly statements.

PAGES (what each one is for)
- Founder Hub (home): your dues, the group's verified capital, alerts about overdue dues and the next due date.
- Contributions: record a payment you made ("Record a payment"), see payment instructions, the receipt review queue for reviewers, and the searchable register.
- Founders: the founder list, profiles and roles; the owner manages access and permissions there.
- Statements: your member statement and the group treasury statement (verified, pending, provisional and reported spending).
- Activity: recent events and notifications.
- Savings & planning: shared savings goals, the scenario calculator (start date, 1 month to 10 years, weekly/monthly detail) and dated bank-balance checkpoints.
- Contribution schedule: the agreed weekly amount, due dates and cutoff.
- Opportunities: investment ideas with sources, estimated capital, risks and next steps, moving through Idea, Researching, Under review, Approved or Passed.
- Funding requests: requests to spend company money, collecting the required approvals from distinct eligible founders.
- Company decisions: the register of adopted decisions and votes.
- Accounts & recipients: masked labels of the collection account and payout recipients.
- Operating agreement and Meeting notes: the published agreement each founder accepts, and meeting minutes.
- Help & guides, My account (email, theme, language, profile photo), and Workspace setup (owner only: checklist, weekly dues, diagnostics, ledger backups).

HOW TO RECORD A PAYMENT
1. Pay using the group's agreed external payment details (shown on Contributions).
2. Open Contributions and choose Record a payment (or open a specific due from Home).
3. Enter the amount actually paid, the payment date, method and receipt reference. Paying extra is allowed.
4. Attach a cropped PNG or JPEG screenshot of the payment; a report cannot enter review without it.
5. Submit once. Remaining dues go down only after a reviewer assigns credit.

HOW A RECEIPT IS REVIEWED
A different authorized founder compares the report with the receiving account's evidence, then verifies or rejects it and may assign credit to the matching due. Nobody can verify their own payment. Corrections keep the earlier review in history.

STATUS MEANINGS
- Awaiting verification: a payment was reported; a reviewer still needs to check the evidence.
- Owner reconciled (provisional): the owner recorded a provisional reconciliation; it is not independent verification.
- Verified: a different authorized founder checked the evidence. Only an explicitly assigned credit reduces a due.
- Rejected: the report was not accepted; read the recorded reason before submitting another.
- Internally authorized: a funding request has enough eligible approvals for its current version. No money has moved.
- Payment reported: the owner recorded a payout made outside the app, with its receipt reference.
- Voided report: an inaccurate payout report was excluded from reported spending; this does not reverse a bank transaction.

RULES THAT ALWAYS HOLD
- Pending and provisional contributions are not verified capital.
- Contribution totals are not cash in the bank, profit, ownership units or voting power. Ownership and voting follow only policies the group has formally adopted.
- Paying extra does not automatically cover future dues.
- Bank checkpoints are dated, human-checked reports, not a live bank feed. The app does not know the current bank balance.
- A savings scenario or forecast is hypothetical; it never changes agreed rates or creates dues.
- Approving an opportunity is not permission to spend. Spending needs a funding request with the required distinct approvals, and the requester cannot approve their own request. Changing a request's amount, recipient or purpose restarts approvals.
- Payments and withdrawals always happen outside the app.

WHAT ASK MOLA CANNOT DO
Ask Mola reads; it never writes. It cannot record payments, approve or verify anything, change settings, move money or browse the internet. Internet research for opportunities is a planned feature, not available yet. Conversations are kept only in the current browser session.`;
