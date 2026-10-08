import {readFile, writeFile} from 'node:fs/promises';

const path = 'dist/server/wrangler.json';
const config = JSON.parse(await readFile(path, 'utf8'));

// Production variables are managed as Cloudflare Worker bindings. Do not let
// the generated config replace them with an empty object during deploy.
if (config.vars && Object.keys(config.vars).length === 0) delete config.vars;

await writeFile(path, `${JSON.stringify(config)}\n`);
