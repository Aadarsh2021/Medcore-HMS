import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@medcore/types';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { TenantGuard } from '../auth/guards/tenant.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { LaboratoryService } from './laboratory.service';
import {
  AmendLabResultDto,
  ApproveLabOrderDto,
  CancelLabOrderDto,
  CollectSpecimenDto,
  CreateLabOrderDto,
  EnterLabResultsDto,
  LabCatalogQueryDto,
  LabOrdersQueryDto,
  RejectSpecimenDto,
} from './dto';

@ApiTags('Laboratory & Diagnostics (Phase 8)')
@ApiBearerAuth('bearer-token')
@ApiHeader({
  name: 'X-Hospital-Id',
  required: false,
  description: 'Target hospital UUID override header for Super Admin operations',
})
@UseGuards(SupabaseAuthGuard, RolesGuard, TenantGuard)
@Controller('laboratory')
export class LaboratoryController {
  constructor(private readonly laboratoryService: LaboratoryService) {}

  // ---------------------------------------------------------------------------
  // 1. GET /api/laboratory/categories
  // ---------------------------------------------------------------------------
  @Get('categories')
  @Roles(
    UserRole.DOCTOR,
    UserRole.LAB_TECHNICIAN,
    UserRole.NURSE,
    UserRole.HOSPITAL_ADMIN,
    UserRole.SUPER_ADMIN,
  )
  @ApiOperation({ summary: 'Retrieve all diagnostic test categories' })
  async getCategories(@CurrentTenant() hospitalId: string) {
    return this.laboratoryService.getCategories(hospitalId);
  }

  // ---------------------------------------------------------------------------
  // 2. GET /api/laboratory/catalog
  // ---------------------------------------------------------------------------
  @Get('catalog')
  @Roles(
    UserRole.DOCTOR,
    UserRole.LAB_TECHNICIAN,
    UserRole.NURSE,
    UserRole.HOSPITAL_ADMIN,
    UserRole.SUPER_ADMIN,
  )
  @ApiOperation({ summary: 'Search and paginate laboratory diagnostic test catalog' })
  async getCatalog(
    @CurrentTenant() hospitalId: string,
    @Query() query: LabCatalogQueryDto,
  ) {
    return this.laboratoryService.getCatalog(hospitalId, query);
  }

