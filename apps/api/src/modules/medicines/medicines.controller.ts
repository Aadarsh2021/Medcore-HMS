import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@medcore/types';
import { MedicinesService } from './medicines.service';
import { SearchMedicinesDto } from './dto/search-medicines.dto';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { TenantGuard } from '../auth/guards/tenant.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';

@ApiTags('Medicines Master Catalog')
@ApiBearerAuth('bearer-token')
@ApiHeader({
  name: 'X-Hospital-Id',
  required: false,
  description: 'Target hospital UUID override header for Super Admin operations',
})
@UseGuards(SupabaseAuthGuard, RolesGuard, TenantGuard)
@Controller('medicines')
export class MedicinesController {
  constructor(private readonly medicinesService: MedicinesService) {}

  @Get('search')
  @Roles(
    UserRole.DOCTOR,
    UserRole.NURSE,
    UserRole.PHARMACIST,
    UserRole.HOSPITAL_ADMIN,
    UserRole.SUPER_ADMIN,
  )
  @ApiOperation({
    summary: 'Search tenant medicine master catalog by name or generic compound.',
  })
  @ApiResponse({ status: 200, description: 'List of matching medicines' })
  async search(
    @CurrentTenant() tenantId: string | null,
    @Query() dto: SearchMedicinesDto,
  ) {
    const data = await this.medicinesService.searchMedicines(
      tenantId,
      dto.q,
      dto.limit,
    );
    return { success: true, data };
  }
}
