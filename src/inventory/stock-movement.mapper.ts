import { Product, StockMovement } from '@prisma/client';

export type StockMovementWithProduct = StockMovement & {
  product?: Product | null;
};

export interface StockMovementDto {
  id: string;
  productId: string;
  productName: string;
  type: string;
  quantity: number;
  reason?: string;
  date: string;
  byUserName?: string;
}

export function mapStockMovement(
  m: StockMovementWithProduct,
): StockMovementDto {
  return {
    id: m.id,
    productId: m.productId,
    productName: m.product?.name ?? '',
    type: m.type,
    quantity: m.quantity,
    reason: m.reason ?? undefined,
    date: m.date.toISOString(),
    byUserName: m.byUserName ?? undefined,
  };
}
