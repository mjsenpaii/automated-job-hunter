import type { jobs, job_scores } from '@job-app/db/schema';

export interface JobListItem {
  id: string;
  title: string;
  company: string;
  location: string;
  workSetup: string;
  score: number | null;
  recommendation: string | null;
  status: string;
  date: string | null;
  category: string | null;
}

export function formatPersistedDate(value: string | null): string {
  if (!value) return 'Not provided';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not provided';
  return new Intl.DateTimeFormat('en', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

export function toJobListItem(row: {
  job: typeof jobs.$inferSelect;
  score: typeof job_scores.$inferSelect | null;
}): JobListItem {
  return {
    id: row.job.id,
    title: row.job.title,
    company: row.job.company,
    location:
      [row.job.city, row.job.region, row.job.country].filter(Boolean).join(', ') ||
      'Not specified',
    workSetup: row.job.work_setup,
    score: row.score?.score ?? null,
    recommendation: row.score?.recommendation ?? null,
    status: row.job.status,
    date: row.job.date_posted || row.job.created_at || null,
    category: row.job.category,
  };
}

export function safeParseStringArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function safeParseRecord(
  value: string | null | undefined,
): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function resolveRecordedRejectionReasons(
  persisted: string | null | undefined,
  snapshot: Record<string, unknown> | null,
): string[] {
  const persistedReasons = safeParseStringArray(persisted);
  if (persistedReasons.length > 0) return persistedReasons;
  if (!snapshot || typeof snapshot.pipeline !== 'object' || !snapshot.pipeline) {
    return [];
  }
  const pipeline = snapshot.pipeline as Record<string, unknown>;
  return Array.isArray(pipeline.rejectionReasons)
    ? pipeline.rejectionReasons.filter(
        (value): value is string => typeof value === 'string',
      )
    : [];
}
