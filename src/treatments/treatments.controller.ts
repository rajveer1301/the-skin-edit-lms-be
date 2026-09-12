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
import { CreateTreatmentDto } from './dto/create-treatment.dto';
import { TreatmentQueryDto } from './dto/treatment-query.dto';
import { UpdateTreatmentDto } from './dto/update-treatment.dto';
import { TreatmentsService } from './treatments.service';

@Controller('treatments')
export class TreatmentsController {
  constructor(private readonly treatmentsService: TreatmentsService) {}

  @Get()
  findAll(@Query() query: TreatmentQueryDto) {
    return this.treatmentsService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.treatmentsService.findOne(id);
  }

  @Roles(Role.ADMIN, Role.DOCTOR, Role.THERAPIST)
  @Post()
  create(@Body() dto: CreateTreatmentDto) {
    return this.treatmentsService.create(dto);
  }

  @Roles(Role.ADMIN, Role.DOCTOR, Role.THERAPIST)
  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTreatmentDto) {
    return this.treatmentsService.update(id, dto);
  }

  @Roles(Role.ADMIN, Role.DOCTOR, Role.THERAPIST)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.treatmentsService.remove(id);
  }
}
