import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { DoctorsModule } from '../doctors/doctors.module';
import { AppointmentsService } from './appointments.service';
import { AppointmentsController } from './appointments.controller';

@Module({
  imports: [
    DatabaseModule,
    DoctorsModule, // provides SchedulingService
  ],
  providers: [AppointmentsService],
  controllers: [AppointmentsController],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}
