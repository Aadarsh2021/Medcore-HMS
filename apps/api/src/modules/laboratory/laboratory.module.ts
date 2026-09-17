import { Module } from '@nestjs/common';
import { LaboratoryController } from './laboratory.controller';
import { LaboratoryService } from './laboratory.service';
import { OrderNumberService } from './order-number.service';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [LaboratoryController],
  providers: [LaboratoryService, OrderNumberService],
  exports: [LaboratoryService, OrderNumberService],
})
export class LaboratoryModule {}
