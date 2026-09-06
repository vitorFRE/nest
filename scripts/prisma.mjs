import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { closeSync, mkdirSync, openSync } from 'node:fs';
import { config } from 'dotenv';

const require = createRequire(import.meta.url);
config({ quiet: true });
if (
  process.argv[2] === 'migrate' &&
  ['dev', 'deploy'].includes(process.argv[3])
) {
  const url = process.env.LOCAL_DATABASE_URL ?? 'file:./dev.db';
  if (!url.startsWith('file:') || url.length <= 5) {
    throw new Error(
      'LOCAL_DATABASE_URL deve apontar para um arquivo SQLite local.',
    );
  }
  // Prisma 7 can fail with an empty schema-engine error when the SQLite file is absent.
  // Opening in append mode creates an empty file while preserving existing databases.
  const databasePath = resolve(url.slice(5));
  mkdirSync(dirname(databasePath), { recursive: true });
  closeSync(openSync(databasePath, 'a'));
}
// Set before loading Prisma: its engine environment is captured before prisma.config.ts.
// Workaround for https://github.com/prisma/prisma/issues/29355, reproduced on Windows.
const cli = join(
  dirname(require.resolve('prisma/package.json')),
  'build/index.js',
);
const result = spawnSync(process.execPath, [cli, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, RUST_LOG: process.env.RUST_LOG || 'info' },
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
