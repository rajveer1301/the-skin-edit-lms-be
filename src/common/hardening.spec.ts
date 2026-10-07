import { ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { sumMoney } from './utils/money';
import { clinicDay, clinicMidnight, isIsoDay } from './utils/dates';
import { RolesGuard } from './guards/roles.guard';
import { ReportsController } from '../analytics/reports.controller';
import { StaffService } from '../staff/staff.service';
import { RescheduleSittingDto } from '../treatment-plans/dto/reschedule-sitting.dto';
import { CreateInvoiceDto } from '../billing/dto/create-invoice.dto';
import { validateConfig } from './config';
import { verifyGoogleToken } from '../auth/google-token';

const pipe = new ValidationPipe({
  whitelist: true,
  transform: true,
  transformOptions: { enableImplicitConversion: false },
});

describe('Shared validation and authorization', () => {
  it('uses exact minor-unit arithmetic', () =>
    expect(sumMoney([0.1, 0.2, -0.3])).toBe(0));
  it.each(['2026-02-31', '2026-13-01', '2026-01-01junk', '2026-1-01'])(
    'rejects invalid date %s',
    (value) => expect(isIsoDay(value)).toBe(false),
  );
  it('accepts leap-day dates correctly', () => {
    expect(isIsoDay('2024-02-29')).toBe(true);
    expect(isIsoDay('2025-02-29')).toBe(false);
  });
  it('uses clinic calendar boundaries', () => {
    const previous = process.env.CLINIC_TIMEZONE;
    process.env.CLINIC_TIMEZONE = 'Asia/Kolkata';
    try {
      expect(clinicDay(new Date('2026-10-06T19:00:00Z'))).toBe('2026-10-07');
      expect(clinicMidnight('2026-10-07').toISOString()).toBe(
        '2026-10-06T18:30:00.000Z',
      );
    } finally {
      if (previous === undefined) delete process.env.CLINIC_TIMEZONE;
      else process.env.CLINIC_TIMEZONE = previous;
    }
  });
  it('rejects string booleans instead of interpreting false as true', async () => {
    await expect(
      pipe.transform(
        { date: '2026-10-07', shiftFollowing: 'false' },
        { type: 'body', metatype: RescheduleSittingDto },
      ),
    ).rejects.toThrow();
    await expect(
      pipe.transform(
        { date: '2026-10-07', shiftFollowing: false },
        { type: 'body', metatype: RescheduleSittingDto },
      ),
    ).resolves.toMatchObject({ shiftFollowing: false });
  });
  it('preserves omitted medical history and active flags in partial updates', async () => {
    const patient = (await pipe.transform(
      { phone: 'updated' },
      { type: 'body', metatype: UpdatePatientDto },
    )) as UpdatePatientDto;
    expect(patient.phone).toBe('updated');
    for (const field of [
      'allergies',
      'medications',
      'medicalConditions',
      'previousProcedures',
      'skinConcerns',
      'hairConcerns',
      'wellnessConcerns',
    ] as const)
      expect(patient[field]).toBeUndefined();
    for (const metatype of [UpdateProductDto, UpdateServiceDto]) {
      const update = (await pipe.transform(
        { name: 'Updated' },
        { type: 'body', metatype },
      )) as UpdateProductDto;
      expect(update.active).toBeUndefined();
    }
  });
  it('rejects fractional invoice quantities and malformed dates', async () => {
    await expect(
      pipe.transform(
        {
          patientId: 'p',
          items: [{ description: 'x', quantity: 1.5, unitPrice: 10 }],
          discount: 0,
          tax: 0,
          issuedDate: 'not-a-date',
        },
        { type: 'body', metatype: CreateInvoiceDto },
      ),
    ).rejects.toThrow();
  });
  it('denies revenue reporting to ADMIN', () => {
    const context = {
      getHandler: () => ReportsController.prototype.revenue,
      getClass: () => ReportsController,
      switchToHttp: () => ({
        getRequest: () => ({ user: { role: Role.ADMIN } }),
      }),
    };
    expect(() =>
      new RolesGuard(new Reflector()).canActivate(context as never),
    ).toThrow();
  });
  it('denies promotion to SUPER_ADMIN by ADMIN', async () => {
    const db = {
      user: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ role: Role.ADMIN }),
        update: jest.fn(),
      },
    };
    await expect(
      new StaffService(db as never).update(
        'u',
        { role: Role.SUPER_ADMIN },
        Role.ADMIN,
      ),
    ).rejects.toThrow('Only a super admin');
    expect(db.user.update).not.toHaveBeenCalled();
  });
  it('requires explicit new-staff passwords', async () => {
    await expect(
      new StaffService({} as never).create(
        { role: Role.DOCTOR } as never,
        Role.ADMIN,
      ),
    ).rejects.toThrow('password is required');
  });
  it('fails closed without Google configuration', async () => {
    await expect(
      verifyGoogleToken('header.payload.signature', ''),
    ).rejects.toThrow('not configured');
  });
  it('fails closed without required secrets', () =>
    expect(() => validateConfig({})).toThrow('JWT_ACCESS_SECRET'));
});
import { UpdatePatientDto } from '../patients/dto/update-patient.dto';
import { UpdateServiceDto } from '../services/dto/update-service.dto';
import { UpdateProductDto } from '../inventory/dto/update-product.dto';
