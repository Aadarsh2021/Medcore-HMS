import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { PrescriptionsService } from './prescriptions.service';
import { PrescriptionsController } from './prescriptions.controller';
import { PrescriptionPdfService } from './prescription-pdf.service';

@Module({
  imports: [DatabaseModule],
  controllers: [PrescriptionsController],
  providers: [PrescriptionsService, PrescriptionPdfService],
  exports: [PrescriptionsService, PrescriptionPdfService],
})
export class PrescriptionsModule {}
