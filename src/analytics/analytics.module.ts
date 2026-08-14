import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  controllers: [DashboardController, ReportsController],
  providers: [DashboardService, ReportsService],
})
export class AnalyticsModule {}
