const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const css = [
  fs.readFileSync(path.join(root, 'app', 'globals.css'), 'utf8'),
  fs.readFileSync(path.join(root, 'app', 'workspace-refresh.css'), 'utf8'),
].join('\n');

const contracts = [
  ['a 700px responsive breakpoint', /@media\s*\(\s*max-width\s*:\s*700px\s*\)/],
  ['mobile topbar height and padding', /\.topbar\s*\{[^}]*height:\s*64px;[^}]*padding-inline:\s*12px;/s],
  ['shrinkable mobile heading and panel content', /\.page-heading>div, \.panel-header>div, \.project-strip>div, \.decision-heading>div\s*\{\s*min-width:\s*0;/s],
  ['panel headers can shrink', /\.panel-header\s*\{[^}]*min-width:\s*0;/s],
  ['long project copy wraps', /\.project-strip p\s*\{[^}]*overflow-wrap:\s*anywhere;/s],
  ['long notices wrap', /\.notice p\s*\{[^}]*min-width:\s*0;[^}]*overflow-wrap:\s*anywhere;/s],
  ['mobile page heading stacks the primary action', /\.page-heading>\.primary\s*\{[^}]*width:\s*100%;/s],
  ['tables remain horizontally scrollable', /\.table-wrap\s*\{[^}]*overflow\s*:\s*auto/s],
  ['dialog width is bounded by the viewport', /\.editor\s*\{[^}]*width:\s*min\(650px,\s*calc\(100vw\s*-\s*32px\)\)/s],
  ['mobile forms collapse to one column', /\.form-grid\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\);/s],
  ['mobile reconciliation summary collapses', /\.reconciliation-summary\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\);/s],
  ['mobile account details collapse', /\.account dl, \.detail dl\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\);/s],
  ['mobile governance controls use full width', /\.governance-toolbar \.field\s*\{\s*min-width:\s*100%;/s],
];

const missing = contracts.filter(([, pattern]) => !pattern.test(css));
if (missing.length) {
  console.error('MOBILE CSS CONTRACT FAIL');
  for (const [label] of missing) console.error(`- ${label}`);
  process.exit(1);
}

console.log(`MOBILE CSS CONTRACT PASS: ${contracts.length} responsive safeguards present.`);
console.log('This is a source-level regression guard; owner phone/browser acceptance remains pending.');
