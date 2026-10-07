// Invoke jobs explicitly in these integration tests; do not start background timers.
jest.mock('@nestjs/schedule', () => ({
  Cron: () => () => undefined,
  CronExpression: { EVERY_DAY_AT_2AM: '0 2 * * *' },
}));
import { PrismaClient, Role } from '@prisma/client';
import { BillingService } from '../src/billing/billing.service';
import { InventoryService } from '../src/inventory/inventory.service';
import { LeadsService } from '../src/leads/leads.service';
import { TreatmentPlansService } from '../src/treatment-plans/treatment-plans.service';
import { TreatmentsService } from '../src/treatments/treatments.service';
import { PatientsService } from '../src/patients/patients.service';
import { ReportsService } from '../src/analytics/reports.service';
import { DashboardService } from '../src/analytics/dashboard.service';
import { DriveSyncService } from '../src/drive-sync/drive-sync.service';
import { CleanupService } from '../src/storage/cleanup.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { clinicDay } from '../src/common/utils/dates';

// Opt-in only. This suite truncates an isolated local database explicitly named *_test.
const url = process.env.TEST_DATABASE_URL;
if (url) {
  const parsed = new URL(url);
  if (
    !['localhost', '127.0.0.1'].includes(parsed.hostname) ||
    !parsed.pathname.endsWith('_test')
  )
    throw new Error(
      'TEST_DATABASE_URL must identify an isolated local *_test database',
    );
}
const integration = url ? describe : describe.skip;

