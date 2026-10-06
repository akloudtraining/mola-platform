const fs = require('node:fs');
const path = require('node:path');

const pilot = fs.readFileSync(path.join(path.resolve(__dirname, '..'), 'tests', 'pilot.cjs'), 'utf8');
const scenarioCount = (pilot.match(/\bdone\('/g) || []).length;

const contracts = [
  ['isolated in-memory database', pilot.includes("new DatabaseSync(':memory:')")],
  ['fictional identity harness', /fictional/i.test(pilot) && pilot.includes('identity')],
  ['local test origin only', pilot.includes('https://test.example') && !pilot.includes('collective-investment-workspace.bokobal.chatgpt.site')],
  ['eight numbered scenarios', scenarioCount === 8],
  ['explicit API pass signal', pilot.includes('PILOT API PASS:') && pilot.includes('scenarios.')],
  ['no production-record claim', pilot.includes('No network or production data access') && pilot.includes('no money moved')],
  ['browser and real-member boundary', pilot.includes('Browser/mobile and real-member acceptance are still pending')],
  ['isolated database migrations', pilot.includes("fs.readdirSync(path.join(root,'drizzle'))")],
];

const missing = contracts.filter(([, ok]) => !ok);
if (missing.length) {
  console.error('PILOT ISOLATION CONTRACT FAIL');
  for (const [label] of missing) console.error(`- ${label}`);
  process.exit(1);
}

console.log(`PILOT ISOLATION CONTRACT PASS: ${contracts.length} fictional-run safeguards present.`);
console.log('This is a source-level regression guard; DEV-058 phone acceptance still gates DEV-053 browser/member acceptance.');
