import { Injectable, NotFoundException } from '@nestjs/common';
import { Gender, LeadStatus, Prisma } from '@prisma/client';
import { Paginated } from '../common/interfaces/paginated.interface';
import { getPageParams, paginated } from '../common/utils/pagination';
import { mapPatient, PatientDto } from '../patients/patient.mapper';
import { PrismaService } from '../prisma/prisma.service';
import { ConvertLeadDto } from './dto/convert-lead.dto';
import { CreateLeadDto } from './dto/create-lead.dto';
import { LeadQueryDto } from './dto/lead-query.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { LEAD_INCLUDE, LeadDto, mapLead } from './lead.mapper';

@Injectable()
export class LeadsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: LeadQueryDto): Promise<Paginated<LeadDto>> {
    const params = getPageParams(query);
    const where: Prisma.LeadWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { firstName: { contains: query.search, mode: 'insensitive' } },
        { lastName: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search, mode: 'insensitive' } },
        { interestedIn: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    const [rows, total] = await Promise.all([
      this.prisma.lead.findMany({
        where,
        include: LEAD_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: params.skip,
        take: params.take,
      }),
      this.prisma.lead.count({ where }),
    ]);
    return paginated(rows.map(mapLead), total, params);
  }

  async findOne(id: string): Promise<LeadDto> {
    const lead = await this.prisma.lead.findUnique({
      where: { id },
      include: LEAD_INCLUDE,
    });
    if (!lead) {
      throw new NotFoundException('Lead not found');
    }
    return mapLead(lead);
  }

  async create(dto: CreateLeadDto): Promise<LeadDto> {
    const lead = await this.prisma.lead.create({
      data: dto,
      include: LEAD_INCLUDE,
    });
    return mapLead(lead);
  }

  async update(id: string, dto: UpdateLeadDto): Promise<LeadDto> {
    await this.ensureExists(id);
    const lead = await this.prisma.lead.update({
      where: { id },
      data: dto,
      include: LEAD_INCLUDE,
    });
    return mapLead(lead);
  }

  async updateStatus(id: string, status: LeadStatus): Promise<LeadDto> {
    await this.ensureExists(id);
    const lead = await this.prisma.lead.update({
      where: { id },
      data: { status },
      include: LEAD_INCLUDE,
    });
    return mapLead(lead);
  }

  async remove(id: string): Promise<{ success: boolean }> {
    await this.ensureExists(id);
    await this.prisma.lead.delete({ where: { id } });
    return { success: true };
  }

  async convert(id: string, dto: ConvertLeadDto): Promise<PatientDto> {
    const lead = await this.prisma.lead.findUnique({ where: { id } });
    if (!lead) {
      throw new NotFoundException('Lead not found');
    }
    const [, patient] = await this.prisma.$transaction([
      this.prisma.lead.update({
        where: { id },
        data: { status: LeadStatus.CONVERTED },
      }),
      this.prisma.patient.create({
        data: {
          firstName: lead.firstName,
          lastName: lead.lastName,
          gender: dto.gender ?? Gender.OTHER,
          phone: lead.phone,
          email: lead.email,
          allergies: [],
          skinConcerns: [],
          hairConcerns: [],
          notes: `Converted from lead. Interested in: ${lead.interestedIn ?? '-'}`,
        },
      }),
    ]);
    return mapPatient(patient);
  }

  private async ensureExists(id: string): Promise<void> {
    const count = await this.prisma.lead.count({ where: { id } });
    if (!count) {
      throw new NotFoundException('Lead not found');
    }
  }
}
