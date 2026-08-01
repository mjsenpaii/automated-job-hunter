import type { DiscoveredJob } from './contracts.js';
import type { DiscoveryDiagnosticReasonCode } from './profile-coverage-diagnostics.js';

export interface DiscoveryFilters {
  remoteOnly: boolean;
  query: string;
  category?: string;
}

export interface DiscoveryFilterEvaluation {
  matches: boolean;
  reasons: DiscoveryDiagnosticReasonCode[];
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
  return evaluateDiscoveryFilters(job, filters).matches;
}

export function evaluateDiscoveryFilters(
  job: DiscoveredJob,
  filters: DiscoveryFilters,
): DiscoveryFilterEvaluation {
  const reasons: DiscoveryDiagnosticReasonCode[] = [];
  if (filters.remoteOnly && job.remote !== true) {
    reasons.push('EXCLUDED_LOCATION');
  }

  const category = normalizedCategory(filters.category ?? '');
  if (
    category &&
    normalizedCategory(job.category ?? '') !== category
  ) {
    reasons.push('UNRELATED_ROLE_FAMILY');
  }

  const query = filters.query.trim().toLocaleLowerCase();
  if (!query) return { matches: reasons.length === 0, reasons };

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
  if (!searchable.includes(query)) {
    reasons.push('INSUFFICIENT_POSITIVE_EVIDENCE');
  }
  return { matches: reasons.length === 0, reasons };
}
