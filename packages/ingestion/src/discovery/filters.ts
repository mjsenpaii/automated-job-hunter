import type { DiscoveredJob } from './contracts.js';

export interface DiscoveryFilters {
  remoteOnly: boolean;
  query: string;
  category?: string;
}

function normalizedCategory(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((part) => (part === 'dev' ? 'development' : part))
    .join(' ');
}

export function matchesDiscoveryFilters(
  job: DiscoveredJob,
  filters: DiscoveryFilters,
): boolean {
  if (filters.remoteOnly && job.remote !== true) return false;

  const category = normalizedCategory(filters.category ?? '');
  if (
    category &&
    normalizedCategory(job.category ?? '') !== category
  ) {
    return false;
  }

  const query = filters.query.trim().toLocaleLowerCase();
  if (!query) return true;

  const searchable = [
    job.title,
    job.company,
    job.category ?? '',
    job.team ?? '',
    job.department ?? '',
    job.employmentType ?? '',
    job.location ?? '',
    job.description,
    ...job.tags,
  ]
    .join(' ')
    .toLocaleLowerCase();
  return searchable.includes(query);
}
