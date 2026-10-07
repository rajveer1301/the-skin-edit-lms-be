import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/** Keep the numeric API/storage contract; do arithmetic in exact minor units. */
export function cents(value: number): number {
  if (!Number.isFinite(value))
    throw new BadRequestException('Invalid monetary amount');
  const result = new Prisma.Decimal(value)
    .mul(100)
    .toDecimalPlaces(0)
    .toNumber();
  if (!Number.isSafeInteger(result))
    throw new BadRequestException('Monetary amount is too large');
  return result;
}

export const money = (value: number): number => cents(value) / 100;
export const sumMoney = (values: number[]): number => {
  const total = values.reduce((sum, value) => sum + cents(value), 0);
  if (!Number.isSafeInteger(total))
    throw new BadRequestException('Monetary total is too large');
  return total / 100;
};

export function lineTotal(quantity: number, price: number): number {
  const total = cents(price) * quantity;
  if (!Number.isSafeInteger(total))
    throw new BadRequestException('Invalid line total');
  return total / 100;
}
