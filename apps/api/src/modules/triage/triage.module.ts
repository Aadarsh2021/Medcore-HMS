import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { RoomsBedsModule } from '../rooms-beds/rooms-beds.module';
import { TriageController } from './triage.controller';
import { TriageService } from './triage.service';

@Module({
  imports: [DatabaseModule, RoomsBedsModule],
  controllers: [TriageController],
  providers: [TriageService],
  exports: [TriageService],
})
export class TriageModule {}
