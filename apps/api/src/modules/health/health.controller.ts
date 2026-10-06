import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Public } from '../auth/decorators/public.decorator';

@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('health')
  @Public()
  getLiveness() {
    return {
      status: 'ok',
      service: 'medcore-api',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  @Public()
  async getReadiness() {
    try {
      // 1. Verify PostgreSQL connection
      await this.prisma.raw.$queryRawUnsafe('SELECT 1');

      return {
        status: 'ok',
        database: 'connected',
        timestamp: new Date().toISOString(),
      };
    } catch (err: any) {
      throw new ServiceUnavailableException({
        status: 'error',
        database: 'disconnected',
        error: err.message,
      });
    }
  }
}
