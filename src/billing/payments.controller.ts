import { Controller, Get, Query } from '@nestjs/common';
import { BillingService } from './billing.service';
import { InvoiceQueryDto } from './dto/invoice-query.dto';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly billingService: BillingService) {}

  @Get()
  findAll(@Query() query: InvoiceQueryDto) {
    return this.billingService.allPayments(query);
  }
}
