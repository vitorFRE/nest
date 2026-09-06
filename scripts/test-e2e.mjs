import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const root = resolve('.test-databases');
mkdirSync(root, { recursive: true });
const directory = mkdtempSync(join(root, 'e2e-'));
const jest = join(dirname(require.resolve('jest/package.json')), 'bin/jest.js');
try {
  const result = spawnSync(
    process.execPath,
    [jest, '--config', './test/jest-e2e.json', ...process.argv.slice(2)],
    {
      stdio: 'inherit',
      env: { ...process.env, TEST_DATABASE_FILE: join(directory, 'test.db') },
    },
  );
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  // Clean after Jest exits, when Windows has released libSQL's native file handles.
  if (dirname(directory) !== root) throw new Error('Unexpected test directory');
  rmSync(directory, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  });
}
