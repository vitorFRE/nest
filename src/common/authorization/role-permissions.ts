import { Role } from '../../generated/prisma/enums';
import { Permission } from './permission';

export const rolePermissions: Readonly<Record<Role, readonly Permission[]>> = {
  [Role.USER]: [],
  [Role.SUPPORT]: [Permission.USERS_READ],
  [Role.OPERATOR]: [
    Permission.USERS_READ,
    Permission.USERS_MANAGE,
    Permission.AUDIT_LOGS_READ,
  ],
  [Role.ADMIN]: Object.values(Permission),
};

export function hasPermissions(
  role: Role,
  requiredPermissions: readonly Permission[],
): boolean {
  const granted = rolePermissions[role];
  return requiredPermissions.every((permission) =>
    granted.includes(permission),
  );
}
