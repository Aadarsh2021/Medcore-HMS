import { Module } from '@nestjs/common';
import { DoctorsController } from './doctors.controller';
import { DoctorsService } from './doctors.service';
import { SchedulingService } from './scheduling.service';

@Module({
  controllers: [DoctorsController],
  providers: [DoctorsService, SchedulingService],
  exports: [DoctorsService, SchedulingService],
})
export class DoctorsModule {}
