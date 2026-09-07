import { Module } from '@nestjs/common';
import { PharmacyController } from './pharmacy.controller';
import { DispensingService } from './dispensing.service';
import { InventoryService } from './inventory.service';
import { ReceiptsService } from './receipts.service';
import { LedgerService } from './ledger.service';
import { IdempotencyService } from './idempotency.service';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [PharmacyController],
  providers: [
    DispensingService,
    InventoryService,
    ReceiptsService,
    LedgerService,
    IdempotencyService,
  ],
  exports: [
    DispensingService,
    InventoryService,
    ReceiptsService,
    LedgerService,
    IdempotencyService,
  ],
})
export class PharmacyModule {}
