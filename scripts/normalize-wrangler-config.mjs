import {readFile, writeFile} from 'node:fs/promises';

const path = 'dist/server/wrangler.json';
const config = JSON.parse(await readFile(path, 'utf8'));

// Omitting vars alone does NOT preserve dashboard values. Wrangler explicitly
// requires keep_vars; ensure that policy survives generated configuration.
config.keep_vars = true;
if (config.vars && Object.keys(config.vars).length === 0) delete config.vars;

await writeFile(path, `${JSON.stringify(config)}\n`);
