import { Controller, Get } from '@nestjs/common';
import { ReportsService } from './reports.service';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('revenue')
  revenue() {
    return this.reportsService.revenue();
  }

  @Get('appointments')
  appointments() {
    return this.reportsService.appointments();
  }

  @Get('patients')
  patients() {
    return this.reportsService.patients();
  }
}
