const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const deadlines = read('lib/deadlines.ts');
const schedule = read('lib/schedule.ts');
const workspace = read('lib/workspace-handlers.ts');
const statements = read('lib/statements.ts');
const activity = read('lib/activity.ts');
const contribution = read('app/api/storage/contribution/route.ts');
const weekly = read('app/weekly-cutoff.tsx');
const obligation = read('app/obligation-deadline.tsx');

const contracts = [
  ['valid time-zone validation', deadlines.includes('validTimeZone')],
  ['strict 24-hour cutoff validation', deadlines.includes('/^([01]\\d|2[0-3]):[0-5]\\d$/')],
  ['DST gaps and overlaps rejected', deadlines.includes('This cutoff repeats') && deadlines.includes('does not exist')],
  ['server-owned recording timestamps', workspace.includes('created:new Date().toISOString()')],
  ['obligations require a cutoff', workspace.includes('Choose a cutoff time and time zone.')],
  ['submission captures the selected cutoff', workspace.includes('submissionDeadline=due.deadline')],
  ['stale deadline writes are rejected', workspace.includes('historyCount') && workspace.includes('deadlineAt') && workspace.includes('The cutoff changed')],
  ['deadline edits retain history', workspace.includes('deadlineHistory:[...(due.deadlineHistory||[])')],
  ['weekly previews carry captured cutoffs', schedule.includes('deadline:schedule.deadlineRule?captureDeadline')],
  ['generation tokens bind deadline data', workspace.includes('records.map(e=>[e.id,e.amountMinor,e.deadline||null])')],
  ['submission timing compares server time', deadlines.includes('recorded<=cutoff')],
  ['legacy missing cutoffs stay explicit', deadlines.includes('Cutoff time not captured')],
  ['overdue activity uses the cutoff instant', activity.includes('obligationPastDue(e,today)') && activity.includes('at:e.deadline?.at')],
  ['statements export cutoff fields', statements.includes('Captured cutoff (UTC)') && statements.includes('Submission timing')],
  ['staged contribution path does not bypass timing policy', contribution.includes('submission_obligation_id') && contribution.includes('live ledger still uses D1')],
  ['weekly cutoff UI is explicit', weekly.includes('Future weekly submission cutoff')],
  ['individual cutoff UI is explicit', obligation.includes('Member submission deadline')],
];

const missing = contracts.filter(([, ok]) => !ok);
if (missing.length) {
  console.error('DEADLINE CONTRACT FAIL');
  for (const [label] of missing) console.error(`- ${label}`);
  process.exit(1);
}

console.log(`DEADLINE CONTRACT PASS: ${contracts.length} timestamp, cutoff, DST, history, and export safeguards present.`);
console.log('This is a source-level regression guard; DEV-063 still requires owner browser/mobile acceptance before it can be marked Done.');
