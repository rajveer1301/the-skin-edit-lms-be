export interface RevenuePoint {
  label: string;
  value: number;
}

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

export interface MonthBucket {
  label: string;
  year: number;
  month: number; // 0-11
}

export function lastSixMonths(now = new Date()): MonthBucket[] {
  const buckets: MonthBucket[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({
      label: MONTHS[d.getMonth()],
      year: d.getFullYear(),
      month: d.getMonth(),
    });
  }
  return buckets;
}

export function monthKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}`;
}

export function bucketKey(bucket: MonthBucket): string {
  return `${bucket.year}-${bucket.month}`;
}

export function relativeTime(date: Date, now = new Date()): string {
  const diffMs = now.getTime() - date.getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'Yesterday';
  return `${days} days ago`;
}