integration('Database integrity under failures and concurrency', () => {
  const db = new PrismaClient({
    datasources: {
      db: { url: url || 'postgresql://unused@localhost/unused_test' },
    },
  });
  const prisma = db as PrismaService;
  const billing = new BillingService(prisma);
  const inventory = new InventoryService(prisma);
  const leads = new LeadsService(prisma);
  const plans = new TreatmentPlansService(prisma);
  const storage = {
    signUrl: jest.fn(async (key) => `https://synthetic.test/${key}`),
    remove: jest.fn(async () => {}),
    open: jest.fn(async () => ({ stream: Buffer.from('synthetic') })),
  };
  const patients = new PatientsService(prisma, storage as never);
  const treatments = new TreatmentsService(prisma, storage as never);
  let patientId: string, serviceId: string, userId: string;
  const invoiceInput = (extra = {}) => ({
    patientId,
    items: [{ description: 'Session', serviceId, quantity: 1, unitPrice: 100 }],
    discount: 0,
    tax: 0,
    issuedDate: clinicDay(),
    ...extra,
  });

  beforeAll(async () => {
    await db.$connect();
  });
  afterAll(async () => {
    await db.$disconnect();
  });
  beforeEach(async () => {
    await db.$executeRawUnsafe(
      'TRUNCATE TABLE "Patient", "User", "ClinicService", "Product", "Lead", "Coupon", "CouponUsage", "NumberCounter", "FileCleanup", "JobLease" CASCADE',
    );
    storage.remove.mockClear();
    const patient = await db.patient.create({
      data: {
        firstName: 'Test',
        lastName: 'Patient',
        phone: 'synthetic',
        gender: 'OTHER',
        allergies: [],
        skinConcerns: [],
        hairConcerns: [],
      },
    });
    patientId = patient.id;
    serviceId = (
      await db.clinicService.create({
        data: {
          name: 'Service',
          category: 'SKIN',
          durationMinutes: 30,
          price: 100,
        },
      })
    ).id;
    userId = (
      await db.user.create({
        data: {
          firstName: 'Test',
          lastName: 'Doctor',
          email: 'test@example.test',
          role: 'DOCTOR',
          passwordHash: 'unused',
        },
      })
    ).id;
  });

  it('preserves items and totals on a notes-only update, including explicit field clearing', async () => {
    const invoice = await billing.create(
      invoiceInput({ notes: 'old', dueDate: '2026-12-01' }),
    );
    const updated = await billing.update(invoice.id, {
      notes: 'new',
      dueDate: null,
    } as never);
    expect(updated.items).toHaveLength(1);
    expect(updated.total).toBe(100);
    expect(updated.notes).toBe('new');
    expect(updated.dueDate).toBeUndefined();
  });
  it('allocates unique document numbers concurrently and never reuses a deleted number', async () => {
    const invoices = await Promise.all(
      Array.from({ length: 6 }, () => billing.create(invoiceInput())),
    );
    expect(new Set(invoices.map((i) => i.number)).size).toBe(6);
    const deleted = invoices
      .sort((a, b) => a.number.localeCompare(b.number))
      .at(-1)!;
    await billing.remove(deleted.id);
    const next = await billing.create(invoiceInput());
    expect(next.number > deleted.number).toBe(true);
  });
  it('creates one invoice for duplicate idempotent requests and rejects a different payload', async () => {
    const input = invoiceInput({ idempotencyKey: 'invoice-retry' });
    const [a, b] = await Promise.all([
      billing.create(input),
      billing.create(input),
    ]);
    expect(a.id).toBe(b.id);
    expect(await db.invoice.count()).toBe(1);
    await expect(
      billing.create({ ...input, notes: 'different' }),
    ).rejects.toThrow('different invoice');
  });
  it('keeps invoice totals correct for concurrent payments', async () => {
    const invoice = await billing.create(invoiceInput());
    await Promise.all(
      [10, 20, 30].map((amount) =>
        billing.addPayment(invoice.id, {
          amount,
          method: 'CASH',
          date: clinicDay(),
        }),
      ),
    );
    const saved = await billing.findOne(invoice.id);
    expect(saved.amountPaid).toBe(60);
    expect(saved.balance).toBe(40);
    expect(saved.status).toBe('PARTIAL');
  });
  it('records a retried payment only once', async () => {
    const invoice = await billing.create(invoiceInput());
    const dto = {
      amount: 50,
      method: 'CASH' as const,
      date: clinicDay(),
      idempotencyKey: 'payment-retry',
    };
    await Promise.all([
      billing.addPayment(invoice.id, dto),
      billing.addPayment(invoice.id, dto),
    ]);
    expect(await db.payment.count()).toBe(1);
    expect((await billing.findOne(invoice.id)).amountPaid).toBe(50);
  });
  it('settles decimal totals exactly and rejects excess discounts', async () => {
    const invoice = await billing.create(
      invoiceInput({
        items: [
          { description: 'a', quantity: 1, unitPrice: 0.1 },
          { description: 'b', quantity: 1, unitPrice: 0.2 },
        ],
      }),
    );
    const paid = await billing.addPayment(invoice.id, {
      amount: 0.3,
      method: 'CASH',
      date: clinicDay(),
    });
    expect(paid.total).toBe(0.3);
    expect(paid.balance).toBe(0);
    expect(paid.status).toBe('PAID');
    await expect(
      billing.create(invoiceInput({ discount: 101 })),
    ).rejects.toThrow('Discount cannot exceed');
    await expect(billing.remove(invoice.id)).rejects.toThrow('with payments');
  });
  it('enforces coupon limits atomically across concurrent invoices and reverses deleted redemptions', async () => {
    const coupon = await db.coupon.create({
      data: { code: 'ONLYONE', type: 'FIXED', value: 10, maxUses: 1 },
    });
    const results = await Promise.allSettled([
      billing.create(invoiceInput({ couponCode: coupon.code })),
      billing.create(invoiceInput({ couponCode: coupon.code })),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await db.invoice.count()).toBe(1);
    expect(await db.couponUsage.count()).toBe(1);
    const invoice = await db.invoice.findFirstOrThrow();
    await billing.remove(invoice.id);
    expect(
      (await db.coupon.findUniqueOrThrow({ where: { id: coupon.id } }))
        .usedCount,
    ).toBe(0);
    await expect(
      billing.create(invoiceInput({ couponCode: coupon.code })),
    ).resolves.toHaveProperty('id');
  });
  it('enforces patient, category, package and first-visit coupon restrictions', async () => {
    await db.coupon.createMany({
      data: [
        { code: 'PATIENT', type: 'FIXED', value: 10, maxUsesPerPatient: 1 },
        { code: 'HAIR', type: 'FIXED', value: 10, applicableCategory: 'HAIR' },
        { code: 'PACKAGE', type: 'FIXED', value: 10, packageOnly: true },
        { code: 'FIRST', type: 'FIXED', value: 10, firstVisitOnly: true },
      ],
    });
    await billing.create(invoiceInput({ couponCode: 'PATIENT' }));
    for (const code of ['PATIENT', 'HAIR', 'PACKAGE', 'FIRST'])
      await expect(
        billing.create(invoiceInput({ couponCode: code })),
      ).rejects.toThrow();
  });
  it('preserves expired coupon redemptions during ordinary edits and removes coupon-only discounts', async () => {
    const coupon = await db.coupon.create({
      data: { code: 'SAVE', type: 'FIXED', value: 10 },
    });
    const invoice = await billing.create(invoiceInput({ couponCode: 'SAVE' }));
    const redemption = await db.couponUsage.findUniqueOrThrow({
      where: { invoiceId: invoice.id },
    });
    await db.coupon.update({
      where: { id: coupon.id },
      data: { active: false },
    });
    expect((await billing.update(invoice.id, { notes: 'new' })).total).toBe(90);
    expect(
      await db.couponUsage.findUniqueOrThrow({
        where: { invoiceId: invoice.id },
      }),
    ).toMatchObject({ id: redemption.id, usedAt: redemption.usedAt });
    const removed = await billing.update(invoice.id, { couponCode: '' });
    expect(removed.total).toBe(100);
    expect(removed.discount).toBe(0);
  });
  it('applies payment-list filters to both rows and totals', async () => {
    const invoice = await billing.create(invoiceInput());
    await billing.addPayment(invoice.id, {
      amount: 20,
      method: 'CASH',
      date: clinicDay(),
    });
    expect((await billing.allPayments({ patientId: 'different' })).total).toBe(
      0,
    );
    expect((await billing.allPayments({ status: 'PAID' })).data).toEqual([]);
    expect((await billing.allPayments({ search: invoice.number })).total).toBe(
      1,
    );
  });
  it('adds stock concurrently without losing updates and rejects overselling', async () => {
    const product = await inventory.createProduct({
      name: 'Product',
      sku: 'sku',
      category: 'other',
      unit: 'each',
      quantity: 10,
      reorderLevel: 0,
      costPrice: 1,
      sellPrice: 2,
    });
    await Promise.all(
      [3, 4].map((quantity) =>
        inventory.createStockMovement(
          { productId: product.id, type: 'IN', quantity },
          userId,
        ),
      ),
    );
    expect((await inventory.findProduct(product.id)).quantity).toBe(17);
    const results = await Promise.allSettled([
      inventory.createStockMovement(
        { productId: product.id, type: 'OUT', quantity: 10 },
        userId,
      ),
      inventory.createStockMovement(
        { productId: product.id, type: 'OUT', quantity: 10 },
        userId,
      ),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await inventory.findProduct(product.id)).quantity).toBe(7);
    await inventory.updateProduct(product.id, { quantity: 8 });
    expect(
      await db.stockMovement.count({ where: { type: 'ADJUSTMENT' } }),
    ).toBe(1);
  });
  it('converts one lead once even with simultaneous requests', async () => {
    const lead = await db.lead.create({
      data: {
        firstName: 'Lead',
        lastName: 'Test',
        phone: 'synthetic',
        source: 'OTHER',
      },
    });
    const [a, b] = await Promise.all([
      leads.convert(lead.id, {}),
      leads.convert(lead.id, {}),
    ]);
    expect(a.id).toBe(b.id);
    expect(await db.patient.count({ where: { leadId: lead.id } })).toBe(1);
    expect((await leads.convert(lead.id, {})).id).toBe(a.id);
  });
  async function makePlan() {
    return plans.create({
      patientId,
      items: [
        {
          serviceId,
          kind: 'PACKAGE',
          sessionCount: 3,
          intervalDays: 7,
          price: 100,
          startDate: '2026-10-07',
        },
      ],
    });
  }
  it('accepts a plan once under concurrency and prevents patient reassignment', async () => {
    const plan = await makePlan();
    await Promise.all([plans.accept(plan.id), plans.accept(plan.id)]);
    expect(await db.treatment.count()).toBe(3);
    await expect(plans.update(plan.id, { patientId: 'other' })).rejects.toThrow(
      'reassigned',
    );
    await expect(plans.decline(plan.id, {})).rejects.toThrow(
      'no longer be declined',
    );
  });
  it('preserves billed plan items and rejects conflicting invoice service links', async () => {
    const plan = await makePlan();
    await billing.create(
      invoiceInput({
        planId: plan.id,
        items: [
          {
            description: 'Package',
            planItemId: plan.items[0].id,
            quantity: 1,
            unitPrice: 100,
          },
        ],
      }),
    );
    await expect(
      plans.update(plan.id, {
        items: [{ serviceId, kind: 'SINGLE', price: 10 }],
      }),
    ).rejects.toThrow('Billed plan items');
    await expect(
      billing.create(
        invoiceInput({
          planId: plan.id,
          items: [
            {
              description: 'wrong',
              planItemId: plan.items[0].id,
              serviceId: 'other',
              quantity: 1,
              unitPrice: 10,
            },
          ],
        }),
      ),
    ).rejects.toThrow('does not match');
  });
  it('protects completed sitting dates, including shift-following operations', async () => {
    const plan = await makePlan();
    const accepted = await plans.accept(plan.id);
    const sittings = accepted.items[0].sittings;
    await db.treatment.update({
      where: { id: sittings[1].id },
      data: { status: 'COMPLETED' },
    });
    await expect(
      plans.reschedule(plan.id, sittings[1].id, { date: '2026-11-01' }),
    ).rejects.toThrow('Completed');
    await plans.reschedule(plan.id, sittings[0].id, {
      date: '2026-10-08',
      shiftFollowing: true,
    });
    expect(
      (await db.treatment.findUniqueOrThrow({ where: { id: sittings[1].id } }))
        .date,
    ).toBe(sittings[1].date);
  });
  it('does not delete files when a patient deletion is blocked by invoices', async () => {
    await db.patientDocument.create({
      data: {
        patientId,
        name: 'report.pdf',
        type: 'OTHER',
        storageKey: 'original',
        contentType: 'application/pdf',
        sizeBytes: 1,
      },
    });
    await billing.create(invoiceInput());
    await expect(patients.remove(patientId)).rejects.toThrow();
    expect(storage.remove).not.toHaveBeenCalled();
    expect(await db.fileCleanup.count()).toBe(0);
    expect(await db.patientDocument.count()).toBe(1);
  });
  it('queues file deletion after commit and preserves still-referenced objects', async () => {
    const doc = await db.patientDocument.create({
      data: {
        patientId,
        name: 'report.pdf',
        type: 'OTHER',
        storageKey: 'original',
        contentType: 'application/pdf',
        sizeBytes: 1,
      },
    });
    await patients.removeDocument(patientId, doc.id);
    expect(await db.fileCleanup.count()).toBe(1);
    expect(storage.remove).not.toHaveBeenCalled();
    await new CleanupService(prisma, storage as never).drain();
    expect(storage.remove).toHaveBeenCalledWith('original');
    expect(await db.fileCleanup.count()).toBe(0);
  });
  it('invalidates image backup state and only queues the old image after saving', async () => {
    const treatment = await db.treatment.create({
      data: {
        patientId,
        serviceId,
        date: clinicDay(),
        price: 0,
        beforeImageKey: 'old',
        beforeImageDriveId: 'old-backup',
      },
    });
    await treatments.update(treatment.id, { beforeImageKey: 'new' });
    const saved = await db.treatment.findUniqueOrThrow({
      where: { id: treatment.id },
    });
    expect(saved.beforeImageDriveId).toBeNull();
    expect(saved.beforeImageKey).toBe('new');
    expect(
      await db.fileCleanup.findUnique({ where: { key: 'old' } }),
    ).not.toBeNull();
    expect(storage.remove).not.toHaveBeenCalled();
  });
  it('uses distinct backup names for same-day documents and defers repeated failures', async () => {
    await db.patientDocument.createMany({
      data: ['one', 'two'].map((key) => ({
        patientId,
        name: 'report.pdf',
        type: 'OTHER',
        storageKey: key,
        contentType: 'application/pdf',
        sizeBytes: 1,
      })),
    });
    const drive = {
      isEnabled: true,
      rootFolder: 'root',
      ensureFolder: jest.fn(async () => 'folder'),
      uploadFile: jest.fn(async ({ filename }) => filename),
    };
    await new DriveSyncService(
      prisma,
      storage as never,
      drive as never,
      {} as never,
    ).runSync();
    const names = drive.uploadFile.mock.calls.map(([arg]) => arg.filename);
    expect(new Set(names).size).toBe(2);
    await db.patientDocument.updateMany({ data: { driveFileId: null } });
    drive.uploadFile.mockRejectedValue(new Error('synthetic failure'));
    await new DriveSyncService(
      prisma,
      storage as never,
      drive as never,
      {} as never,
    ).runSync();
    const failed = await db.patientDocument.findMany();
    expect(
      failed.every(
        (doc) => doc.syncAttempts === 1 && doc.syncAfter > new Date(),
      ),
    ).toBe(true);
  });
  it('allows only one Drive worker to upload when instances overlap', async () => {
    await db.patientDocument.create({
      data: {
        patientId,
        name: 'report.pdf',
        type: 'OTHER',
        storageKey: 'one',
        contentType: 'application/pdf',
        sizeBytes: 1,
      },
    });
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered!: () => void;
    const uploading = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const drive = {
      isEnabled: true,
      rootFolder: 'root',
      ensureFolder: jest.fn(async () => 'folder'),
      uploadFile: jest.fn(async () => {
        entered();
        await blocked;
        return 'backup';
      }),
    };
    const first = new DriveSyncService(
      prisma,
      storage as never,
      drive as never,
      {} as never,
    ).runSync();
    try {
      await uploading;
      const second = await new DriveSyncService(
        prisma,
        storage as never,
        drive as never,
        {} as never,
      ).runSync();
      expect(second.documentsSynced).toBe(0);
      expect(drive.uploadFile).toHaveBeenCalledTimes(1);
    } finally {
      release();
    }
    expect((await first).documentsSynced).toBe(1);
    expect(await db.jobLease.count()).toBe(0);
  });
  it('returns correct aggregate reports and excludes future-month dashboard revenue', async () => {
    const invoice = await billing.create(invoiceInput());
    await billing.addPayment(invoice.id, {
      amount: 30,
      method: 'CASH',
      date: clinicDay(),
    });
    await billing.addPayment(invoice.id, {
      amount: 10,
      method: 'CASH',
      date: '2099-01-01',
    });
    const reports = new ReportsService(prisma);
    expect(await reports.revenue()).toMatchObject({
      totalRevenue: 100,
      totalCollected: 40,
      totalOutstanding: 60,
    });
    expect((await reports.patients()).total).toBe(1);
    expect((await reports.appointments()).total).toBe(0);
    expect(
      (await new DashboardService(prisma).summary(Role.SUPER_ADMIN))
        .revenueThisMonth,
    ).toBe(30);
  });
});
