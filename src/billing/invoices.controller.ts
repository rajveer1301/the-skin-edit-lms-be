import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { BillingService } from './billing.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { InvoiceQueryDto } from './dto/invoice-query.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';

@Controller('invoices')
export class InvoicesController {
  constructor(private readonly billingService: BillingService) {}

  @Get()
  findAll(@Query() query: InvoiceQueryDto) {
    return this.billingService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.billingService.findOne(id);
  }

  @Roles(Role.ADMIN, Role.ACCOUNTANT, Role.RECEPTIONIST)
  @Post()
  create(@Body() dto: CreateInvoiceDto) {
    return this.billingService.create(dto);
  }

  @Roles(Role.ADMIN, Role.ACCOUNTANT, Role.RECEPTIONIST)
  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateInvoiceDto) {
    return this.billingService.update(id, dto);
  }

  @Roles(Role.ADMIN, Role.ACCOUNTANT)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.billingService.remove(id);
  }

  @Roles(Role.ADMIN, Role.ACCOUNTANT, Role.RECEPTIONIST)
  @Post(':id/payments')
  addPayment(@Param('id') id: string, @Body() dto: CreatePaymentDto) {
    return this.billingService.addPayment(id, dto);
  }
}
