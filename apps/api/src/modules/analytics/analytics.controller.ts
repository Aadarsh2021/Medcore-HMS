import {
  Controller,
  Get,
  Query,
  Param,
  UseGuards,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '@medcore/types';

@Controller('analytics')
@UseGuards(SupabaseAuthGuard, RolesGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('hospital')
  @Roles(UserRole.SUPER_ADMIN, UserRole.HOSPITAL_ADMIN, UserRole.ACCOUNTANT)
  async getHospitalAnalytics(
    @CurrentUser() user: any,
    @Query('hospitalId') requestedHospitalId?: string,
  ) {
    let targetHospitalId = user.hospitalId;

    if (user.role === UserRole.SUPER_ADMIN) {
      targetHospitalId = requestedHospitalId || user.hospitalId;
      if (!targetHospitalId) {
        throw new BadRequestException('hospitalId query parameter is required for Super Admin');
      }
    } else {
      // Enforce multi-tenancy: Hospital Admin or Accountant can only query their own hospital
      if (requestedHospitalId && requestedHospitalId !== user.hospitalId) {
        throw new ForbiddenException('Cross-tenant analytics access is strictly prohibited');
      }
    }

    const data = await this.analyticsService.getHospitalAnalytics(targetHospitalId);
    return {
      success: true,
      data,
    };
  }

  @Get('system')
  @Roles(UserRole.SUPER_ADMIN)
  async getSystemOverview(@CurrentUser() user: any) {
    if (user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only Super Admin can access system-wide analytics');
    }

    const data = await this.analyticsService.getSystemOverview();
    return {
      success: true,
      data,
    };
  }
}
