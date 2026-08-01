export const PUBLIC_JOB_DISCOVERY_TIMEZONE = 'Asia/Manila' as const;

export function philippineCalendarDate(instant: Date): string {
  if (Number.isNaN(instant.getTime())) {
    throw new RangeError('Scheduled timestamp is invalid.');
  }
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: PUBLIC_JOB_DISCOVERY_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const value = (type: 'year' | 'month' | 'day') =>
    parts.find((part) => part.type === type)?.value;
  const year = value('year');
  const month = value('month');
  const day = value('day');
  if (!year || !month || !day) {
    throw new RangeError('Unable to resolve the Philippine calendar date.');
  }
  return `${year}-${month}-${day}`;
}
