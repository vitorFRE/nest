import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const target = fileURLToPath(new URL('../.env', import.meta.url));
const example = readFileSync(
  new URL('../.env.example', import.meta.url),
  'utf8',
);
const content = example
  .replace(
    /^JWT_ACCESS_SECRET=.*$/m,
    `JWT_ACCESS_SECRET=${randomBytes(48).toString('hex')}`,
  )
  .replace(
    /^JWT_REFRESH_SECRET=.*$/m,
    `JWT_REFRESH_SECRET=${randomBytes(48).toString('hex')}`,
  );
try {
  writeFileSync(target, content, { flag: 'wx' });
  console.log('.env criado com segredos próprios para desenvolvimento.');
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  console.log('.env já existe; configuração preservada.');
}
