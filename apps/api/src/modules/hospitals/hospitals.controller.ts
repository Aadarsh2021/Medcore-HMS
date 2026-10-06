import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { HospitalsService } from './hospitals.service';
import { OnboardHospitalDto } from './dto/onboard-hospital.dto';
import { UpdateHospitalDto, QueryHospitalsDto } from './dto/update-hospital.dto';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '@medcore/types';

@ApiTags('Hospital Onboarding & Management')
@Controller('hospitals')
@UseGuards(SupabaseAuthGuard, RolesGuard)
@ApiBearerAuth('bearer-token')
export class HospitalsController {
  constructor(private readonly hospitalsService: HospitalsService) {}

  @Post('onboard')
  @Roles(UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Super Admin: Onboard a new hospital tenant with initial admin' })
  @ApiResponse({ status: 201, description: 'Hospital tenant provisioned successfully' })
  async onboard(
    @CurrentUser() actor: { id: string; role: string },
    @Body() dto: OnboardHospitalDto,
  ) {
    const data = await this.hospitalsService.onboardHospital(actor, dto);
    return {
      success: true,
      data,
      message: 'Hospital and initial tenant administrator provisioned successfully',
    };
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.HOSPITAL_ADMIN)
  @ApiOperation({ summary: 'List hospitals (Super Admin all, Hospital Admin own tenant)' })
  async getHospitals(
    @CurrentUser() actor: { id: string; role: string; hospitalId?: string },
    @Query() query: QueryHospitalsDto,
  ) {
    const result = await this.hospitalsService.getHospitals(actor, query);
    return {
      success: true,
      data: result.items,
      meta: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
      },
    };
  }

  @Get(':id')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.HOSPITAL_ADMIN,
    UserRole.DOCTOR,
    UserRole.NURSE,
    UserRole.RECEPTIONIST,
    UserRole.PHARMACIST,
    UserRole.LAB_TECHNICIAN,
    UserRole.ACCOUNTANT,
  )
  @ApiOperation({ summary: 'Get hospital profile by ID (scoped to tenant)' })
  async getHospitalById(
    @Param('id') hospitalId: string,
    @CurrentUser() actor: { id: string; role: string; hospitalId?: string },
  ) {
    const data = await this.hospitalsService.getHospitalById(hospitalId, actor);
    return {
      success: true,
      data,
    };
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.HOSPITAL_ADMIN)
  @ApiOperation({ summary: 'Update hospital profile or operational settings' })
  async updateHospital(
    @Param('id') hospitalId: string,
    @CurrentUser() actor: { id: string; role: string; hospitalId?: string },
    @Body() dto: UpdateHospitalDto,
  ) {
    const data = await this.hospitalsService.updateHospital(hospitalId, actor, dto);
    return {
      success: true,
      data,
      message: 'Hospital details updated successfully',
    };
  }
}
