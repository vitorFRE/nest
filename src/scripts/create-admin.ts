import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { PrismaLibSql } from '@prisma/adapter-libsql';
import { PrismaClient } from '../generated/prisma/client';
import { AuditAction, Role } from '../generated/prisma/enums';
import { buildConfig } from '../config/configuration';
import { assertPasswordPolicy } from '../common/utils/password-policy';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(name + ' é obrigatório');
  return value;
}

function validateInput(email: string, password: string, name?: string): void {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('ADMIN_EMAIL deve ser um email válido');
  }
  assertPasswordPolicy(password);
  if (name && name.length > 100) {
    throw new Error('ADMIN_NAME deve ter no máximo 100 caracteres');
  }
}

async function bootstrap(): Promise<void> {
  const email = required('ADMIN_EMAIL').toLowerCase();
  const password = required('ADMIN_PASSWORD');
  const name = process.env.ADMIN_NAME?.trim() || undefined;
  validateInput(email, password, name);

  const config = buildConfig(process.env);
  const prisma = new PrismaClient({
    adapter: new PrismaLibSql(config.database),
  });

  try {
    await prisma.$connect();
    const result = await prisma.$transaction(async (transaction) => {
      const existing = await transaction.user.findUnique({
        where: { email },
        select: { id: true },
      });
      const user = await transaction.user.upsert({
        where: { email },
        create: {
          email,
          name,
          password: await bcrypt.hash(password, 12),
          role: Role.ADMIN,
          isActive: true,
        },
        update: {
          ...(name ? { name } : {}),
          role: Role.ADMIN,
          isActive: true,
        },
        select: { id: true, email: true },
      });
      await transaction.auditLog.create({
        data: {
          action: AuditAction.ADMIN_PROVISIONED,
          targetType: 'User',
          targetId: user.id,
          metadata: JSON.stringify({ created: !existing }),
        },
      });
      return { ...user, created: !existing };
    });
    process.stdout.write(
      (result.created ? 'Created' : 'Promoted') +
        ' administrator ' +
        result.email +
        '\n',
    );
  } finally {
    await prisma.$disconnect();
  }
}

void bootstrap().catch((error: unknown) => {
  process.stderr.write(
    (error instanceof Error
      ? error.message
      : 'Could not provision administrator') + '\n',
  );
  process.exitCode = 1;
});
