import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '../../generated/prisma/client';
import { Role } from '../../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;
  const prisma = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    const module = await Test.createTestingModule({
      providers: [UsersService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(UsersService);
  });

  it('should normalize email for lookup and creation', async () => {
    await service.findByEmail('  USER@EXAMPLE.COM ');
    await service.create({ email: ' USER@EXAMPLE.COM ', password: 'hash' });
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'user@example.com' },
    });
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: { email: 'user@example.com', password: 'hash' },
    });
  });

  it('should translate a concurrent unique email violation into a generic bad request', async () => {
    prisma.user.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '7.5.0',
      }),
    );
    await expect(
      service.create({ email: 'user@example.com', password: 'hash' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('should preserve unrelated database failures', async () => {
    const failure = new Prisma.PrismaClientKnownRequestError(
      'Connection error',
      { code: 'P2024', clientVersion: '7.5.0' },
    );
    prisma.user.create.mockRejectedValue(failure);
    await expect(
      service.create({ email: 'user@example.com', password: 'hash' }),
    ).rejects.toBe(failure);
  });

  it('should return 404 for a missing public profile', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.findByIdSafe('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('should never select password or refresh token for public profiles', async () => {
    const profile = { id: 'user-id', email: 'user@example.com' };
    prisma.user.findUnique.mockResolvedValue(profile);
    await expect(service.findByIdSafe('user-id')).resolves.toEqual(profile);
    const args = prisma.user.findUnique.mock.calls[0][0] as {
      select: Record<string, boolean>;
    };
    expect(args.select.id).toBe(true);
    expect(args.select.password).not.toBe(true);
    expect(args.select.refreshToken).not.toBe(true);
  });

  it('should paginate with stable ordering and a count from the same transaction', async () => {
    const profiles = [{ id: 'user-id' }];
    const find = Promise.resolve(profiles);
    const count = Promise.resolve(21);
    prisma.user.findMany.mockReturnValue(find);
    prisma.user.count.mockReturnValue(count);
    prisma.$transaction.mockResolvedValue([profiles, 21]);
    const result = await service.findAll({ page: 2, limit: 20 });
    expect(result).toEqual({
      data: profiles,
      meta: { total: 21, page: 2, limit: 20, totalPages: 2 },
    });
    expect(prisma.$transaction).toHaveBeenCalledWith([find, count]);
    const args = prisma.user.findMany.mock.calls[0][0] as {
      skip: number;
      take: number;
      orderBy: unknown;
      select: Record<string, boolean>;
    };
    expect(args).toMatchObject({
      skip: 20,
      take: 20,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    });
    expect(args.select.password).not.toBe(true);
    expect(args.select.refreshToken).not.toBe(true);
  });

  it('should return zero pages for an empty collection', async () => {
    prisma.$transaction.mockResolvedValue([[], 0]);
    await expect(service.findAll({ page: 1, limit: 20 })).resolves.toEqual({
      data: [],
      meta: { total: 0, page: 1, limit: 20, totalPages: 0 },
    });
  });

  it('should update only allowed administrative user fields with the public select', async () => {
    const profile = { id: 'user-id', role: 'SUPPORT', isActive: true };
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-id',
      role: Role.USER,
      isActive: true,
    });
    prisma.user.update.mockResolvedValue(profile);
    await expect(
      service.updateAdmin('user-id', { role: Role.SUPPORT }),
    ).resolves.toEqual(profile);
    const args = prisma.user.update.mock.calls[0][0] as {
      select: Record<string, boolean>;
    };
    expect(args).toMatchObject({
      where: { id: 'user-id' },
      data: { role: Role.SUPPORT },
    });
    expect(args.select.password).not.toBe(true);
  });

  it('should block demoting or disabling the last active administrator', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'admin-id',
      role: Role.ADMIN,
      isActive: true,
    });
    prisma.user.count.mockResolvedValue(0);
    await expect(
      service.updateAdmin('admin-id', { role: Role.USER }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.updateAdmin('admin-id', { isActive: false }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('should allow demoting an admin when another active admin remains', async () => {
    const profile = { id: 'admin-id', role: Role.USER, isActive: true };
    prisma.user.findUnique.mockResolvedValue({
      id: 'admin-id',
      role: Role.ADMIN,
      isActive: true,
    });
    prisma.user.count.mockResolvedValue(1);
    prisma.user.update.mockResolvedValue(profile);
    await expect(
      service.updateAdmin('admin-id', { role: Role.USER }),
    ).resolves.toEqual(profile);
    expect(prisma.user.count).toHaveBeenCalledWith({
      where: {
        id: { not: 'admin-id' },
        role: Role.ADMIN,
        isActive: true,
      },
    });
  });

  it('should translate a missing user during administrative update to 404', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(
      service.updateAdmin('missing', { role: Role.ADMIN }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
