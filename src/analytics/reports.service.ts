import { Injectable } from '@nestjs/common';
import { AppointmentStatus, LeadSource, LeadStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { bucketKey, lastSixMonths, RevenuePoint } from './analytics.util';

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
    const now = new Date();
    const [invoices, payments] = await Promise.all([
      this.prisma.invoice.findMany({
        select: { total: true, amountPaid: true },
      }),
      this.prisma.payment.findMany({ select: { amount: true, date: true } }),
    ]);
    const totalRevenue = invoices.reduce((sum, i) => sum + i.total, 0);
    const totalCollected = invoices.reduce((sum, i) => sum + i.amountPaid, 0);

    const buckets = lastSixMonths(now);
    const totals = new Map<string, number>();
    for (const p of payments) {
      const d = new Date(p.date);
      totals.set(
        `${d.getFullYear()}-${d.getMonth()}`,
        (totals.get(`${d.getFullYear()}-${d.getMonth()}`) ?? 0) + p.amount,
      );
    }
    const series = buckets.map((b) => ({
      label: b.label,
      value: totals.get(bucketKey(b)) ?? 0,
    }));

    return {
      series,
      totalRevenue,
      totalCollected,
      totalOutstanding: totalRevenue - totalCollected,
    };
  }

  async appointments(): Promise<AppointmentsReport> {
    const [appointments, services] = await Promise.all([
      this.prisma.appointment.findMany({
        select: { status: true, serviceId: true },
      }),
      this.prisma.clinicService.findMany({
        select: { id: true, name: true, category: true },
      }),
    ]);
    const byStatus: StatusCount[] = Object.values(AppointmentStatus).map(
      (status) => ({
        status,
        count: appointments.filter((a) => a.status === status).length,
      }),
    );
    const byService = services
      .map((s) => ({
        label: s.name,
        value: appointments.filter((a) => a.serviceId === s.id).length,
      }))
      .filter((x) => x.value > 0);
    const byCategoryMap = new Map<string, number>();
    for (const s of services) {
      const count = appointments.filter((a) => a.serviceId === s.id).length;
      byCategoryMap.set(s.category, (byCategoryMap.get(s.category) ?? 0) + count);
    }
    const noShows = appointments.filter(
      (a) => a.status === AppointmentStatus.NO_SHOW,
    ).length;
    return {
      byStatus,
      byService,
      byCategory: [...byCategoryMap.entries()].map(([label, value]) => ({
        label,
        value,
      })),
      noShowRate: appointments.length
        ? Math.round((noShows / appointments.length) * 100)
        : 0,
      total: appointments.length,
    };
  }

  async patients(): Promise<PatientsReport> {
    const now = new Date();
    const [leads, patients] = await Promise.all([
      this.prisma.lead.findMany({ select: { source: true, status: true } }),
      this.prisma.patient.findMany({ select: { createdAt: true } }),
    ]);
    const bySource = Object.values(LeadSource).map((source) => ({
      label: source,
      value: leads.filter((l) => l.source === source).length,
    }));

    const buckets = lastSixMonths(now);
    const counts = new Map<string, number>();
    for (const p of patients) {
      const key = `${p.createdAt.getFullYear()}-${p.createdAt.getMonth()}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const newByMonth = buckets.map((b) => ({
      label: b.label,
      value: counts.get(bucketKey(b)) ?? 0,
    }));

    const converted = leads.filter((l) => l.status === LeadStatus.CONVERTED)
      .length;
    return {
      bySource,
      newByMonth,
      leadConversionPercent: leads.length
        ? Math.round((converted / leads.length) * 100)
        : 0,
      total: patients.length,
    };
  }
}
