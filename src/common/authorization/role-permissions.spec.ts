import { Role } from '../../generated/prisma/enums';
import { Permission } from './permission';
import { hasPermissions, rolePermissions } from './role-permissions';

describe('role permissions', () => {
  it('should grant no administrative permissions to regular users', () => {
    expect(rolePermissions[Role.USER]).toEqual([]);
    expect(hasPermissions(Role.USER, [Permission.USERS_READ])).toBe(false);
  });

  it('should give support read-only user access', () => {
    expect(hasPermissions(Role.SUPPORT, [Permission.USERS_READ])).toBe(true);
    expect(hasPermissions(Role.SUPPORT, [Permission.USERS_MANAGE])).toBe(false);
  });

  it('should give operators management and audit permissions', () => {
    expect(
      hasPermissions(Role.OPERATOR, [
        Permission.USERS_READ,
        Permission.USERS_MANAGE,
        Permission.AUDIT_LOGS_READ,
      ]),
    ).toBe(true);
  });

  it('should give administrators every declared permission', () => {
    expect(hasPermissions(Role.ADMIN, Object.values(Permission))).toBe(true);
  });
});
