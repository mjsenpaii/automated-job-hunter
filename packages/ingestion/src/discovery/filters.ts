import type { DiscoveredJob } from './contracts.js';

export interface DiscoveryFilters {
  remoteOnly: boolean;
  query: string;
}

export function matchesDiscoveryFilters(
  job: DiscoveredJob,
  filters: DiscoveryFilters,
): boolean {
  if (filters.remoteOnly && job.remote !== true) return false;

  const query = filters.query.trim().toLocaleLowerCase();
  if (!query) return true;

  const searchable = [
    job.title,
    job.company,
    job.location ?? '',
    job.description,
    ...job.tags,
  ]
    .join(' ')
    .toLocaleLowerCase();
  return searchable.includes(query);
}
