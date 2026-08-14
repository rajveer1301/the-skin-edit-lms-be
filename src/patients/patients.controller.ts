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
import { ListQueryDto } from '../common/dto/list-query.dto';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { PatientsService } from './patients.service';

@Controller('patients')
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  @Get()
  findAll(@Query() query: ListQueryDto) {
    return this.patientsService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.patientsService.findOne(id);
  }

  @Roles(Role.ADMIN, Role.DOCTOR, Role.RECEPTIONIST)
  @Post()
  create(@Body() dto: CreatePatientDto) {
    return this.patientsService.create(dto);
  }

  @Roles(Role.ADMIN, Role.DOCTOR, Role.RECEPTIONIST)
  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePatientDto) {
    return this.patientsService.update(id, dto);
  }

  @Roles(Role.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.patientsService.remove(id);
  }

  @Get(':id/appointments')
  appointments(@Param('id') id: string, @Query() query: ListQueryDto) {
    return this.patientsService.appointments(id, query);
  }

  @Get(':id/treatments')
  treatments(@Param('id') id: string, @Query() query: ListQueryDto) {
    return this.patientsService.treatments(id, query);
  }

  @Get(':id/invoices')
  invoices(@Param('id') id: string, @Query() query: ListQueryDto) {
    return this.patientsService.invoices(id, query);
  }

  @Get(':id/documents')
  documents(@Param('id') id: string, @Query() query: ListQueryDto) {
    return this.patientsService.documents(id, query);
  }
}
