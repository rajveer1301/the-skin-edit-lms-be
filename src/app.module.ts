import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { AnalyticsModule } from './analytics/analytics.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { AuthModule } from './auth/auth.module';
import { BillingModule } from './billing/billing.module';
import { CouponsModule } from './coupons/coupons.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { DriveSyncModule } from './drive-sync/drive-sync.module';
import { GoogleDriveModule } from './google-drive/google-drive.module';
import { HealthController } from './health.controller';
import { InventoryModule } from './inventory/inventory.module';
import { LeadsModule } from './leads/leads.module';
import { PatientsModule } from './patients/patients.module';
import { PrismaModule } from './prisma/prisma.module';
import { ServicesModule } from './services/services.module';
import { StaffModule } from './staff/staff.module';
import { StorageModule } from './storage/storage.module';
import { TreatmentsModule } from './treatments/treatments.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    StorageModule,
    GoogleDriveModule,
    AuthModule,
    PatientsModule,
    AppointmentsModule,
    ServicesModule,
    TreatmentsModule,
    BillingModule,
    CouponsModule,
    StaffModule,
    InventoryModule,
    LeadsModule,
    AnalyticsModule,
    DriveSyncModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
