import { Module } from '@nestjs/common';
import { RoomsBedsController } from './rooms-beds.controller';
import { RoomsBedsService } from './rooms-beds.service';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [RoomsBedsController],
  providers: [RoomsBedsService],
  exports: [RoomsBedsService],
})
export class RoomsBedsModule {}
