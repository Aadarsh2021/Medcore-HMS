import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { QueryNotificationsDto } from './dto/query-notifications.dto';
import { NotificationChannel, NotificationStatus } from '@prisma/client';
import { NotificationResponse } from '@medcore/types';
import { RealtimeGateway } from '../realtime/realtime.gateway';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly realtimeGateway?: RealtimeGateway,
  ) {}

  /**
   * Internal Service Event Trigger: Creates and dispatches a notification to a specific user.
   */
  async createNotification(params: {
    hospitalId?: string | null;
    userId: string;
    title: string;
    message: string;
    channel?: NotificationChannel;
    metadataJson?: Record<string, any>;
  }): Promise<NotificationResponse> {
    const notification = await this.prisma.raw.notification.create({
      data: {
        hospitalId: params.hospitalId || null,
        userId: params.userId,
        title: params.title.trim(),
        message: params.message.trim(),
        channel: params.channel || NotificationChannel.IN_APP,
        status: NotificationStatus.SENT,
        metadataJson: params.metadataJson || null,
      },
    });

    const response = this.mapNotificationToResponse(notification);

    // Phase 11 Realtime Socket.IO dispatch
    if (this.realtimeGateway) {
      try {
        this.realtimeGateway.emitNotification(params.userId, response);
      } catch (err: any) {
        this.logger.warn(`Failed to emit realtime notification: ${err.message}`);
      }
    }

    this.logger.log(
      `Dispatched [${notification.channel}] notification to User ${params.userId}: "${params.title}"`,
    );

    return response;
  }

  /**
   * Retrieves paginated notifications strictly scoped to the authenticated user.
   */
  async getNotifications(userId: string, query: QueryNotificationsDto) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const where: any = { userId };
    if (query.status) {
      where.status = query.status;
    }

    const [total, records, unreadCount] = await Promise.all([
      this.prisma.raw.notification.count({ where }),
      this.prisma.raw.notification.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.raw.notification.count({
        where: { userId, status: { in: [NotificationStatus.PENDING, NotificationStatus.SENT] } },
      }),
    ]);

    return {
      items: records.map((n) => this.mapNotificationToResponse(n)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      unreadCount,
    };
  }

  /**
   * Returns current count of unread notifications for navbar badges.
   */
  async getUnreadCount(userId: string): Promise<{ unreadCount: number }> {
    const count = await this.prisma.raw.notification.count({
      where: {
        userId,
        status: { in: [NotificationStatus.PENDING, NotificationStatus.SENT] },
      },
    });
    return { unreadCount: count };
  }

  /**
   * Marks a specific notification as READ with ownership verification.
   */
  async markAsRead(userId: string, notificationId: string): Promise<NotificationResponse> {
    const notification = await this.prisma.raw.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    if (notification.userId !== userId) {
      throw new ForbiddenException('Access denied: You cannot modify notifications belonging to another user');
    }

    const updated = await this.prisma.raw.notification.update({
      where: { id: notificationId },
      data: {
        status: NotificationStatus.READ,
        readAt: new Date(),
      },
    });

    return this.mapNotificationToResponse(updated);
  }

  /**
   * Marks all pending/sent notifications as READ for the user.
   */
  async markAllAsRead(userId: string): Promise<{ success: boolean; updatedCount: number }> {
    const updateResult = await this.prisma.raw.notification.updateMany({
      where: {
        userId,
        status: { in: [NotificationStatus.PENDING, NotificationStatus.SENT] },
      },
      data: {
        status: NotificationStatus.READ,
        readAt: new Date(),
      },
    });

    return {
      success: true,
      updatedCount: updateResult.count,
    };
  }

  private mapNotificationToResponse(notification: any): NotificationResponse {
    return {
      id: notification.id,
      hospitalId: notification.hospitalId,
      userId: notification.userId,
      title: notification.title,
      message: notification.message,
      channel: notification.channel as any,
      status: notification.status as any,
      metadataJson: (notification.metadataJson as Record<string, any>) || null,
      readAt: notification.readAt?.toISOString() || null,
      createdAt: notification.createdAt.toISOString(),
      updatedAt: notification.updatedAt.toISOString(),
    };
  }
}
