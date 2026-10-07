import { clinicDay, clinicMidnight } from '../common/utils/dates';
import { addDays } from '../treatment-plans/dates';
import { money } from '../common/utils/money';
import { Injectable } from '@nestjs/common';
import { AppointmentStatus, LeadStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  bucketKey,
  lastSixMonths,
  relativeTime,
  RevenuePoint,
} from './analytics.util';

export interface StatusCount {
  status: string;
  count: number;
}

export interface ActivityItem {
  id: string;
  icon: string;
  text: string;
  time: string;
}

export interface DashboardSummary {
  appointmentsToday: number;
  revenueThisMonth: number;
  newPatientsThisMonth: number;
  totalPatients: number;
  pendingInvoicesAmount: number;
  pendingInvoicesCount: number;
  noShowRate: number;
  leadConversionPercent: number;
  revenueSeries: RevenuePoint[];
  appointmentsByStatus: StatusCount[];
  recentActivity: ActivityItem[];
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(role?: string): Promise<DashboardSummary> {
    const canSeeRevenue = role === Role.SUPER_ADMIN;
    const now = new Date();
    const today = clinicDay(now);
    const startOfToday = clinicMidnight(today);
    const endOfToday = clinicMidnight(addDays(today, 1));
    const monthDay = today.slice(0, 7) + '-01';
    const startOfMonth = clinicMidnight(monthDay);
    const next = new Date(`${monthDay}T00:00:00Z`);
    next.setUTCMonth(next.getUTCMonth() + 1);
    const nextMonthDay = next.toISOString().slice(0, 10);
    const bucket = lastSixMonths(now)[0];
    const revenueStartDay = `${bucket.year}-${String(bucket.month + 1).padStart(2, '0')}-01`;

    const [
      appointmentsToday,
      newPatientsThisMonth,
      totalPatients,
      pending,
      appointments,
      payments,
      leads,
      recentActivity,
    ] = await Promise.all([
      this.prisma.appointment.count({
        where: { startTime: { gte: startOfToday, lt: endOfToday } },
      }),
      this.prisma.patient.count({
        where: { createdAt: { gte: startOfMonth } },
      }),
      this.prisma.patient.count({}),
      this.prisma.invoice.aggregate({
        where: { balance: { gt: 0 }, status: { in: ['UNPAID', 'PARTIAL'] } },
        _sum: { balance: true },
        _count: { _all: true },
      }),
      this.prisma.appointment.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      canSeeRevenue
        ? this.prisma.payment.groupBy({
            by: ['date'],
            where: {
              date: { gte: revenueStartDay, lt: nextMonthDay },
              invoice: { status: { notIn: ['DRAFT', 'CANCELLED'] } },
            },
            _sum: { amount: true },
          })
        : Promise.resolve<
            Array<{ date: string; _sum: { amount: number | null } }>
          >([]),
      this.prisma.lead.groupBy({ by: ['status'], _count: { _all: true } }),
      this.buildRecentActivity(now),
    ]);

    const dailyPayments = payments.map((payment) => ({
      date: payment.date,
      amount: payment._sum.amount ?? 0,
    }));
    const revenueThisMonth = dailyPayments
      .filter((p) => p.date >= monthDay && p.date < nextMonthDay)
      .reduce((sum, p) => sum + p.amount, 0);

    const appointmentsByStatus: StatusCount[] = Object.values(
      AppointmentStatus,
    ).map((status) => ({
      status,
      count: appointments.find((a) => a.status === status)?._count._all ?? 0,
    }));

    const noShows =
      appointments.find((a) => a.status === AppointmentStatus.NO_SHOW)?._count
        ._all ?? 0;
    const appointmentCount = appointments.reduce(
      (sum, group) => sum + group._count._all,
      0,
    );
    const leadCount = leads.reduce((sum, group) => sum + group._count._all, 0);
    const converted =
      leads.find((l) => l.status === LeadStatus.CONVERTED)?._count._all ?? 0;

    return {
      appointmentsToday,
      // Revenue figures are restricted to SUPER_ADMIN.
      revenueThisMonth: canSeeRevenue ? money(revenueThisMonth) : 0,
      newPatientsThisMonth,
      totalPatients,
      pendingInvoicesAmount: money(pending._sum.balance ?? 0),
      pendingInvoicesCount: pending._count._all,
      noShowRate: appointmentCount
        ? Math.round((noShows / appointmentCount) * 100)
        : 0,
      leadConversionPercent: leadCount
        ? Math.round((converted / leadCount) * 100)
        : 0,
      revenueSeries: canSeeRevenue
        ? this.buildRevenueSeries(dailyPayments, now)
        : [],
      appointmentsByStatus,
      recentActivity,
    };
  }

  private buildRevenueSeries(
    payments: { amount: number; date: string }[],
    now: Date,
  ): RevenuePoint[] {
    const buckets = lastSixMonths(now);
    const totals = new Map<string, number>();
    for (const p of payments) {
      const d = new Date(p.date);
      const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
      totals.set(key, (totals.get(key) ?? 0) + p.amount);
    }
    return buckets.map((b) => ({
      label: b.label,
      value: money(totals.get(bucketKey(b)) ?? 0),
    }));
  }

  private async buildRecentActivity(now: Date): Promise<ActivityItem[]> {
    const [patients, appointments, invoices, leads] = await Promise.all([
      this.prisma.patient.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 6,
        select: { id: true, firstName: true, lastName: true, createdAt: true },
      }),
      this.prisma.appointment.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 6,
        select: {
          id: true,
          createdAt: true,
          patient: { select: { firstName: true, lastName: true } },
          service: { select: { name: true } },
        },
      }),
      this.prisma.invoice.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 6,
        select: {
          id: true,
          number: true,
          createdAt: true,
          patient: { select: { firstName: true, lastName: true } },
        },
      }),
      this.prisma.lead.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 6,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          source: true,
          createdAt: true,
        },
      }),
    ]);

    const items: (ActivityItem & { at: number })[] = [];
    for (const p of patients) {
      items.push({
        id: `patient-${p.id}`,
        icon: 'person_add',
        text: `New patient ${p.firstName} ${p.lastName} registered`,
        time: relativeTime(p.createdAt, now),
        at: p.createdAt.getTime(),
      });
    }
    for (const a of appointments) {
      items.push({
        id: `appt-${a.id}`,
        icon: 'event_available',
        text: `${a.patient.firstName} ${a.patient.lastName} booked ${a.service?.name ?? 'an appointment'}`,
        time: relativeTime(a.createdAt, now),
        at: a.createdAt.getTime(),
      });
    }
    for (const inv of invoices) {
      items.push({
        id: `inv-${inv.id}`,
        icon: 'receipt_long',
        text: `Invoice ${inv.number} created for ${inv.patient.firstName} ${inv.patient.lastName}`,
        time: relativeTime(inv.createdAt, now),
        at: inv.createdAt.getTime(),
      });
    }
    for (const l of leads) {
      items.push({
        id: `lead-${l.id}`,
        icon: 'campaign',
        text: `New lead ${l.firstName} ${l.lastName} from ${l.source}`,
        time: relativeTime(l.createdAt, now),
        at: l.createdAt.getTime(),
      });
    }

    return items
      .sort((a, b) => b.at - a.at)
      .slice(0, 6)
      .map((item) => ({
        id: item.id,
        icon: item.icon,
        text: item.text,
        time: item.time,
      }));
  }
}
