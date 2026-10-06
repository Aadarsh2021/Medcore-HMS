import {
  Injectable,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { QueryAuditLogsDto } from './dto/query-audit-logs.dto';
import { UserRole, AuditLogResponse } from '@medcore/types';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Retrieves immutable audit trail records with strict tenant isolation and RBAC.
   */
  async getAuditLogs(
    actor: { id: string; role: string; hospitalId?: string },
    query: QueryAuditLogsDto,
  ) {
    if (actor.role !== UserRole.SUPER_ADMIN && actor.role !== UserRole.HOSPITAL_ADMIN) {
      throw new ForbiddenException('Access denied: Only Administrators can inspect clinical & operational audit logs');
    }

    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 50));
    const skip = (page - 1) * limit;

    const where: any = {};

    // Multi-tenant boundary
    if (actor.role === UserRole.HOSPITAL_ADMIN) {
      where.hospitalId = actor.hospitalId;
    }

    if (query.entityName) {
      where.entityName = query.entityName;
    }

    if (query.action) {
      where.action = query.action;
    }

    if (query.entityId) {
      where.entityId = query.entityId;
    }

    if (query.userId) {
      where.userId = query.userId;
    }

    const [total, records] = await Promise.all([
      this.prisma.raw.auditLog.count({ where }),
      this.prisma.raw.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: { firstName: true, lastName: true, email: true },
          },
        },
      }),
    ]);

    return {
      items: records.map((log) => ({
        id: log.id,
        hospitalId: log.hospitalId,
        userId: log.userId,
        userEmail: log.user?.email || null,
        userName: log.user ? `${log.user.firstName} ${log.user.lastName}` : null,
        action: log.action,
        entityName: log.entityName,
        entityId: log.entityId,
        ipAddress: log.ipAddress,
        changesJson: (log.changesJson as Record<string, any>) || null,
        createdAt: log.createdAt.toISOString(),
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}
