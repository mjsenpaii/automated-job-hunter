import type { jobs } from '@job-app/db/schema';
import {
  JOB_SEARCH_PROFILE_IDS,
  JobSearchProfileIdListSchema,
  getJobSearchProfileDisplayName,
  matchJobSearchProfiles,
  type JobSearchProfileId,
} from '@job-app/ingestion/discovery/job-search-profiles';
import {
  safeParseRecord,
  safeParseStringArray,
} from './view-model';
import type { JobProfileFilterOption } from './profile-filtering';

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseStoredProfileIds(
  snapshot: Record<string, unknown> | null,
): JobSearchProfileId[] {
  if (!snapshot) return [];
  const targeting = asRecord(snapshot.targeting);
  const ids = stringArray(targeting?.matchedProfileIds);
  if (ids.length === 0) return [];
  try {
    return JobSearchProfileIdListSchema.parse(
      ids.map((id) => id.trim()).filter(Boolean),
    );
  } catch {
    return [];
  }
}

export function deriveMatchedProfileIds(
  job: typeof jobs.$inferSelect,
): JobSearchProfileId[] {
  const snapshot = safeParseRecord(job.raw_snapshot);
  const stored = parseStoredProfileIds(snapshot);
  if (stored.length > 0) return stored;

  const attribution = asRecord(snapshot?.attribution);
  return matchJobSearchProfiles({
    title: job.title,
    description: job.description,
    category: job.category,
    tags: stringArray(attribution?.tags),
    team: typeof attribution?.team === 'string' ? attribution.team : null,
    department:
      typeof attribution?.department === 'string'
        ? attribution.department
        : null,
    employmentType:
      typeof attribution?.employmentType === 'string'
        ? attribution.employmentType
        : job.employment_type,
    requiredSkills: safeParseStringArray(job.required_skills),
    preferredSkills: safeParseStringArray(job.preferred_skills),
  });
}

export function deriveMatchedProfileLabels(
  ids: readonly JobSearchProfileId[],
): string[] {
  return ids.length > 0
    ? ids.map((id) => getJobSearchProfileDisplayName(id))
    : ['Untargeted'];
}

export function getJobProfileFilterOptions(): JobProfileFilterOption[] {
  return JOB_SEARCH_PROFILE_IDS.map((id) => ({
    id,
    label: getJobSearchProfileDisplayName(id),
  }));
}
