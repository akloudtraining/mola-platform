const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const css = [
  fs.readFileSync(path.join(root, 'app', 'globals.css'), 'utf8'),
  fs.readFileSync(path.join(root, 'app', 'workspace-refresh.css'), 'utf8'),
  fs.readFileSync(path.join(root, 'app', 'founder-experience.css'), 'utf8'),
  fs.readFileSync(path.join(root, 'app', 'mola-mobile.css'), 'utf8'),
].join('\n');
const sidebar = fs.readFileSync(path.join(root, 'components', 'ui', 'sidebar.tsx'), 'utf8');

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
  ['assistant composer text remains visibly rendered', /\.assistant-composer textarea\s*\{[^}]*color:\s*#23382e;[^}]*-webkit-text-fill-color:\s*#23382e;/s],
  ['assistant composer controls have touch-sized targets', /\.assistant-mode button[^\{]*\{[^}]*min-height:\s*44px;/s],
  ['mobile founder hero descendants can shrink', /\.capital-hero-copy[^\{]*\{[^}]*min-width:\s*0;[^}]*max-width:\s*100%/s],
  ['mobile founder hero action fits the viewport', /\.hero-actions>button[^\{]*\{[^}]*width:\s*100%;[^}]*max-width:\s*100%;/s],
  ['mobile organization selector ellipsizes', /\.top-left>\.choice \[data-slot="select-value"\][^\{]*\{[^}]*text-overflow:\s*ellipsis;/s],
  ['mobile shell uses a sticky compact header', /\.topbar\{[^}]*position:\s*sticky;[^}]*height:\s*60px;/s],
  ['mobile navigation has touch-sized active items', /\[data-sidebar="sidebar"\]\[data-mobile="true"\][^\{]*\.nav-button\{[^}]*min-height:\s*50px/s],
  ['mobile assistant has a visible send action', /\.assistant-send-label\{display:\s*inline\}/s],
  ['mobile assistant composer is keyboard-safe', /\.assistant-composer\{[^}]*position:\s*sticky;[^}]*env\(safe-area-inset-bottom\)/s],
  ['assistant dialog resets centered desktop transform', /\.mola-assistant\[data-slot="dialog-content"\]\{[^}]*right:\s*24px;[^}]*bottom:\s*calc\(84px[^}]*--tw-translate-x:\s*0px!important;[^}]*--tw-translate-y:\s*0px!important/s],
  ['mobile nav closes after a destination is selected', /if\s*\(isMobile[^)]*\)\s*setOpenMobile\(false\)/],
];

const missing = contracts.filter(([, pattern]) => !pattern.test(pattern.source.includes('isMobile') ? sidebar : css));
if (missing.length) {
  console.error('MOBILE CSS CONTRACT FAIL');
  for (const [label] of missing) console.error(`- ${label}`);
  process.exit(1);
}

console.log(`MOBILE CSS CONTRACT PASS: ${contracts.length} responsive safeguards present.`);
console.log('This is a source-level regression guard; owner phone/browser acceptance remains pending.');
