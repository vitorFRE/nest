import { Injectable } from '@nestjs/common';
import { AuditAction } from '../../generated/prisma/enums';
import { AuditContext } from '../../common/types/audit-context.type';
import { sanitizeAuditMetadata } from '../../common/utils/sanitize-audit-metadata';
import { PrismaService } from '../prisma/prisma.service';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { paginate } from '../../common/utils/pagination';

type WriteAuditLog = AuditContext & {
  action: AuditAction;
  targetType: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
};

export type AuditLogFilters = PaginationQueryDto & {
  actorUserId?: string;
  action?: AuditAction;
  targetType?: string;
  targetId?: string;
  createdAfter?: string;
  createdBefore?: string;
};

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async write(event: WriteAuditLog): Promise<void> {
    const metadata = event.metadata
      ? JSON.stringify(sanitizeAuditMetadata(event.metadata))
      : undefined;

    await this.prisma.auditLog.create({
      data: {
        actorUserId: event.actorUserId,
        action: event.action,
        targetType: event.targetType,
        targetId: event.targetId,
        ipAddress: event.ipAddress,
        requestId: event.requestId,
        metadata,
      },
    });
  }

  async findAll(filters: AuditLogFilters) {
    const where = {
      actorUserId: filters.actorUserId,
      action: filters.action,
      targetType: filters.targetType,
      targetId: filters.targetId,
      createdAt:
        filters.createdAfter || filters.createdBefore
          ? {
              gte: filters.createdAfter
                ? new Date(filters.createdAfter)
                : undefined,
              lte: filters.createdBefore
                ? new Date(filters.createdBefore)
                : undefined,
            }
          : undefined,
    };
    const [records, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return paginate(
      records.map(({ metadata, ...record }) => ({
        ...record,
        metadata: metadata ? (JSON.parse(metadata) as unknown) : undefined,
      })),
      total,
      filters,
    );
  }
}
