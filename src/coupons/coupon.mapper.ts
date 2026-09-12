import { Coupon, CouponUsage } from '@prisma/client';

export interface CouponDto {
  id: string;
  code: string;
  description?: string;
  type: string;
  value: number;
  minAmount?: number;
  maxUses?: number;
  maxUsesPerPatient?: number;
  applicableCategory?: string;
  firstVisitOnly?: boolean;
  packageOnly?: boolean;
  usedCount: number;
  validFrom?: string;
  validTo?: string;
  active: boolean;
  createdAt?: string;
}

export interface CouponUsageDto {
  id: string;
  couponId: string;
  couponCode: string;
  invoiceId?: string;
  invoiceNumber?: string;
  patientId?: string;
  patientName?: string;
  discountAmount: number;
  usedAt: string;
}

export function mapCoupon(c: Coupon): CouponDto {
  return {
    id: c.id,
    code: c.code,
    description: c.description ?? undefined,
    type: c.type,
    value: c.value,
    minAmount: c.minAmount ?? undefined,
    maxUses: c.maxUses ?? undefined,
    maxUsesPerPatient: c.maxUsesPerPatient ?? undefined,
    applicableCategory: c.applicableCategory ?? undefined,
    firstVisitOnly: c.firstVisitOnly,
    packageOnly: c.packageOnly,
    usedCount: c.usedCount,
    validFrom: c.validFrom ?? undefined,
    validTo: c.validTo ?? undefined,
    active: c.active,
    createdAt: c.createdAt?.toISOString(),
  };
}

export function mapCouponUsage(u: CouponUsage): CouponUsageDto {
  return {
    id: u.id,
    couponId: u.couponId,
    couponCode: u.couponCode,
    invoiceId: u.invoiceId ?? undefined,
    invoiceNumber: u.invoiceNumber ?? undefined,
    patientId: u.patientId ?? undefined,
    patientName: u.patientName ?? undefined,
    discountAmount: u.discountAmount,
    usedAt: u.usedAt.toISOString(),
  };
}

/**
 * Computes the discount amount a coupon yields for a given order subtotal.
 * Returns 0 when the coupon cannot be applied (inactive, expired, under the
 * minimum spend, or exhausted).
 */
export function computeCouponDiscount(
  coupon: Coupon,
  subtotal: number,
  usedCount = coupon.usedCount,
): number {
  if (!coupon.active) return 0;
  if (coupon.minAmount != null && subtotal < coupon.minAmount) return 0;
  if (coupon.maxUses != null && usedCount >= coupon.maxUses) return 0;

  const today = new Date().toISOString().slice(0, 10);
  if (coupon.validFrom && today < coupon.validFrom) return 0;
  if (coupon.validTo && today > coupon.validTo) return 0;

  const raw =
    coupon.type === 'PERCENT' ? (subtotal * coupon.value) / 100 : coupon.value;
  return Math.min(Math.round(raw), subtotal);
}
