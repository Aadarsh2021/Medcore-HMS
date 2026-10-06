import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { PatientsModule } from './modules/patients/patients.module';
import { DoctorsModule } from './modules/doctors/doctors.module';
import { AppointmentsModule } from './modules/appointments/appointments.module';
import { EncountersModule } from './modules/encounters/encounters.module';
import { MedicalRecordsModule } from './modules/medical-records/medical-records.module';
import { MedicinesModule } from './modules/medicines/medicines.module';
import { PrescriptionsModule } from './modules/prescriptions/prescriptions.module';
import { PharmacyModule } from './modules/pharmacy/pharmacy.module';
import { LaboratoryModule } from './modules/laboratory/laboratory.module';
import { BillingModule } from './modules/billing/billing.module';
import { TriageModule } from './modules/triage/triage.module';
import { HospitalsModule } from './modules/hospitals/hospitals.module';
import { DepartmentsModule } from './modules/departments/departments.module';
import { RoomsBedsModule } from './modules/rooms-beds/rooms-beds.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AuditModule } from './modules/audit/audit.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { StorageModule } from './common/storage/storage.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { ClinicalDictionaryModule } from './modules/clinical-dictionary/clinical-dictionary.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { HealthModule } from './modules/health/health.module';
import { TenantContextInterceptor } from './common/interceptors/tenant-context.interceptor';
import { CorrelationLoggingInterceptor } from './common/interceptors/correlation-logging.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '.env'],
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: config.get<number>('THROTTLE_TTL', 60000),
          limit: config.get<number>('THROTTLE_LIMIT', 100),
        },
      ],
    }),
    DatabaseModule,
    HealthModule,
    StorageModule,
    RealtimeModule,
    ClinicalDictionaryModule,
    AnalyticsModule,
    AuthModule,
    HospitalsModule,
    DepartmentsModule,
    RoomsBedsModule,
    NotificationsModule,
    AuditModule,
    JobsModule,
    PatientsModule,
    DoctorsModule,
    AppointmentsModule,
    EncountersModule,
    MedicalRecordsModule,
    MedicinesModule,
    PrescriptionsModule,
    PharmacyModule,
    LaboratoryModule,
    BillingModule,
    TriageModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TenantContextInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: CorrelationLoggingInterceptor,
    },
  ],
})
export class AppModule {}
