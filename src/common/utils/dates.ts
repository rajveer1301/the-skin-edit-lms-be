import { registerDecorator, ValidationOptions } from 'class-validator';

export function isIsoDay(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

export function IsCalendarDate(options?: ValidationOptions): PropertyDecorator {
  return (target, propertyName) =>
    registerDecorator({
      name: 'isCalendarDate',
      target: target.constructor,
      propertyName: String(propertyName),
      options,
      validator: {
        validate: isIsoDay,
        defaultMessage: () => '$property must be a valid YYYY-MM-DD date',
      },
    });
}

export function clinicDay(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: process.env.CLINIC_TIMEZONE || 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (name: string) => parts.find((part) => part.type === name)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Interpret a calendar midnight in the configured zone, including DST offsets. */
export function clinicMidnight(day: string): Date {
  const target = Date.parse(`${day}T00:00:00Z`);
  let instant = target;
  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone: process.env.CLINIC_TIMEZONE || 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  for (let i = 0; i < 3; i++) {
    const wall = Date.parse(
      formatter.format(new Date(instant)).replace(' ', 'T') + 'Z',
    );
    instant += target - wall;
  }
  return new Date(instant);
}
