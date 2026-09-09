import { Test } from '@nestjs/testing';
import { AuditAction } from '../../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from './audit.service';

describe('AuditService', () => {
  const prisma = {
    auditLog: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  let service: AuditService;

  beforeEach(async () => {
    jest.resetAllMocks();
    const module = await Test.createTestingModule({
      providers: [AuditService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(AuditService);
  });

  it('should remove credentials recursively before writing metadata', async () => {
    await service.write({
      action: AuditAction.SESSION_REVOKED,
      actorUserId: 'actor-id',
      targetType: 'Session',
      targetId: 'session-id',
      metadata: {
        currentSession: false,
        refreshToken: 'never-store',
        nested: { authorization: 'never-store', kept: true },
        array: [{ passwordHash: 'never-store', id: 'kept' }],
      },
    });
    const metadata = prisma.auditLog.create.mock.calls[0][0].data.metadata;
    expect(JSON.parse(metadata)).toEqual({
      currentSession: false,
      nested: { kept: true },
      array: [{ id: 'kept' }],
    });
  });

  it('should store audit context and omit metadata when it is absent', async () => {
    await service.write({
      action: AuditAction.ADMIN_PROVISIONED,
      targetType: 'User',
      ipAddress: '127.0.0.1',
      requestId: 'request-id',
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorUserId: undefined,
        action: AuditAction.ADMIN_PROVISIONED,
        targetType: 'User',
        targetId: undefined,
        ipAddress: '127.0.0.1',
        requestId: 'request-id',
        metadata: undefined,
      },
    });
  });

  it('should paginate, filter and parse stored audit metadata', async () => {
    const records = [
      {
        id: 'audit-id',
        action: AuditAction.USER_STATUS_UPDATED,
        metadata: '{"isActive":false}',
      },
    ];
    const find = Promise.resolve(records);
    const count = Promise.resolve(1);
    prisma.auditLog.findMany.mockReturnValue(find);
    prisma.auditLog.count.mockReturnValue(count);
    prisma.$transaction.mockResolvedValue([records, 1]);
    await expect(
      service.findAll({
        page: 2,
        limit: 5,
        action: AuditAction.USER_STATUS_UPDATED,
        createdAfter: '2026-01-01T00:00:00.000Z',
      }),
    ).resolves.toEqual({
      data: [
        {
          id: 'audit-id',
          action: AuditAction.USER_STATUS_UPDATED,
          metadata: { isActive: false },
        },
      ],
      meta: { total: 1, page: 2, limit: 5, totalPages: 1 },
    });
    expect(prisma.$transaction).toHaveBeenCalledWith([find, count]);
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 5,
        take: 5,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
    );
  });
});
