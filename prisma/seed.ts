import {
  AppointmentStatus,
  CouponType,
  Gender,
  InvoiceStatus,
  LeadSource,
  LeadStatus,
  PaymentMethod,
  PrismaClient,
  Role,
  ServiceCategory,
  StockMovementType,
  TreatmentStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const DEFAULT_PASSWORD = 'password123';

function daysFromNow(days: number, hour = 10, minute = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function isoDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function clear(): Promise<void> {
  await prisma.payment.deleteMany();
  await prisma.invoiceItem.deleteMany();
  await prisma.couponUsage.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.coupon.deleteMany();
  await prisma.stockMovement.deleteMany();
  await prisma.treatment.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.product.deleteMany();
  await prisma.patient.deleteMany();
  await prisma.clinicService.deleteMany();
  await prisma.user.deleteMany();
}

async function seedUsers(): Promise<void> {
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
  const users = [
    {
      id: 'u_super',
      firstName: 'Riya',
      lastName: 'Sethi',
      email: 'superadmin@theskinedit.com',
      phone: '+91 98200 10000',
      role: Role.SUPER_ADMIN,
      active: true,
      createdAt: daysFromNow(-210),
    },
    {
      id: 'u_admin',
      firstName: 'Aisha',
      lastName: 'Kapoor',
      email: 'admin@theskinedit.com',
      phone: '+91 98200 10001',
      role: Role.ADMIN,
      active: true,
      createdAt: daysFromNow(-200),
    },
    {
      id: 'u_doc1',
      firstName: 'Ravi',
      lastName: 'Menon',
      email: 'doctor@theskinedit.com',
      phone: '+91 98200 10002',
      role: Role.DOCTOR,
      active: true,
      specialization: 'Dermatologist',
      createdAt: daysFromNow(-180),
    },
    {
      id: 'u_doc2',
      firstName: 'Neha',
      lastName: 'Shah',
      email: 'neha@theskinedit.com',
      phone: '+91 98200 10003',
      role: Role.THERAPIST,
      active: true,
      specialization: 'Trichology therapist',
      createdAt: daysFromNow(-150),
    },
    {
      id: 'u_recep',
      firstName: 'Priya',
      lastName: 'Nair',
      email: 'reception@theskinedit.com',
      phone: '+91 98200 10004',
      role: Role.RECEPTIONIST,
      active: true,
      createdAt: daysFromNow(-120),
    },
    {
      id: 'u_acc',
      firstName: 'Karan',
      lastName: 'Gupta',
      email: 'accounts@theskinedit.com',
      phone: '+91 98200 10005',
      role: Role.ACCOUNTANT,
      active: true,
      createdAt: daysFromNow(-90),
    },
  ];
  for (const u of users) {
    await prisma.user.create({ data: { ...u, passwordHash } });
  }
}

async function seedServices(): Promise<void> {
  const services = [
    {
      id: 's_1',
      name: 'Hydrafacial',
      category: ServiceCategory.SKIN,
      description: 'Deep cleansing and hydration facial',
      durationMinutes: 60,
      price: 4500,
      active: true,
    },
    {
      id: 's_2',
      name: 'Chemical Peel',
      category: ServiceCategory.SKIN,
      description: 'Glycolic acid peel for glow',
      durationMinutes: 45,
      price: 3500,
      active: true,
    },
    {
      id: 's_3',
      name: 'Laser Hair Removal - Full Face',
      category: ServiceCategory.LASER,
      description: 'Diode laser session',
      durationMinutes: 30,
      price: 3000,
      active: true,
    },
    {
      id: 's_4',
      name: 'PRP for Hair',
      category: ServiceCategory.HAIR,
      description: 'Platelet-rich plasma scalp therapy',
      durationMinutes: 60,
      price: 6000,
      active: true,
    },
    {
      id: 's_5',
      name: 'Botox - Forehead',
      category: ServiceCategory.INJECTABLE,
      description: 'Anti-wrinkle injectable',
      durationMinutes: 30,
      price: 12000,
      active: true,
    },
    {
      id: 's_6',
      name: 'Dermal Fillers',
      category: ServiceCategory.INJECTABLE,
      description: 'Hyaluronic acid fillers',
      durationMinutes: 45,
      price: 18000,
      active: true,
    },
    {
      id: 's_7',
      name: 'Skin Consultation',
      category: ServiceCategory.SKIN,
      description: 'Dermatologist consult',
      durationMinutes: 20,
      price: 800,
      active: true,
    },
    {
      id: 's_8',
      name: 'Wellness IV Drip',
      category: ServiceCategory.WELLNESS,
      description: 'Vitamin and hydration drip',
      durationMinutes: 45,
      price: 5500,
      active: true,
    },
  ];
  await prisma.clinicService.createMany({ data: services });
}

async function seedPatients(): Promise<void> {
  const patients = [
    {
      id: 'p_1',
      firstName: 'Sanya',
      lastName: 'Verma',
      gender: Gender.FEMALE,
      dateOfBirth: '1994-03-12',
      phone: '+91 90000 11111',
      email: 'sanya.v@example.com',
      address: '12 Rose Villa, Bandra',
      city: 'Mumbai',
      bloodGroup: 'O+',
      allergies: ['Sulfa drugs'],
      medicalHistory: 'Mild eczema',
      skinConcerns: ['Acne', 'Pigmentation'],
      hairConcerns: [],
      notes: 'Prefers evening slots',
      createdAt: daysFromNow(-60),
    },
    {
      id: 'p_2',
      firstName: 'Aarav',
      lastName: 'Malhotra',
      gender: Gender.MALE,
      dateOfBirth: '1988-07-22',
      phone: '+91 90000 22222',
      email: 'aarav.m@example.com',
      address: '4 Palm Court, Andheri',
      city: 'Mumbai',
      bloodGroup: 'B+',
      allergies: [],
      skinConcerns: [],
      hairConcerns: ['Hair fall', 'Receding hairline'],
      notes: '',
      createdAt: daysFromNow(-45),
    },
    {
      id: 'p_3',
      firstName: 'Isha',
      lastName: 'Reddy',
      gender: Gender.FEMALE,
      dateOfBirth: '1999-11-05',
      phone: '+91 90000 33333',
      email: 'isha.r@example.com',
      address: '9 Lake View, Powai',
      city: 'Mumbai',
      bloodGroup: 'A+',
      allergies: ['Latex'],
      skinConcerns: ['Dullness'],
      hairConcerns: [],
      createdAt: daysFromNow(-30),
    },
    {
      id: 'p_4',
      firstName: 'Rohan',
      lastName: 'Iyer',
      gender: Gender.MALE,
      dateOfBirth: '1991-01-18',
      phone: '+91 90000 44444',
      email: 'rohan.i@example.com',
      city: 'Pune',
      allergies: [],
      skinConcerns: ['Scarring'],
      hairConcerns: [],
      createdAt: daysFromNow(-20),
    },
    {
      id: 'p_5',
      firstName: 'Meera',
      lastName: 'Joshi',
      gender: Gender.FEMALE,
      dateOfBirth: '1985-09-30',
      phone: '+91 90000 55555',
      email: 'meera.j@example.com',
      city: 'Mumbai',
      bloodGroup: 'AB+',
      allergies: [],
      skinConcerns: ['Fine lines', 'Wrinkles'],
      hairConcerns: [],
      notes: 'Interested in anti-ageing',
      createdAt: daysFromNow(-12),
    },
    {
      id: 'p_6',
      firstName: 'Dev',
      lastName: 'Sharma',
      gender: Gender.MALE,
      dateOfBirth: '1996-05-14',
      phone: '+91 90000 66666',
      city: 'Thane',
      allergies: [],
      skinConcerns: ['Acne'],
      hairConcerns: ['Dandruff'],
      createdAt: daysFromNow(-4),
    },
  ];
  for (const p of patients) {
    await prisma.patient.create({ data: p });
  }
}

async function seedAppointments(): Promise<void> {
  const appointments = [
    {
      id: 'a_1',
      patientId: 'p_1',
      doctorId: 'u_doc1',
      serviceId: 's_1',
      startTime: daysFromNow(0, 11, 0),
      endTime: daysFromNow(0, 12, 0),
      status: AppointmentStatus.CONFIRMED,
      notes: 'First hydrafacial session',
    },
    {
      id: 'a_2',
      patientId: 'p_2',
      doctorId: 'u_doc2',
      serviceId: 's_4',
      startTime: daysFromNow(0, 14, 0),
      endTime: daysFromNow(0, 15, 0),
      status: AppointmentStatus.CHECKED_IN,
    },
    {
      id: 'a_3',
      patientId: 'p_3',
      doctorId: 'u_doc1',
      serviceId: 's_2',
      startTime: daysFromNow(1, 10, 0),
      endTime: daysFromNow(1, 10, 45),
      status: AppointmentStatus.SCHEDULED,
    },
    {
      id: 'a_4',
      patientId: 'p_5',
      doctorId: 'u_doc1',
      serviceId: 's_5',
      startTime: daysFromNow(2, 16, 0),
      endTime: daysFromNow(2, 16, 30),
      status: AppointmentStatus.SCHEDULED,
    },
    {
      id: 'a_5',
      patientId: 'p_4',
      doctorId: 'u_doc2',
      serviceId: 's_3',
      startTime: daysFromNow(-3, 12, 0),
      endTime: daysFromNow(-3, 12, 30),
      status: AppointmentStatus.COMPLETED,
    },
    {
      id: 'a_6',
      patientId: 'p_1',
      doctorId: 'u_doc1',
      serviceId: 's_7',
      startTime: daysFromNow(-7, 9, 30),
      endTime: daysFromNow(-7, 9, 50),
      status: AppointmentStatus.COMPLETED,
    },
  ];
  await prisma.appointment.createMany({ data: appointments });
}

async function seedTreatments(): Promise<void> {
  const treatments = [
    {
      id: 't_1',
      patientId: 'p_4',
      serviceId: 's_3',
      doctorId: 'u_doc2',
      date: isoDate(-3),
      status: TreatmentStatus.COMPLETED,
      sessionNumber: 2,
      totalSessions: 6,
      price: 3000,
      notes: 'Tolerated well',
    },
    {
      id: 't_2',
      patientId: 'p_1',
      serviceId: 's_1',
      doctorId: 'u_doc1',
      date: isoDate(-30),
      status: TreatmentStatus.COMPLETED,
      sessionNumber: 1,
      totalSessions: 3,
      price: 4500,
    },
    {
      id: 't_3',
      patientId: 'p_2',
      serviceId: 's_4',
      doctorId: 'u_doc2',
      date: isoDate(0),
      status: TreatmentStatus.IN_PROGRESS,
      sessionNumber: 1,
      totalSessions: 4,
      price: 6000,
    },
    {
      id: 't_4',
      patientId: 'p_1',
      serviceId: 's_7',
      doctorId: 'u_doc1',
      date: isoDate(-30),
      status: TreatmentStatus.COMPLETED,
      sessionNumber: 1,
      totalSessions: 1,
      price: 0,
      isComplementary: true,
      notes: 'Complimentary consultation bundled with Hydrafacial',
    },
  ];
  await prisma.treatment.createMany({ data: treatments });
}

interface SeedItem {
  description: string;
  serviceId?: string;
  quantity: number;
  unitPrice: number;
}

async function createInvoice(
  id: string,
  number: string,
  patientId: string,
  items: SeedItem[],
  discount: number,
  tax: number,
  issuedDate: string,
  status: InvoiceStatus,
  amountPaid: number,
): Promise<void> {
  const mappedItems = items.map((i) => ({
    ...i,
    total: i.quantity * i.unitPrice,
  }));
  const subtotal = mappedItems.reduce((sum, i) => sum + i.total, 0);
  const total = subtotal - discount + tax;
  await prisma.invoice.create({
    data: {
      id,
      number,
      patientId,
      subtotal,
      discount,
      tax,
      total,
      amountPaid,
      balance: total - amountPaid,
      status,
      issuedDate,
      items: { create: mappedItems },
      payments:
        amountPaid > 0
          ? {
              create: [
                {
                  amount: amountPaid,
                  method: PaymentMethod.CARD,
                  date: issuedDate,
                  reference: 'TXN' + id,
                },
              ],
            }
          : undefined,
    },
  });
}

async function seedInvoices(): Promise<void> {
  await createInvoice(
    'inv_1',
    'INV-2026-001',
    'p_4',
    [
      {
        description: 'Laser Hair Removal - Full Face',
        serviceId: 's_3',
        quantity: 1,
        unitPrice: 3000,
      },
    ],
    0,
    540,
    isoDate(-3),
    InvoiceStatus.PAID,
    3540,
  );
  await createInvoice(
    'inv_2',
    'INV-2026-002',
    'p_1',
    [
      {
        description: 'Hydrafacial',
        serviceId: 's_1',
        quantity: 1,
        unitPrice: 4500,
      },
      {
        description: 'Skin Consultation',
        serviceId: 's_7',
        quantity: 1,
        unitPrice: 800,
      },
    ],
    300,
    954,
    isoDate(-30),
    InvoiceStatus.PARTIAL,
    3000,
  );
  await createInvoice(
    'inv_3',
    'INV-2026-003',
    'p_2',
    [
      {
        description: 'PRP for Hair',
        serviceId: 's_4',
        quantity: 1,
        unitPrice: 6000,
      },
    ],
    0,
    1080,
    isoDate(0),
    InvoiceStatus.UNPAID,
    0,
  );
  await createInvoice(
    'inv_4',
    'INV-2026-004',
    'p_5',
    [
      {
        description: 'Botox - Forehead',
        serviceId: 's_5',
        quantity: 1,
        unitPrice: 12000,
      },
    ],
    1000,
    1980,
    isoDate(-1),
    InvoiceStatus.UNPAID,
    0,
  );
}

async function seedProducts(): Promise<void> {
  const products = [
    {
      id: 'prod_1',
      name: 'Hydrafacial Serum Kit',
      sku: 'HF-KIT-01',
      category: 'Consumable',
      unit: 'kit',
      quantity: 24,
      reorderLevel: 10,
      costPrice: 1200,
      sellPrice: 0,
      supplier: 'DermaSupplies Pvt Ltd',
      active: true,
    },
    {
      id: 'prod_2',
      name: 'Glycolic Acid 30%',
      sku: 'PEEL-GLY-30',
      category: 'Consumable',
      unit: 'bottle',
      quantity: 6,
      reorderLevel: 8,
      costPrice: 900,
      sellPrice: 0,
      supplier: 'SkinChem',
      active: true,
    },
    {
      id: 'prod_3',
      name: 'Botox Vial 100U',
      sku: 'BTX-100',
      category: 'Injectable',
      unit: 'vial',
      quantity: 4,
      reorderLevel: 5,
      costPrice: 9000,
      sellPrice: 0,
      supplier: 'Allergan',
      active: true,
    },
    {
      id: 'prod_4',
      name: 'Nitrile Gloves (M)',
      sku: 'GLV-NM',
      category: 'Disposable',
      unit: 'box',
      quantity: 40,
      reorderLevel: 15,
      costPrice: 350,
      sellPrice: 0,
      supplier: 'MediCare',
      active: true,
    },
    {
      id: 'prod_5',
      name: 'PRP Tubes',
      sku: 'PRP-TUBE',
      category: 'Consumable',
      unit: 'pack',
      quantity: 3,
      reorderLevel: 6,
      costPrice: 1500,
      sellPrice: 0,
      supplier: 'BioTubes',
      active: true,
    },
    {
      id: 'prod_6',
      name: 'Retinol Serum (Retail)',
      sku: 'RET-SER-30',
      category: 'Retail',
      unit: 'bottle',
      quantity: 18,
      reorderLevel: 8,
      costPrice: 800,
      sellPrice: 1800,
      supplier: 'GlowLabs',
      active: true,
    },
  ];
  await prisma.product.createMany({ data: products });

  const movements = [
    {
      id: 'sm_1',
      productId: 'prod_1',
      type: StockMovementType.IN,
      quantity: 30,
      reason: 'Purchase order #PO-101',
      date: daysFromNow(-40),
      byUserName: 'Priya Nair',
    },
    {
      id: 'sm_2',
      productId: 'prod_1',
      type: StockMovementType.OUT,
      quantity: 6,
      reason: 'Used in treatments',
      date: daysFromNow(-10),
      byUserName: 'Ravi Menon',
    },
    {
      id: 'sm_3',
      productId: 'prod_3',
      type: StockMovementType.OUT,
      quantity: 1,
      reason: 'Botox procedure',
      date: daysFromNow(-1),
      byUserName: 'Ravi Menon',
    },
  ];
  await prisma.stockMovement.createMany({ data: movements });
}

async function seedCoupons(): Promise<void> {
  const coupons = [
    {
      id: 'c_1',
      code: 'WELCOME10',
      description: '10% off for first-time clients',
      type: CouponType.PERCENT,
      value: 10,
      minAmount: 1000,
      maxUses: 100,
      usedCount: 1,
      active: true,
    },
    {
      id: 'c_2',
      code: 'GLOW500',
      description: 'Flat ₹500 off on facials',
      type: CouponType.FIXED,
      value: 500,
      minAmount: 3000,
      maxUses: 50,
      usedCount: 0,
      active: true,
    },
    {
      id: 'c_3',
      code: 'FESTIVE20',
      description: 'Festive season 20% off',
      type: CouponType.PERCENT,
      value: 20,
      minAmount: 5000,
      maxUses: 30,
      usedCount: 0,
      validFrom: isoDate(-10),
      validTo: isoDate(20),
      active: true,
    },
    {
      id: 'c_4',
      code: 'SUMMER15',
      description: 'Expired summer promo',
      type: CouponType.PERCENT,
      value: 15,
      usedCount: 12,
      validFrom: isoDate(-120),
      validTo: isoDate(-60),
      active: false,
    },
  ];
  await prisma.coupon.createMany({ data: coupons });

  await prisma.couponUsage.create({
    data: {
      id: 'cu_1',
      couponId: 'c_1',
      couponCode: 'WELCOME10',
      invoiceId: 'inv_2',
      invoiceNumber: 'INV-2026-002',
      patientId: 'p_1',
      patientName: 'Sanya Verma',
      discountAmount: 300,
      usedAt: daysFromNow(-30),
    },
  });
}

async function seedLeads(): Promise<void> {
  const leads = [
    {
      id: 'l_1',
      firstName: 'Tara',
      lastName: 'Bhatt',
      phone: '+91 91111 00001',
      email: 'tara.b@example.com',
      source: LeadSource.INSTAGRAM,
      status: LeadStatus.NEW,
      interestedIn: 'Laser Hair Removal',
      notes: 'Saw reel on laser packages',
      followUpDate: isoDate(1),
      createdAt: daysFromNow(-1),
    },
    {
      id: 'l_2',
      firstName: 'Vikram',
      lastName: 'Rao',
      phone: '+91 91111 00002',
      email: 'vikram.r@example.com',
      source: LeadSource.GOOGLE,
      status: LeadStatus.CONTACTED,
      interestedIn: 'PRP for Hair',
      assignedToId: 'u_recep',
      followUpDate: isoDate(2),
      createdAt: daysFromNow(-4),
    },
    {
      id: 'l_3',
      firstName: 'Fatima',
      lastName: 'Sheikh',
      phone: '+91 91111 00003',
      source: LeadSource.REFERRAL,
      status: LeadStatus.CONSULTATION_SCHEDULED,
      interestedIn: 'Botox',
      assignedToId: 'u_recep',
      followUpDate: isoDate(0),
      createdAt: daysFromNow(-6),
    },
    {
      id: 'l_4',
      firstName: 'Nikhil',
      lastName: 'Agarwal',
      phone: '+91 91111 00004',
      email: 'nikhil.a@example.com',
      source: LeadSource.WEBSITE,
      status: LeadStatus.CONVERTED,
      interestedIn: 'Hydrafacial',
      assignedToId: 'u_recep',
      createdAt: daysFromNow(-15),
    },
    {
      id: 'l_5',
      firstName: 'Pooja',
      lastName: 'Desai',
      phone: '+91 91111 00005',
      source: LeadSource.WALK_IN,
      status: LeadStatus.LOST,
      interestedIn: 'Fillers',
      notes: 'Went with another clinic',
      createdAt: daysFromNow(-20),
    },
  ];
  await prisma.lead.createMany({ data: leads });
}

async function main(): Promise<void> {
  console.log('Clearing existing data...');
  await clear();
  console.log('Seeding users...');
  await seedUsers();
  console.log('Seeding services...');
  await seedServices();
  console.log('Seeding patients...');
  await seedPatients();
  console.log('Seeding appointments...');
  await seedAppointments();
  console.log('Seeding treatments...');
  await seedTreatments();
  console.log('Seeding invoices...');
  await seedInvoices();
  console.log('Seeding coupons...');
  await seedCoupons();
  console.log('Seeding products & stock movements...');
  await seedProducts();
  console.log('Seeding leads...');
  await seedLeads();
  console.log('Seed complete. Demo login: admin@theskinedit.com / password123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
