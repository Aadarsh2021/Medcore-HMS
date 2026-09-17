import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  Headers,
  UseGuards,
  Req,
  BadRequestException,
  UnauthorizedException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { BillingService } from './billing.service';
import { PaymentProviderService } from './payment-provider.service';
import {
  CreateInvoiceDto,
  UpdateInvoiceDraftDto,
  VoidInvoiceDto,
  RecordPaymentDto,
  CreateRefundDto,
  QueryInvoicesDto,
} from './dto';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { TenantGuard } from '../auth/guards/tenant.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@medcore/types';

@Controller('billing')
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly paymentProviderService: PaymentProviderService,
  ) {}

  @Post('invoices')
  @UseGuards(SupabaseAuthGuard, RolesGuard, TenantGuard)
  @Roles(UserRole.ACCOUNTANT, UserRole.HOSPITAL_ADMIN, UserRole.RECEPTIONIST, UserRole.SUPER_ADMIN)
  async createInvoice(
    @Req() req: any,
    @Headers('x-hospital-id') headerHospitalId: string,
    @Body() dto: CreateInvoiceDto,
  ) {
    const hospitalId = req.user?.hospitalId || headerHospitalId;
    return this.billingService.createInvoice(hospitalId, req.user, dto);
  }

  @Get('invoices')
  @UseGuards(SupabaseAuthGuard, RolesGuard, TenantGuard)
  @Roles(
    UserRole.ACCOUNTANT,
    UserRole.HOSPITAL_ADMIN,
    UserRole.RECEPTIONIST,
    UserRole.DOCTOR,
    UserRole.SUPER_ADMIN,
  )
  async getInvoices(
    @Req() req: any,
    @Headers('x-hospital-id') headerHospitalId: string,
    @Query() query: QueryInvoicesDto,
  ) {
    const hospitalId = req.user?.hospitalId || headerHospitalId;
    return this.billingService.getInvoices(hospitalId, query);
  }

  @Get('invoices/:id')
  @UseGuards(SupabaseAuthGuard, RolesGuard, TenantGuard)
  @Roles(
    UserRole.ACCOUNTANT,
    UserRole.HOSPITAL_ADMIN,
    UserRole.RECEPTIONIST,
    UserRole.DOCTOR,
    UserRole.PATIENT,
    UserRole.SUPER_ADMIN,
  )
  async getInvoiceById(
    @Req() req: any,
    @Headers('x-hospital-id') headerHospitalId: string,
    @Param('id') id: string,
  ) {
    const hospitalId = req.user?.hospitalId || headerHospitalId;
    return this.billingService.getInvoiceById(hospitalId, req.user, id);
  }

  @Put('invoices/:id')
  @UseGuards(SupabaseAuthGuard, RolesGuard, TenantGuard)
  @Roles(UserRole.ACCOUNTANT, UserRole.HOSPITAL_ADMIN, UserRole.RECEPTIONIST, UserRole.SUPER_ADMIN)
  async updateDraft(
    @Req() req: any,
    @Headers('x-hospital-id') headerHospitalId: string,
    @Param('id') id: string,
    @Body() dto: UpdateInvoiceDraftDto,
  ) {
    const hospitalId = req.user?.hospitalId || headerHospitalId;
    return this.billingService.updateDraft(hospitalId, req.user, id, dto);
  }

  @Post('invoices/:id/issue')
  @UseGuards(SupabaseAuthGuard, RolesGuard, TenantGuard)
  @Roles(UserRole.ACCOUNTANT, UserRole.HOSPITAL_ADMIN, UserRole.RECEPTIONIST, UserRole.SUPER_ADMIN)
  async issueInvoice(
    @Req() req: any,
    @Headers('x-hospital-id') headerHospitalId: string,
    @Param('id') id: string,
  ) {
    const hospitalId = req.user?.hospitalId || headerHospitalId;
    return this.billingService.issueInvoice(hospitalId, req.user, id);
  }

  @Post('invoices/:id/void')
  @UseGuards(SupabaseAuthGuard, RolesGuard, TenantGuard)
  @Roles(UserRole.ACCOUNTANT, UserRole.HOSPITAL_ADMIN, UserRole.SUPER_ADMIN)
  async voidInvoice(
    @Req() req: any,
    @Headers('x-hospital-id') headerHospitalId: string,
    @Param('id') id: string,
    @Body() dto: VoidInvoiceDto,
  ) {
    const hospitalId = req.user?.hospitalId || headerHospitalId;
    return this.billingService.voidInvoice(hospitalId, req.user, id, dto);
  }

  @Post('invoices/:id/payments')
  @UseGuards(SupabaseAuthGuard, RolesGuard, TenantGuard)
  @Roles(UserRole.ACCOUNTANT, UserRole.HOSPITAL_ADMIN, UserRole.RECEPTIONIST, UserRole.SUPER_ADMIN)
  async recordPayment(
    @Req() req: any,
    @Headers('x-hospital-id') headerHospitalId: string,
    @Headers('idempotency-key') headerIdempotencyKey: string | undefined,
    @Param('id') id: string,
    @Body() dto: RecordPaymentDto,
  ) {
    const hospitalId = req.user?.hospitalId || headerHospitalId;
    if (headerIdempotencyKey && !dto.idempotencyKey) {
      dto.idempotencyKey = headerIdempotencyKey;
    }
    return this.billingService.recordPayment(hospitalId, req.user, id, dto);
  }

  @Post('payments/:id/refund')
  @UseGuards(SupabaseAuthGuard, RolesGuard, TenantGuard)
  @Roles(UserRole.ACCOUNTANT, UserRole.HOSPITAL_ADMIN, UserRole.SUPER_ADMIN)
  async createRefund(
    @Req() req: any,
    @Headers('x-hospital-id') headerHospitalId: string,
    @Headers('idempotency-key') headerIdempotencyKey: string | undefined,
    @Param('id') id: string,
    @Body() dto: CreateRefundDto,
  ) {
    const hospitalId = req.user?.hospitalId || headerHospitalId;
    if (headerIdempotencyKey && !dto.idempotencyKey) {
      dto.idempotencyKey = headerIdempotencyKey;
    }
    return this.billingService.createRefund(hospitalId, req.user, id, dto);
  }

  @Get('patients/:patientId/invoices')
  @UseGuards(SupabaseAuthGuard, RolesGuard, TenantGuard)
  @Roles(
    UserRole.PATIENT,
    UserRole.ACCOUNTANT,
    UserRole.HOSPITAL_ADMIN,
    UserRole.DOCTOR,
    UserRole.SUPER_ADMIN,
  )
  async getPatientInvoices(
    @Req() req: any,
    @Headers('x-hospital-id') headerHospitalId: string,
    @Param('patientId') patientId: string,
  ) {
    const hospitalId = req.user?.hospitalId || headerHospitalId;
    return this.billingService.getInvoices(hospitalId, { patientId });
  }

  @Get('reports/summary')
  @UseGuards(SupabaseAuthGuard, RolesGuard, TenantGuard)
  @Roles(UserRole.ACCOUNTANT, UserRole.HOSPITAL_ADMIN, UserRole.SUPER_ADMIN)
  async getSummary(
    @Req() req: any,
    @Headers('x-hospital-id') headerHospitalId: string,
  ) {
    const hospitalId = req.user?.hospitalId || headerHospitalId;
    return this.billingService.getBillingSummary(hospitalId);
  }

  @Post('webhooks/:provider')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Param('provider') provider: string,
    @Headers('stripe-signature') stripeSig: string | undefined,
    @Headers('x-razorpay-signature') rzpSig: string | undefined,
    @Body() body: any,
  ) {
    const prov = provider.toUpperCase();
    const signature = prov === 'STRIPE' ? stripeSig : rzpSig;
    const rawBodyString = typeof body === 'string' ? body : JSON.stringify(body);

    const isValid = this.paymentProviderService.verifyWebhookSignature(
      prov,
      rawBodyString,
      signature,
    );

    if (!isValid) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    const parsedEvent = this.paymentProviderService.parseWebhook(prov, body);
    const { isDuplicate, eventRecordId } = await this.paymentProviderService.recordWebhookEvent(
      parsedEvent,
      rawBodyString,
    );

    if (isDuplicate) {
      return { status: 'IGNORED_DUPLICATE', eventId: parsedEvent.eventId };
    }

    return { status: 'RECEIVED', eventId: parsedEvent.eventId };
  }
}
