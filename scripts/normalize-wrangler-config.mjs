import {readFile, writeFile} from 'node:fs/promises';

const path = 'dist/server/wrangler.json';
const config = JSON.parse(await readFile(path, 'utf8'));

// Wrangler 4.119 rejects this legacy compatibility field. Environments
// default to the legacy deployment naming model now, so removing it keeps
// deployment behavior unchanged while allowing current Wrangler releases.
delete config.legacy_env;

// The Wrangler config is emitted under dist/server, while migration SQL lives
// at the repository root. Keep the path valid when Wrangler is invoked with
// this generated config from the project root.
const database = config.d1_databases?.find(binding => binding.binding === 'DB');
if (database) database.migrations_dir = '../../drizzle';

// Omitting vars alone does NOT preserve dashboard values. Wrangler explicitly
// requires keep_vars; ensure that policy survives generated configuration.
config.keep_vars = true;
if (config.vars && Object.keys(config.vars).length === 0) delete config.vars;

await writeFile(path, `${JSON.stringify(config)}\n`);
