import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { QueryNotificationsDto } from './dto/query-notifications.dto';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Notifications')
@Controller('notifications')
@UseGuards(SupabaseAuthGuard)
@ApiBearerAuth('bearer-token')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current user notifications with unread count' })
  async getMyNotifications(
    @CurrentUser('id') userId: string,
    @Query() query: QueryNotificationsDto,
  ) {
    const result = await this.notificationsService.getNotifications(userId, query);
    return {
      success: true,
      data: result.items,
      meta: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
        unreadCount: result.unreadCount,
      },
    };
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get unread notification count badge' })
  async getUnreadCount(@CurrentUser('id') userId: string) {
    const data = await this.notificationsService.getUnreadCount(userId);
    return {
      success: true,
      data,
    };
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark a notification as read' })
  async markAsRead(
    @CurrentUser('id') userId: string,
    @Param('id') notificationId: string,
  ) {
    const data = await this.notificationsService.markAsRead(userId, notificationId);
    return {
      success: true,
      data,
      message: 'Notification marked as read',
    };
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark all notifications as read for current user' })
  async markAllAsRead(@CurrentUser('id') userId: string) {
    const data = await this.notificationsService.markAllAsRead(userId);
    return {
      success: true,
      data,
      message: 'All notifications marked as read',
    };
  }
}
