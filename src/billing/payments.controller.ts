import { Body, Controller, Get, Param, Put, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { BillingService } from './billing.service';
import { InvoiceQueryDto } from './dto/invoice-query.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly billingService: BillingService) {}

  @Get()
  findAll(@Query() query: InvoiceQueryDto) {
    return this.billingService.allPayments(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.billingService.findPaymentReceipt(id);
  }

  @Roles(Role.ADMIN, Role.ACCOUNTANT, Role.RECEPTIONIST)
  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePaymentDto) {
    return this.billingService.updatePayment(id, dto);
  }
}
