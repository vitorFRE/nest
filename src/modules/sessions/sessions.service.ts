import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const sessionSelect = {
  id: true,
  createdAt: true,
  updatedAt: true,
  expiresAt: true,
};

@Injectable()
export class SessionsService {
  constructor(private readonly prisma: PrismaService) {}

  create(
    id: string,
    userId: string,
    refreshTokenHash: string,
    expiresAt: Date,
  ) {
    return this.prisma.session.create({
      data: { id, userId, refreshTokenHash, expiresAt },
      select: sessionSelect,
    });
  }

  async isActive(id: string, userId: string): Promise<boolean> {
    const count = await this.prisma.session.count({
      where: { id, userId, revokedAt: null, expiresAt: { gt: new Date() } },
    });
    return count === 1;
  }

  async rotateRefreshToken(
    id: string,
    userId: string,
    previousHash: string,
    nextHash: string,
  ): Promise<boolean> {
    const result = await this.prisma.session.updateMany({
      where: {
        id,
        userId,
        refreshTokenHash: previousHash,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { refreshTokenHash: nextHash },
    });
    return result.count === 1;
  }

  findAllForUser(userId: string) {
    return this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      select: sessionSelect,
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    });
  }

  async revokeForUser(id: string, userId: string): Promise<void> {
    const result = await this.prisma.session.updateMany({
      where: { id, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (result.count !== 1)
      throw new NotFoundException('Sessão não encontrada');
  }
}
