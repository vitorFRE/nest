import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Prisma Migrate targets local SQLite. Apply the generated SQL to Turso separately.
export default defineConfig({
  schema: 'src/prisma/schema.prisma',
  migrations: { path: 'src/prisma/migrations' },
  datasource: { url: process.env.LOCAL_DATABASE_URL ?? 'file:./dev.db' },
});
