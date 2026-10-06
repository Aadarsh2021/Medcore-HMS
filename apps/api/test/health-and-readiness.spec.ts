import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../src/database/database.module';
import { PrismaService } from '../src/database/prisma.service';
import { HealthController } from '../src/modules/health/health.controller';

describe('Phase 24 — Health Checks & Readiness Probes Suite', () => {
  let moduleRef: TestingModule;
  let healthController: HealthController;
  let prisma: PrismaService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        DatabaseModule,
      ],
      controllers: [HealthController],
    }).compile();

    healthController = moduleRef.get<HealthController>(HealthController);
    prisma = moduleRef.get<PrismaService>(PrismaService);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('1. should return liveness status OK with uptime metrics', () => {
    const liveness = healthController.getLiveness();
    expect(liveness.status).toBe('ok');
    expect(liveness.service).toBe('medcore-api');
    expect(typeof liveness.uptime).toBe('number');
    expect(liveness.uptime).toBeGreaterThanOrEqual(0);
    expect(liveness.timestamp).toBeDefined();
  });

  it('2. should verify database connectivity on readiness probe', async () => {
    const readiness = await healthController.getReadiness();
    expect(readiness.status).toBe('ok');
    expect(readiness.database).toBe('connected');
    expect(readiness.timestamp).toBeDefined();
  });
});
