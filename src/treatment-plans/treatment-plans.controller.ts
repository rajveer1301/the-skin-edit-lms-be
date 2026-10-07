import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateTreatmentPlanDto } from './dto/create-treatment-plan.dto';
import { DeclinePlanDto } from './dto/decline-plan.dto';
import { RescheduleSittingDto } from './dto/reschedule-sitting.dto';
import { TreatmentPlanQueryDto } from './dto/treatment-plan-query.dto';
import { UpdateTreatmentPlanDto } from './dto/update-treatment-plan.dto';
import { TreatmentPlansService } from './treatment-plans.service';

@Controller('treatment-plans')
export class TreatmentPlansController {
  constructor(private readonly plans: TreatmentPlansService) {}

  @Get()
  findAll(@Query() query: TreatmentPlanQueryDto) {
    return this.plans.findAll(query);
  }

  @Get('follow-ups')
  followUps() {
    return this.plans.followUps();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.plans.findOne(id);
  }

  @Roles(Role.ADMIN, Role.DOCTOR, Role.THERAPIST, Role.RECEPTIONIST)
  @Post()
  create(@Body() dto: CreateTreatmentPlanDto) {
    return this.plans.create(dto);
  }

  @Roles(Role.ADMIN, Role.DOCTOR, Role.THERAPIST, Role.RECEPTIONIST)
  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTreatmentPlanDto) {
    return this.plans.update(id, dto);
  }

  @Roles(Role.ADMIN, Role.DOCTOR, Role.THERAPIST)
  @Post(':id/accept')
  accept(@Param('id') id: string) {
    return this.plans.accept(id);
  }

  @Roles(Role.ADMIN, Role.DOCTOR, Role.THERAPIST, Role.RECEPTIONIST)
  @Post(':id/decline')
  decline(@Param('id') id: string, @Body() dto: DeclinePlanDto) {
    return this.plans.decline(id, dto);
  }

  @Roles(Role.ADMIN, Role.DOCTOR, Role.THERAPIST, Role.RECEPTIONIST)
  @Post(':id/sittings/:sittingId/reschedule')
  reschedule(
    @Param('id') id: string,
    @Param('sittingId') sittingId: string,
    @Body() dto: RescheduleSittingDto,
  ) {
    return this.plans.reschedule(id, sittingId, dto);
  }
}
