import { Injectable } from '@nestjs/common';
import { AppointmentStatus, Role } from '@prisma/client';
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
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      appointmentsToday,
      newPatientsThisMonth,
      totalPatients,
      invoices,
      appointments,
      payments,
    ] = await Promise.all([
      this.prisma.appointment.count({
        where: { startTime: { gte: startOfToday, lt: endOfToday } },
      }),
      this.prisma.patient.count({
        where: { createdAt: { gte: startOfMonth } },
      }),
      this.prisma.patient.count({}),
      this.prisma.invoice.findMany({
        select: { balance: true, amountPaid: true },
      }),
      this.prisma.appointment.findMany({ select: { status: true } }),
      this.prisma.payment.findMany({ select: { amount: true, date: true } }),
    ]);

    const pending = invoices.filter((i) => i.balance > 0);
    const revenueThisMonth = payments
      .filter((p) => new Date(p.date) >= startOfMonth)
      .reduce((sum, p) => sum + p.amount, 0);

    const appointmentsByStatus: StatusCount[] = Object.values(
      AppointmentStatus,
    ).map((status) => ({
      status,
      count: appointments.filter((a) => a.status === status).length,
    }));

    return {
      appointmentsToday,
      // Revenue figures are restricted to SUPER_ADMIN.
      revenueThisMonth: canSeeRevenue ? revenueThisMonth : 0,
      newPatientsThisMonth,
      totalPatients,
      pendingInvoicesAmount: pending.reduce((sum, i) => sum + i.balance, 0),
      pendingInvoicesCount: pending.length,
      revenueSeries: canSeeRevenue
        ? this.buildRevenueSeries(payments, now)
        : [],
      appointmentsByStatus,
      recentActivity: await this.buildRecentActivity(now),
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
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      totals.set(key, (totals.get(key) ?? 0) + p.amount);
    }
    return buckets.map((b) => ({
      label: b.label,
      value: totals.get(bucketKey(b)) ?? 0,
    }));
  }

  private async buildRecentActivity(now: Date): Promise<ActivityItem[]> {
    const [patients, appointments, invoices, leads] = await Promise.all([
      this.prisma.patient.findMany({ orderBy: { createdAt: 'desc' }, take: 3 }),
      this.prisma.appointment.findMany({
        orderBy: { createdAt: 'desc' },
        take: 3,
        include: { patient: true, service: true },
      }),
      this.prisma.invoice.findMany({
        orderBy: { createdAt: 'desc' },
        take: 3,
        include: { patient: true },
      }),
      this.prisma.lead.findMany({ orderBy: { createdAt: 'desc' }, take: 3 }),
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
