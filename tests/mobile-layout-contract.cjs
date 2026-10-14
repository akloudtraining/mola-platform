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
const table = fs.readFileSync(path.join(root, 'components', 'ui', 'table.tsx'), 'utf8');
const page = fs.readFileSync(path.join(root, 'app', 'page.tsx'), 'utf8');
const layout = fs.readFileSync(path.join(root, 'app', 'layout.tsx'), 'utf8');

const contracts = [
  ['a 700px responsive breakpoint', /@media\s*\(\s*max-width\s*:\s*700px\s*\)/],
  ['mobile topbar height and padding', /\.topbar\s*\{[^}]*height:\s*64px;[^}]*padding-inline:\s*12px;/s],
  ['shrinkable mobile heading and panel content', /\.page-heading>div, \.panel-header>div, \.project-strip>div, \.decision-heading>div\s*\{\s*min-width:\s*0;/s],
  ['panel headers can shrink', /\.panel-header\s*\{[^}]*min-width:\s*0;/s],
  ['long project copy wraps', /\.project-strip p\s*\{[^}]*overflow-wrap:\s*anywhere;/s],
  ['long notices wrap', /\.notice p\s*\{[^}]*min-width:\s*0;[^}]*overflow-wrap:\s*anywhere;/s],
  ['mobile page heading stacks the primary action', /\.page-heading>\.primary\s*\{[^}]*width:\s*100%;/s],
  ['phone-sized data tables reflow into stacked cards', /\[data-slot="table-row"\]\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/s],
  ['mobile table scroll wrappers do not force sideways panning', /\[data-slot="table-container"\]\{[^}]*overflow-x:visible!important/s],
  ['phone-sized savings tables fit their card width', /\.calendar-output \.table-wrap>table\{display:block;width:100%;min-width:0!important/s],
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
  ['mobile assistant launcher stays compact in the lower corner', /\.mola-assistant-launcher\{[^}]*left:\s*auto;[^}]*right:\s*14px;[^}]*width:\s*auto;[^}]*border-radius:\s*999px/s],
  ['launcher shrinks on short extra-narrow phones', /@media \(max-width: 360px\) and \(max-height: 620px\)\{[^}]*\.mola-assistant-launcher\{[^}]*height:42px/s],
  ['mobile pages reserve scroll space above the floating launcher', /main\{padding:\s*18px 14px calc\(92px \+ env\(safe-area-inset-bottom\)\)/s],
  ['short mobile navigation drawer has an explicit momentum scroll region', /\.nav-content\{[^}]*flex:\s*1 1 0%;[^}]*min-height:\s*0;[^}]*overflow-y:\s*auto!important;[^}]*overscroll-behavior:\s*contain;[^}]*-webkit-overflow-scrolling:\s*touch/s],
  ['short-height drawer reduces chrome without hiding destinations', /@media\(max-width:700px\) and \(max-height:620px\)[\s\S]*?\.nav-scope\{display:\s*none\}[\s\S]*?\.nav-footer/],
  ['assistant dialog resets centered desktop transform', /\.mola-assistant\[data-slot="dialog-content"\]\{[^}]*right:\s*24px;[^}]*bottom:\s*calc\(84px[^}]*--tw-translate-x:\s*0px!important;[^}]*--tw-translate-y:\s*0px!important/s],
  ['mobile nav closes after a destination is selected', /if\s*\(isMobile[^)]*\)\s*setOpenMobile\(false\)/],
];

const missing = contracts.filter(([, pattern]) => !pattern.test(pattern.source.includes('isMobile') ? sidebar : css));
if (missing.length) {
  console.error('MOBILE CSS CONTRACT FAIL');
  for (const [label] of missing) console.error(`- ${label}`);
  process.exit(1);
}

const tableContracts = [
  ['shared table cells receive readable labels from column headings', /function headerLabels\([\s\S]*?child\.type === TableHead[\s\S]*?data-label": label/s],
];
const missingTable = tableContracts.filter(([, pattern]) => !pattern.test(table));
if (missingTable.length) {
  console.error('MOBILE TABLE CONTRACT FAIL');
  for (const [label] of missingTable) console.error(`- ${label}`);
  process.exit(1);
}

const mobileContracts = [
  ['mobile section tabs expose direct workspace navigation', /mobile-section-tabs" aria-label="Main workspace sections"/],
  ['mobile section controls retain the compact labels and active state', /aria-current=\{view===id\?'page':undefined\} className=\{view===id\?'is-active':''\}/],
  ['mobile navigation keeps the selected section in view', /mobile-section-tabs \.is-active'\);active\?\.scrollIntoView\(\{block:'nearest',inline:'nearest',behavior:'smooth'\}\)/],
].filter(([, pattern]) => !pattern.test(page));
mobileContracts.push(...[
  ['mobile text controls stay at iOS zoom-safe readable size', /\[role="combobox"\]\{font-size:16px!important\}/],
  ['mobile dashboard metrics form an intentional swipe rail', /\.hub-metrics\{[^}]*grid-auto-flow:column;[^}]*overflow-x:auto;[^}]*scroll-snap-type:x mandatory/s],
  ['mobile drawer fits the dynamic viewport', /max-height:100dvh;[^}]*padding-bottom:env\(safe-area-inset-bottom\)/s],
  ['mobile navigation remains hidden at desktop widths', /\.mobile-section-tabs\{display:none\}/],
  ['mobile dashboard makes the verified total visible sooner', /\.capital-hero-copy>p\{display:none\}/],
  ['mobile verified total label stays on one line', /\.capital-total>span\{[^}]*white-space:nowrap/],
].filter(([, pattern]) => !pattern.test(css)));
if (!/viewportFit: "cover"/.test(layout)) mobileContracts.push(['mobile viewport uses safe-area insets', /viewportFit: "cover"/]);
if (mobileContracts.length) {
  console.error('MOBILE UX CONTRACT FAIL');
  for (const [label] of mobileContracts) console.error(`- ${label}`);
  process.exit(1);
}
if (/:root\[data-workspace-brand="mola"\] body\{[^}]*overflow-x:\s*hidden/.test(css)) {
  console.error('MOBILE UX CONTRACT FAIL\n- document overflow is not hidden to mask mobile width defects');
  process.exit(1);
}

console.log(`MOBILE UX CONTRACT PASS: ${contracts.length + tableContracts.length + 11} responsive safeguards present.`);
console.log('This is a source-level regression guard; owner phone/browser acceptance remains pending.');
