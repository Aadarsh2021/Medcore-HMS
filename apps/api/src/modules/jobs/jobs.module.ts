import { Module } from '@nestjs/common';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { JobsQueueService } from './jobs-queue.service';
import { JobsWorkerService } from './jobs-worker.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [DatabaseModule, NotificationsModule],
  controllers: [JobsController],
  providers: [JobsQueueService, JobsWorkerService, JobsService],
  exports: [JobsQueueService, JobsWorkerService, JobsService],
})
export class JobsModule {}
