import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { SessionsService } from './sessions.service';

describe('SessionsService', () => {
  const prisma = {
    session: {
      create: jest.fn(),
      count: jest.fn(),
      updateMany: jest.fn(),
      findMany: jest.fn(),
    },
  };
  let service: SessionsService;

  beforeEach(async () => {
    jest.resetAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        SessionsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(SessionsService);
  });

  it('should persist only the refresh hash and its expiry when creating a session', async () => {
    const expiresAt = new Date('2030-01-01T00:00:00.000Z');
    prisma.session.create.mockResolvedValue({ id: 'session-id' });
    await service.create('session-id', 'user-id', 'hash', expiresAt);
    expect(prisma.session.create).toHaveBeenCalledWith({
      data: {
        id: 'session-id',
        userId: 'user-id',
        refreshTokenHash: 'hash',
        expiresAt,
      },
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
        expiresAt: true,
      },
    });
  });

  it.each([
    ['one', 1, true],
    ['none', 0, false],
    ['more than one', 2, false],
  ])(
    'should consider %s matching active sessions valid',
    async (_, count, valid) => {
      prisma.session.count.mockResolvedValue(count);
      await expect(service.isActive('session-id', 'user-id')).resolves.toBe(
        valid,
      );
      expect(prisma.session.count).toHaveBeenCalledWith({
        where: {
          id: 'session-id',
          userId: 'user-id',
          revokedAt: null,
          expiresAt: { gt: expect.any(Date) },
        },
      });
    },
  );

  it.each([
    ['one', 1, true],
    ['none', 0, false],
  ])(
    'should rotate only %s valid matching token hashes',
    async (_, count, rotated) => {
      prisma.session.updateMany.mockResolvedValue({ count });
      await expect(
        service.rotateRefreshToken('session-id', 'user-id', 'previous', 'next'),
      ).resolves.toBe(rotated);
      expect(prisma.session.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'session-id',
          userId: 'user-id',
          refreshTokenHash: 'previous',
          revokedAt: null,
          expiresAt: { gt: expect.any(Date) },
        },
        data: { refreshTokenHash: 'next' },
      });
    },
  );

  it('should list only current active sessions in newest activity order', async () => {
    const sessions = [{ id: 'session-id' }];
    prisma.session.findMany.mockResolvedValue(sessions);
    await expect(service.findAllForUser('user-id')).resolves.toEqual(sessions);
    expect(prisma.session.findMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-id',
        revokedAt: null,
        expiresAt: { gt: expect.any(Date) },
      },
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
        expiresAt: true,
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    });
  });

  it('should mark only the requested active session revoked', async () => {
    prisma.session.updateMany.mockResolvedValue({ count: 1 });
    await expect(
      service.revokeForUser('session-id', 'user-id'),
    ).resolves.toBeUndefined();
    expect(prisma.session.updateMany).toHaveBeenCalledWith({
      where: { id: 'session-id', userId: 'user-id', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('should return 404 when the session belongs to someone else or is already revoked', async () => {
    prisma.session.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.revokeForUser('session-id', 'user-id'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
