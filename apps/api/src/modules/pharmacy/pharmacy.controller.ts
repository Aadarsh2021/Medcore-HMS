import {
  Body,
  Controller,
  Get,
  Headers,
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
import { DispensingService } from './dispensing.service';
import { InventoryService } from './inventory.service';
import { ReceiptsService } from './receipts.service';
import { LedgerService } from './ledger.service';
import {
  AdjustStockDto,
  CreateStockReceiptDto,
  DispensePrescriptionDto,
  ExpiryReportQueryDto,
  InventoryQueryDto,
  PharmacyQueueQueryDto,
  QuarantineBatchDto,
  ReturnDispenseItemDto,
  StockMovementQueryDto,
} from './dto';

@ApiTags('Pharmacy & Inventory Management (Phase 7)')
@ApiBearerAuth('bearer-token')
@ApiHeader({
  name: 'X-Hospital-Id',
  required: false,
  description: 'Target hospital UUID override header for Super Admin operations',
})
@UseGuards(SupabaseAuthGuard, RolesGuard, TenantGuard)
@Controller('pharmacy')
export class PharmacyController {
  constructor(
    private readonly dispensingService: DispensingService,
    private readonly inventoryService: InventoryService,
    private readonly receiptsService: ReceiptsService,
    private readonly ledgerService: LedgerService,
  ) {}

  // ---------------------------------------------------------------------------
  // 1. GET /api/pharmacy/queue — Prescription Dispensing Queue
  // ---------------------------------------------------------------------------
  @Get('queue')
  @Roles(UserRole.PHARMACIST, UserRole.HOSPITAL_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Retrieve active outpatient prescriptions pending dispensing' })
  @ApiResponse({ status: 200, description: 'Pending and partially dispensed prescriptions' })
  async getQueue(
    @CurrentTenant() hospitalId: string,
    @Query() query: PharmacyQueueQueryDto,
  ) {
    return this.dispensingService.getQueue(hospitalId, query);
  }

  // ---------------------------------------------------------------------------
  // 2. GET /api/pharmacy/prescriptions/:id/dispense-plan — Preview FEFO Allocation
  // ---------------------------------------------------------------------------
  @Get('prescriptions/:id/dispense-plan')
  @Roles(UserRole.PHARMACIST, UserRole.HOSPITAL_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Preview authoritative FEFO batch allocation for a prescription' })
  @ApiParam({ name: 'id', description: 'Prescription UUID' })
  @ApiResponse({ status: 200, description: 'Deterministic batch allocation proposals' })
  async getDispensePlan(
    @CurrentTenant() hospitalId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.dispensingService.getDispensePlan(hospitalId, id);
  }

  // ---------------------------------------------------------------------------
  // 3. POST /api/pharmacy/prescriptions/:id/dispense — Atomic Fulfillment Mutation
  // ---------------------------------------------------------------------------
  @Post('prescriptions/:id/dispense')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.PHARMACIST, UserRole.HOSPITAL_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Execute row-locked prescription dispensing and deduct batch inventory' })
  @ApiParam({ name: 'id', description: 'Prescription UUID' })
  @ApiResponse({ status: 201, description: 'Prescription successfully dispensed' })
  @ApiResponse({ status: 409, description: 'Stock exhaustion or prescription status conflict' })
  @ApiResponse({ status: 422, description: 'Attempted dispensing of expired or quarantined batch' })
  async dispense(
    @CurrentTenant() hospitalId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DispensePrescriptionDto,
    @CurrentUser() user: any,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.dispensingService.dispense(hospitalId, id, dto, user.id, idempotencyKey);
  }

  // ---------------------------------------------------------------------------
  // 4. POST /api/pharmacy/returns — Safe Dispense Return & Stock Restoration
  // ---------------------------------------------------------------------------
  @Post('returns')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.PHARMACIST, UserRole.HOSPITAL_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Return previously dispensed medication and restore batch inventory' })
  @ApiResponse({ status: 200, description: 'Medication returned and stock restored' })
  @ApiResponse({ status: 400, description: 'Return quantity exceeds dispensed balance' })
  async returnDispense(
    @CurrentTenant() hospitalId: string,
    @Body() dto: ReturnDispenseItemDto,
    @CurrentUser() user: any,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.dispensingService.returnDispense(hospitalId, dto, user.id, idempotencyKey);
  }

  // ---------------------------------------------------------------------------
  // 5. POST /api/pharmacy/stock-receipts — Goods Receipt Note (GRN) Intake
  // ---------------------------------------------------------------------------
  @Post('stock-receipts')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.PHARMACIST, UserRole.HOSPITAL_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Process supplier shipment receipt, register batches, and commit ledger intake' })
  @ApiResponse({ status: 201, description: 'Stock receipt created and inventory updated' })
  @ApiResponse({ status: 409, description: 'Duplicate supplier invoice detected' })
  async createStockReceipt(
    @CurrentTenant() hospitalId: string,
    @Body() dto: CreateStockReceiptDto,
    @CurrentUser() user: any,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.receiptsService.createStockReceipt(hospitalId, dto, user.id, idempotencyKey);
  }

  // ---------------------------------------------------------------------------
  // 6. GET /api/pharmacy/inventory — Formulary Stock Aggregation
  // ---------------------------------------------------------------------------
  @Get('inventory')
  @Roles(UserRole.PHARMACIST, UserRole.HOSPITAL_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Retrieve catalog medicines with real-time stock levels and reorder alerts' })
  @ApiResponse({ status: 200, description: 'Aggregated inventory overview' })
  async getInventory(
    @CurrentTenant() hospitalId: string,
    @Query() query: InventoryQueryDto,
  ) {
    return this.inventoryService.getInventory(hospitalId, query);
  }

  // ---------------------------------------------------------------------------
  // 6b. GET /api/pharmacy/batches — Hospital-wide Physical Batches
  // ---------------------------------------------------------------------------
  @Get('batches')
  @Roles(UserRole.PHARMACIST, UserRole.HOSPITAL_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Retrieve physical batches across all medicines or filtered by medicineId' })
  @ApiQuery({ name: 'medicineId', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Physical batch records with expiry and quarantine status' })
  async getAllBatches(
    @CurrentTenant() hospitalId: string,
    @Query('medicineId') medicineId?: string,
  ) {
    return this.inventoryService.getBatches(hospitalId, medicineId);
  }

  // ---------------------------------------------------------------------------
  // 7. GET /api/pharmacy/medicines/:id/batches — Physical Batch Registry
  // ---------------------------------------------------------------------------
  @Get('medicines/:id/batches')
  @Roles(UserRole.PHARMACIST, UserRole.HOSPITAL_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Retrieve physical batches for a catalog medicine' })
  @ApiParam({ name: 'id', description: 'Medicine UUID' })
  @ApiResponse({ status: 200, description: 'Physical batch records with expiry and quarantine status' })
  async getBatches(
    @CurrentTenant() hospitalId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.inventoryService.getBatches(hospitalId, id);
  }

  // ---------------------------------------------------------------------------
  // 8. POST /api/pharmacy/batches/:id/quarantine — Quarantine State Toggle
  // ---------------------------------------------------------------------------
  @Post('batches/:id/quarantine')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.PHARMACIST, UserRole.HOSPITAL_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Toggle quarantine state for a physical batch with audit justification' })
  @ApiParam({ name: 'id', description: 'MedicineBatch UUID' })
  @ApiResponse({ status: 200, description: 'Quarantine status updated' })
  async toggleQuarantine(
    @CurrentTenant() hospitalId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: QuarantineBatchDto,
    @CurrentUser() user: any,
  ) {
    return this.inventoryService.toggleQuarantine(hospitalId, id, dto, user.id);
  }

  // ---------------------------------------------------------------------------
  // 9. POST /api/pharmacy/batches/:id/adjust — Physical Stock Adjustment
  // ---------------------------------------------------------------------------
  @Post('batches/:id/adjust')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.PHARMACIST, UserRole.HOSPITAL_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Record inventory reconciliation, damage write-off, or physical adjustment' })
  @ApiParam({ name: 'id', description: 'MedicineBatch UUID' })
  @ApiResponse({ status: 200, description: 'Inventory adjustment recorded in ledger' })
  @ApiResponse({ status: 400, description: 'Insufficient stock for deduction' })
  async adjustStock(
    @CurrentTenant() hospitalId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdjustStockDto,
    @CurrentUser() user: any,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.inventoryService.adjustStock(hospitalId, id, dto, user.id, idempotencyKey);
  }

  // ---------------------------------------------------------------------------
  // 10. GET /api/pharmacy/reports/expiry — Expiry Thresholds Report
  // ---------------------------------------------------------------------------
  @Get('reports/expiry')
  @Roles(UserRole.PHARMACIST, UserRole.HOSPITAL_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Retrieve batches categorized by expiration thresholds' })
  @ApiResponse({ status: 200, description: 'Batches grouped by expiry brackets' })
  async getExpiryReport(
    @CurrentTenant() hospitalId: string,
    @Query() query: ExpiryReportQueryDto,
  ) {
    return this.inventoryService.getExpiryReport(hospitalId, query);
  }

  // ---------------------------------------------------------------------------
  // 11. GET /api/pharmacy/stock-movements — Append-Only Ledger History
  // ---------------------------------------------------------------------------
  @Get('stock-movements')
  @Roles(UserRole.PHARMACIST, UserRole.HOSPITAL_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Query the append-only stock movement audit ledger' })
  @ApiResponse({ status: 200, description: 'Chronological inventory movement entries' })
  async getStockMovements(
    @CurrentTenant() hospitalId: string,
    @Query() query: StockMovementQueryDto,
  ) {
    return this.ledgerService.getMovements(hospitalId, query);
  }
}
