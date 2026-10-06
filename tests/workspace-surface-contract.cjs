const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, 'app', file), 'utf8');
const page = read('page.tsx');
const funding = read('funding-requests.tsx');
const policy = read('approval-policy.tsx');
const weekly = read('weekly-dues.tsx');
const cutoff = read('weekly-cutoff.tsx');
const deadline = read('obligation-deadline.tsx');

const sections = [
  ['Overview', "['overview','Overview'"],
  ['Contributions', "['contributions','Contributions'"],
  ['Activity', "['activity','Activity'"],
  ['Members', "['members','Members'"],
  ['Statements', "['statements','Statements'"],
  ['Projects', "['projects','Projects'"],
  ['Funding requests', "['requests','Funding requests'"],
  ['Governance', "['governance','Governance'"],
  ['Accounts & recipients', "['accounts','Accounts & recipients'"],
  ['Agreements & notes', "['agreements','Agreements & notes'"],
];

const flows = [
  ['member-access form', "form.action==='memberAccess'"],
  ['weekly-minimum form', "form.action==='weeklyMinimum'"],
  ['review form', "form.action==='review'"],
  ['governance decision form', "form.action==='decision'"],
  ['account/agreement form', "form.action==='settings'"],
  ['member-name form', "form.action==='member'"],
  ['contribution form', "form.action==='contribution'"],
  ['obligation/deadline form', "form.action==='obligation'"],
  ['meeting-note form', "form.action==='note'"],
];

const contracts = [
  ...sections.map(([label, marker]) => [`${label} navigation surface`, page.includes(marker)]),
  ...flows.map(([label, marker]) => [label, page.includes(marker)]),
  ['funding-request surface', page.includes('<FundingRequests') && funding.includes('<ApprovalPolicyPanel')],
  ['funding-approval policy surface', policy.includes('Funding approval rule')],
  ['weekly deadline controls', weekly.includes('<WeeklyCutoff') && cutoff.includes('Future weekly submission cutoff')],
  ['individual deadline controls', page.includes('<DeadlineFields') && deadline.includes('Member submission deadline')],
  ['shared cancel action', page.includes('className="form-actions"') && page.includes('>Cancel</button>')],
  ['owner auth redirect', page.includes("if(r.status===401){window.location.href='/auth?return_to=%2F';return;}")],
];

const missing = contracts.filter(([, ok]) => !ok);
if (missing.length) {
  console.error('WORKSPACE SURFACE CONTRACT FAIL');
  for (const [label] of missing) console.error(`- ${label}`);
  process.exit(1);
}

console.log(`WORKSPACE SURFACE CONTRACT PASS: ${sections.length} sections, ${flows.length} form flows, and ${contracts.length - sections.length - flows.length} boundary checks present.`);
console.log('This is a source-level regression guard; human phone/browser acceptance remains pending.');
