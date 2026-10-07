/** Calendar-day helpers for YYYY-MM-DD sitting dates. */
import { clinicDay, isIsoDay } from '../common/utils/dates';
export { isIsoDay } from '../common/utils/dates';
export const todayIso = clinicDay;

export function addDays(isoDate: string, days: number): string {
  const date = parseDay(isoDate);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function diffDays(from: string, to: string): number {
  const ms = parseDay(to).getTime() - parseDay(from).getTime();
  return Math.round(ms / 86_400_000);
}

function parseDay(value: string): Date {
  if (!isIsoDay(value)) throw new Error('Invalid calendar date');
  return new Date(`${value}T00:00:00.000Z`);
}
