import { AppointmentStatus, LeadStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DashboardService } from './dashboard.service';

describe('DashboardService', () => {
  function setup() {
    const prisma = {
      patient: {
        count: jest.fn().mockResolvedValue(12),
        findMany: jest.fn().mockResolvedValue([]),
      },
      appointment: {
        count: jest.fn().mockResolvedValue(3),
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn().mockResolvedValue([
          { status: AppointmentStatus.COMPLETED, _count: { _all: 8 } },
          { status: AppointmentStatus.NO_SHOW, _count: { _all: 2 } },
        ]),
      },
      invoice: {
        aggregate: jest
          .fn()
          .mockResolvedValue({ _sum: { balance: 1200 }, _count: { _all: 2 } }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      payment: {
        groupBy: jest.fn().mockResolvedValue([
          { date: '2026-10-02', _sum: { amount: 3000 } },
          { date: '2026-09-02', _sum: { amount: 1500 } },
        ]),
      },
      lead: {
        groupBy: jest.fn().mockResolvedValue([
          { status: LeadStatus.CONVERTED, _count: { _all: 3 } },
          { status: LeadStatus.NEW, _count: { _all: 9 } },
        ]),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    return {
      prisma,
      service: new DashboardService(prisma as unknown as PrismaService),
    };
  }

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-10-06T10:00:00Z'));
  });
  afterEach(() => jest.useRealTimers());

  it('preserves counts and totals while aggregating instead of loading full tables', async () => {
    const { service, prisma } = setup();
    const result = await service.summary(Role.SUPER_ADMIN);
    expect(result).toMatchObject({
      appointmentsToday: 3,
      noShowRate: 20,
      leadConversionPercent: 25,
      pendingInvoicesAmount: 1200,
      pendingInvoicesCount: 2,
      revenueThisMonth: 3000,
    });
    expect(result.revenueSeries).toHaveLength(6);
    expect(result.revenueSeries.at(-1)).toEqual({ label: 'Oct', value: 3000 });
    expect(
      result.appointmentsByStatus.find(
        (row) => row.status === AppointmentStatus.NO_SHOW,
      )?.count,
    ).toBe(2);
    expect(prisma.payment.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          date: { gte: '2026-05-01', lt: '2026-11-01' },
          invoice: { status: { notIn: ['DRAFT', 'CANCELLED'] } },
        },
      }),
    );
    expect(prisma.appointment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 6 }),
    );
  });

  it('does not query payment data for users without revenue access', async () => {
    const { service, prisma } = setup();
    const result = await service.summary(Role.DOCTOR);
    expect(prisma.payment.groupBy).not.toHaveBeenCalled();
    expect(result.revenueThisMonth).toBe(0);
    expect(result.revenueSeries).toEqual([]);
  });

  it('returns zero metrics for an empty clinic', async () => {
    const { service, prisma } = setup();
    prisma.appointment.groupBy.mockResolvedValue([]);
    prisma.lead.groupBy.mockResolvedValue([]);
    prisma.payment.groupBy.mockResolvedValue([]);
    prisma.invoice.aggregate.mockResolvedValue({
      _sum: { balance: null },
      _count: { _all: 0 },
    });
    const result = await service.summary(Role.SUPER_ADMIN);
    expect(result).toMatchObject({
      pendingInvoicesAmount: 0,
      pendingInvoicesCount: 0,
      noShowRate: 0,
      leadConversionPercent: 0,
      revenueThisMonth: 0,
    });
  });
});
