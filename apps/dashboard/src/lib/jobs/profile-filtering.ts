export interface JobProfileFilterOption {
  id: string;
  label: string;
}

export type JobProfileFilterValue = 'ALL' | 'UNTARGETED' | string;

export function matchesJobProfileFilter(
  matchedProfileIds: readonly string[],
  filter: JobProfileFilterValue,
): boolean {
  if (filter === 'ALL') return true;
  if (filter === 'UNTARGETED') return matchedProfileIds.length === 0;
  return matchedProfileIds.includes(filter);
}

export function filterJobsByProfile<
  T extends { matchedProfileIds: readonly string[] },
>(jobs: readonly T[], filter: JobProfileFilterValue): T[] {
  return jobs.filter((job) =>
    matchesJobProfileFilter(job.matchedProfileIds, filter),
  );
}
