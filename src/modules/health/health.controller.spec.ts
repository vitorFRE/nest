import { ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;
  const prisma = { $queryRaw: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    const module = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: PrismaService, useValue: prisma }],
    }).compile();
    controller = module.get(HealthController);
  });

  it('should keep liveness independent from database availability', () => {
    expect(controller.live()).toEqual({ status: 'ok' });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('should report readiness after a successful database query', async () => {
    prisma.$queryRaw.mockResolvedValue([{ '1': 1 }]);
    await expect(controller.ready()).resolves.toEqual({
      status: 'ok',
      database: 'up',
    });
  });

  it('should return 503 without exposing database connection details', async () => {
    prisma.$queryRaw.mockRejectedValue(
      new Error('libsql://private-host: token=secret'),
    );
    const failure = await controller.ready().catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ServiceUnavailableException);
    expect((failure as ServiceUnavailableException).getStatus()).toBe(503);
    expect((failure as Error).message).toBe('Database unavailable');
  });
});
