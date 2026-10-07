import { clinicDay, clinicMidnight } from '../common/utils/dates';
import { money } from '../common/utils/money';
import { Injectable } from '@nestjs/common';
import {
  AppointmentStatus,
  LeadSource,
  LeadStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { lastSixMonths, RevenuePoint } from './analytics.util';

export interface StatusCount {
  status: string;
  count: number;
}

export interface RevenueReport {
  series: RevenuePoint[];
  totalRevenue: number;
  totalCollected: number;
  totalOutstanding: number;
}

export interface AppointmentsReport {
  byStatus: StatusCount[];
  byService: RevenuePoint[];
  byCategory: RevenuePoint[];
  noShowRate: number;
  total: number;
}

export interface PatientsReport {
  bySource: RevenuePoint[];
  newByMonth: RevenuePoint[];
  leadConversionPercent: number;
  total: number;
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async revenue(): Promise<RevenueReport> {
    const buckets = lastSixMonths();
    const start = `${buckets[0].year}-${String(buckets[0].month + 1).padStart(2, '0')}-01`;
    const end = this.nextMonth();
    const [invoices, payments] = await Promise.all([
      this.prisma.invoice.aggregate({
        where: { status: { notIn: ['DRAFT', 'CANCELLED'] } },
        _sum: { total: true, amountPaid: true },
      }),
      this.prisma.$queryRaw<{ month: string; amount: number }[]>(Prisma.sql`
        SELECT substring(p."date", 1, 7) AS month, SUM(p."amount")::double precision AS amount
        FROM "Payment" p JOIN "Invoice" i ON i.id = p."invoiceId"
        WHERE p."date" >= ${start} AND p."date" < ${end} AND i.status NOT IN ('DRAFT', 'CANCELLED')
        GROUP BY substring(p."date", 1, 7)`),
    ]);
    const byMonth = new Map(payments.map((p) => [p.month, p.amount]));
    const totalRevenue = money(invoices._sum.total ?? 0);
    const totalCollected = money(invoices._sum.amountPaid ?? 0);
    return {
      series: buckets.map((b) => ({
        label: b.label,
        value: money(
          byMonth.get(`${b.year}-${String(b.month + 1).padStart(2, '0')}`) ?? 0,
        ),
      })),
      totalRevenue,
      totalCollected,
      totalOutstanding: money(totalRevenue - totalCollected),
    };
  }

  async appointments(): Promise<AppointmentsReport> {
    const [groups, services] = await Promise.all([
      this.prisma.appointment.groupBy({
        by: ['status', 'serviceId'],
        _count: { _all: true },
      }),
      this.prisma.clinicService.findMany({
        select: { id: true, name: true, category: true },
      }),
    ]);
    const statusCounts = new Map<string, number>();
    const serviceCounts = new Map<string, number>();
    let total = 0;
    for (const group of groups) {
      const count = group._count._all;
      total += count;
      statusCounts.set(
        group.status,
        (statusCounts.get(group.status) ?? 0) + count,
      );
      if (group.serviceId)
        serviceCounts.set(
          group.serviceId,
          (serviceCounts.get(group.serviceId) ?? 0) + count,
        );
    }
    const categories = new Map<string, number>();
    for (const service of services)
      categories.set(
        service.category,
        (categories.get(service.category) ?? 0) +
          (serviceCounts.get(service.id) ?? 0),
      );
    return {
      byStatus: Object.values(AppointmentStatus).map((status) => ({
        status,
        count: statusCounts.get(status) ?? 0,
      })),
      byService: services
        .map((s) => ({ label: s.name, value: serviceCounts.get(s.id) ?? 0 }))
        .filter((s) => s.value > 0),
      byCategory: [...categories].map(([label, value]) => ({ label, value })),
      noShowRate: total
        ? Math.round(
            ((statusCounts.get(AppointmentStatus.NO_SHOW) ?? 0) / total) * 100,
          )
        : 0,
      total,
    };
  }

  async patients(): Promise<PatientsReport> {
    const buckets = lastSixMonths();
    const start = clinicMidnight(
      `${buckets[0].year}-${String(buckets[0].month + 1).padStart(2, '0')}-01`,
    );
    const end = clinicMidnight(this.nextMonth());
    const zone = process.env.CLINIC_TIMEZONE || 'Asia/Kolkata';
    const [leads, months, total] = await Promise.all([
      this.prisma.lead.groupBy({
        by: ['source', 'status'],
        _count: { _all: true },
      }),
      this.prisma.$queryRaw<{ month: string; count: number }[]>(Prisma.sql`
        SELECT to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${zone}, 'YYYY-MM') AS month, COUNT(*)::integer AS count
        FROM "Patient" WHERE "createdAt" >= ${start} AND "createdAt" < ${end}
        GROUP BY 1`),
      this.prisma.patient.count(),
    ]);
    const counts = new Map(months.map((m) => [m.month, m.count]));
    const sources = new Map<string, number>();
    let leadCount = 0,
      converted = 0;
    for (const lead of leads) {
      leadCount += lead._count._all;
      if (lead.status === LeadStatus.CONVERTED) converted += lead._count._all;
      sources.set(
        lead.source,
        (sources.get(lead.source) ?? 0) + lead._count._all,
      );
    }
    return {
      bySource: Object.values(LeadSource).map((source) => ({
        label: source,
        value: sources.get(source) ?? 0,
      })),
      newByMonth: buckets.map((b) => ({
        label: b.label,
        value:
          counts.get(`${b.year}-${String(b.month + 1).padStart(2, '0')}`) ?? 0,
      })),
      leadConversionPercent: leadCount
        ? Math.round((converted / leadCount) * 100)
        : 0,
      total,
    };
  }

  private nextMonth(): string {
    const day = clinicDay();
    const next = new Date(`${day.slice(0, 7)}-01T00:00:00Z`);
    next.setUTCMonth(next.getUTCMonth() + 1);
    return next.toISOString().slice(0, 10);
  }
}
