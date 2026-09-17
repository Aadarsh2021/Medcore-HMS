import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { InvoiceNumberService } from './invoice-number.service';
import { IdempotencyService } from './idempotency.service';
import { PaymentProviderService } from './payment-provider.service';

@Module({
  imports: [DatabaseModule],
  controllers: [BillingController],
  providers: [
    BillingService,
    InvoiceNumberService,
    IdempotencyService,
    PaymentProviderService,
  ],
  exports: [
    BillingService,
    InvoiceNumberService,
    IdempotencyService,
    PaymentProviderService,
  ],
})
export class BillingModule {}
