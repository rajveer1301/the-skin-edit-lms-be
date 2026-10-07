import { serializable } from '../common/utils/transaction';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
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
    if (dto.status === LeadStatus.CONVERTED)
      throw new BadRequestException('Use the lead conversion endpoint');
    const lead = await this.prisma.lead.create({
      data: dto,
      include: LEAD_INCLUDE,
    });
    return mapLead(lead);
  }

  async update(id: string, dto: UpdateLeadDto): Promise<LeadDto> {
    const current = await this.prisma.lead.findUniqueOrThrow({ where: { id } });
    if (dto.status === LeadStatus.CONVERTED && !current.convertedPatientId)
      throw new BadRequestException('Use the lead conversion endpoint');
    if (
      current.convertedPatientId &&
      dto.status &&
      dto.status !== LeadStatus.CONVERTED
    )
      throw new BadRequestException(
        'Converted leads must retain their conversion status',
      );
    const lead = await this.prisma.lead.update({
      where: { id },
      data: dto,
      include: LEAD_INCLUDE,
    });
    return mapLead(lead);
  }

  async updateStatus(id: string, status: LeadStatus): Promise<LeadDto> {
    return this.update(id, { status });
  }

  async remove(id: string): Promise<{ success: boolean }> {
    await this.ensureExists(id);
    await this.prisma.lead.delete({ where: { id } });
    return { success: true };
  }

  async convert(id: string, dto: ConvertLeadDto): Promise<PatientDto> {
    const patient = await serializable(this.prisma, async (tx) => {
      const lead = await tx.lead.findUnique({ where: { id } });
      if (!lead) throw new NotFoundException('Lead not found');
      if (lead.convertedPatientId)
        return tx.patient.findUniqueOrThrow({
          where: { id: lead.convertedPatientId },
        });
      // Also handle legacy rows whose patient link was already recorded.
      const existing = await tx.patient.findFirst({ where: { leadId: id } });
      if (existing) {
        await tx.lead.update({
          where: { id },
          data: {
            status: LeadStatus.CONVERTED,
            convertedPatientId: existing.id,
          },
        });
        return existing;
      }
      const created = await tx.patient.create({
        data: {
          firstName: lead.firstName,
          lastName: lead.lastName,
          gender: dto.gender ?? lead.gender ?? Gender.OTHER,
          phone: lead.phone,
          whatsapp: lead.whatsapp,
          email: lead.email,
          city: lead.city,
          leadId: lead.id,
          allergies: [],
          skinConcerns: [],
          hairConcerns: [],
          wellnessConcerns: [],
          notes: `Converted from lead. Interested in: ${lead.interestedIn ?? '-'}`,
        },
      });
      await tx.lead.update({
        where: { id },
        data: { status: LeadStatus.CONVERTED, convertedPatientId: created.id },
      });
      return created;
    });
    return mapPatient(patient);
  }

  private async ensureExists(id: string): Promise<void> {
    const count = await this.prisma.lead.count({ where: { id } });
    if (!count) {
      throw new NotFoundException('Lead not found');
    }
  }
}