  // ---------------------------------------------------------------------------
  // 3. POST /api/laboratory/orders — Create Order
  // ---------------------------------------------------------------------------
  @Post('orders')
  @Roles(UserRole.DOCTOR, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Order laboratory diagnostic tests for a patient' })
  @ApiResponse({ status: 201, description: 'Lab order created with sequence number' })
  async createOrder(
    @CurrentTenant() hospitalId: string,
    @CurrentUser() user: any,
    @Body() dto: CreateLabOrderDto,
  ) {
    return this.laboratoryService.createOrder(hospitalId, user, dto);
  }

  // ---------------------------------------------------------------------------
  // 4. GET /api/laboratory/orders — Query Orders & Worklist
  // ---------------------------------------------------------------------------
  @Get('orders')
  @Roles(
    UserRole.DOCTOR,
    UserRole.LAB_TECHNICIAN,
    UserRole.NURSE,
    UserRole.PATIENT,
    UserRole.HOSPITAL_ADMIN,
    UserRole.SUPER_ADMIN,
  )
  @ApiOperation({ summary: 'List and filter laboratory orders and worklists' })
  async getOrders(
    @CurrentTenant() hospitalId: string,
    @CurrentUser() user: any,
    @Query() query: LabOrdersQueryDto,
  ) {
    return this.laboratoryService.getOrders(hospitalId, user, query);
  }

  // ---------------------------------------------------------------------------
  // 5. GET /api/laboratory/orders/:id — Order Details
  // ---------------------------------------------------------------------------
  @Get('orders/:id')
  @Roles(
    UserRole.DOCTOR,
    UserRole.LAB_TECHNICIAN,
    UserRole.NURSE,
    UserRole.PATIENT,
    UserRole.HOSPITAL_ADMIN,
    UserRole.SUPER_ADMIN,
  )
  @ApiOperation({ summary: 'Retrieve specific laboratory order with items and status' })
  async getOrderById(
    @CurrentTenant() hospitalId: string,
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    return this.laboratoryService.getOrderById(hospitalId, user, id);
  }

  // ---------------------------------------------------------------------------
  // 6. POST /api/laboratory/orders/:id/collect — Specimen Intake
  // ---------------------------------------------------------------------------
  @Post('orders/:id/collect')
  @HttpCode(HttpStatus.OK)
  @Roles(
    UserRole.LAB_TECHNICIAN,
    UserRole.NURSE,
    UserRole.HOSPITAL_ADMIN,
    UserRole.SUPER_ADMIN,
  )
  @ApiOperation({ summary: 'Record specimen collection and assign accession barcode' })
  async collectSpecimen(
    @CurrentTenant() hospitalId: string,
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CollectSpecimenDto,
  ) {
    return this.laboratoryService.collectSpecimen(hospitalId, user, id, dto);
  }

  // ---------------------------------------------------------------------------
  // 7. POST /api/laboratory/orders/:id/reject — Reject Specimen
  // ---------------------------------------------------------------------------
  @Post('orders/:id/reject')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.LAB_TECHNICIAN, UserRole.HOSPITAL_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Reject specimen due to hemolysis, clotting, or insufficient quantity' })
  async rejectSpecimen(
    @CurrentTenant() hospitalId: string,
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectSpecimenDto,
  ) {
    return this.laboratoryService.rejectSpecimen(hospitalId, user, id, dto);
  }

  // ---------------------------------------------------------------------------
  // 8. POST /api/laboratory/orders/:id/process — Start Analyzer Processing
  // ---------------------------------------------------------------------------
  @Post('orders/:id/process')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.LAB_TECHNICIAN, UserRole.HOSPITAL_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Mark specimen as actively undergoing analyzer analysis' })
  async startProcessing(
    @CurrentTenant() hospitalId: string,
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.laboratoryService.startProcessing(hospitalId, user, id);
  }

  // ---------------------------------------------------------------------------
  // 9. POST /api/laboratory/orders/:id/results — Enter Measurements
  // ---------------------------------------------------------------------------
  @Post('orders/:id/results')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.LAB_TECHNICIAN, UserRole.HOSPITAL_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Enter test measurements with server-side reference range calculation' })
  async enterResults(
    @CurrentTenant() hospitalId: string,
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EnterLabResultsDto,
  ) {
    return this.laboratoryService.enterResults(hospitalId, user, id, dto);
  }

  // ---------------------------------------------------------------------------
  // 10. POST /api/laboratory/orders/:id/approve — Pathologist Certification
  // ---------------------------------------------------------------------------
  @Post('orders/:id/approve')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.DOCTOR, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Certify and approve diagnostic report (clinical sign-off)' })
  async approveOrder(
    @CurrentTenant() hospitalId: string,
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveLabOrderDto,
  ) {
    return this.laboratoryService.approveOrder(hospitalId, user, id, dto);
  }

  // ---------------------------------------------------------------------------
  // 11. POST /api/laboratory/orders/:id/amend — Post-Approval Amendment
  // ---------------------------------------------------------------------------
  @Post('orders/:id/amend')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.DOCTOR, UserRole.HOSPITAL_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Submit audited amendment correction to an approved diagnostic report' })
  async amendResult(
    @CurrentTenant() hospitalId: string,
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AmendLabResultDto,
  ) {
    return this.laboratoryService.amendResult(hospitalId, user, id, dto);
  }

  // ---------------------------------------------------------------------------
  // 12. POST /api/laboratory/orders/:id/cancel — Cancel Order
  // ---------------------------------------------------------------------------
  @Post('orders/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.DOCTOR, UserRole.HOSPITAL_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Cancel an unfinalized diagnostic laboratory order' })
  async cancelOrder(
    @CurrentTenant() hospitalId: string,
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelLabOrderDto,
  ) {
    return this.laboratoryService.cancelOrder(hospitalId, user, id, dto);
  }

  // ---------------------------------------------------------------------------
  // 13. GET /api/laboratory/orders/:id/report — Diagnostic Report
  // ---------------------------------------------------------------------------
  @Get('orders/:id/report')
  @Roles(
    UserRole.DOCTOR,
    UserRole.LAB_TECHNICIAN,
    UserRole.NURSE,
    UserRole.PATIENT,
    UserRole.HOSPITAL_ADMIN,
    UserRole.SUPER_ADMIN,
  )
  @ApiOperation({ summary: 'Retrieve structured diagnostic report with certification details' })
  async getReport(
    @CurrentTenant() hospitalId: string,
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    return this.laboratoryService.getOrderById(hospitalId, user, id);
  }
}
