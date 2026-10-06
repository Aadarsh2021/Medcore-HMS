import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TriageService } from './triage.service';
import {
  RegisterEmergencyPatientDto,
  RapidBedAllocationDto,
  UpdateTriageStatusDto,
} from './triage.dto';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CurrentHospital } from '../auth/decorators/current-hospital.decorator';
import { UserRole } from '@medcore/types';

@ApiTags('Emergency Room & Triage')
@Controller('triage')
@UseGuards(SupabaseAuthGuard, RolesGuard)
@ApiBearerAuth('bearer-token')
export class TriageController {
  constructor(private readonly triageService: TriageService) {}

  @Post('register')
  @Roles(UserRole.NURSE, UserRole.DOCTOR, UserRole.HOSPITAL_ADMIN)
  @ApiOperation({ summary: 'Register an emergency patient arrival with ESI triage level' })
  async registerEmergencyPatient(
    @CurrentHospital() hospitalId: string,
    @CurrentUser() actor: { id: string; role: string },
    @Body() dto: RegisterEmergencyPatientDto,
  ) {
    const record = await this.triageService.registerEmergencyPatient(hospitalId, actor, dto);
    return {
      success: true,
      data: record,
      message: `Emergency patient registered successfully with ESI Level ${dto.triageLevel}`,
    };
  }

  @Get('board')
  @Roles(UserRole.DOCTOR, UserRole.NURSE, UserRole.HOSPITAL_ADMIN)
  @ApiOperation({ summary: 'Get live Emergency Room board prioritized by ESI Triage Level' })
  async getEmergencyBoard(@CurrentHospital() hospitalId: string) {
    const board = await this.triageService.getEmergencyBoard(hospitalId);
    return {
      success: true,
      data: board,
      count: board.length,
    };
  }

  @Post('allocate-bed')
  @Roles(UserRole.DOCTOR, UserRole.NURSE, UserRole.HOSPITAL_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rapid concurrency-safe bed allocation for emergency patient' })
  async allocateEmergencyBed(
    @CurrentHospital() hospitalId: string,
    @CurrentUser() actor: { id: string; role: string },
    @Body() dto: RapidBedAllocationDto,
  ) {
    const result = await this.triageService.allocateEmergencyBed(hospitalId, actor, dto);
    return {
      success: true,
      data: result,
      message: result.message,
    };
  }

  @Patch(':encounterId/status')
  @Roles(UserRole.DOCTOR, UserRole.NURSE, UserRole.HOSPITAL_ADMIN)
  @ApiOperation({ summary: 'Update emergency triage status (e.g. ATTENDED, DISCHARGED, ADMITTED)' })
  async updateTriageStatus(
    @CurrentHospital() hospitalId: string,
    @CurrentUser() actor: { id: string; role: string },
    @Param('encounterId') encounterId: string,
    @Body() dto: UpdateTriageStatusDto,
  ) {
    const result = await this.triageService.updateTriageStatus(hospitalId, actor, encounterId, dto);
    return {
      success: true,
      data: result,
      message: result.message,
    };
  }
}
