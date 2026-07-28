import Link from 'next/link';
import { desc, eq, or } from 'drizzle-orm';
import { jobs, job_scores } from '@job-app/db/schema';
import { getDatabase } from '@/lib/db';
import { AppIcon } from '@/components/icons';
import { JobList } from '@/components/JobList';
import { PageHeader } from '@/components/PageHeader';
import { toJobListItem } from '@/lib/jobs/view-model';
import {
  deriveMatchedProfileIds,
  deriveMatchedProfileLabels,
  getJobProfileFilterOptions,
} from '@/lib/jobs/profile-targeting';

export const dynamic = 'force-dynamic';

export default async function PHJobsPage() {
  const db = getDatabase();
  const rows = await db
    .select({ job: jobs, score: job_scores })
    .from(jobs)
    .leftJoin(job_scores, eq(jobs.id, job_scores.job_id))
    .where(or(eq(jobs.category, 'PH'), eq(jobs.country, 'Philippines')))
    .orderBy(desc(jobs.created_at));

  return (
    <>
      <PageHeader
        eyebrow="Opportunities"
        title="Philippine jobs"
        description="Search and compare local roles without opening oversized job cards."
        action={
          <Link href="/import-job" className="button button-primary">
            <AppIcon name="import" size={18} />
            Import job
          </Link>
        }
      />
      <JobList
        profileFilterOptions={getJobProfileFilterOptions()}
        jobs={rows.map((row) => {
          const matchedProfileIds = deriveMatchedProfileIds(row.job);
          return {
            ...toJobListItem(row),
            matchedProfileIds,
            matchedProfileLabels: deriveMatchedProfileLabels(matchedProfileIds),
          };
        })}
        emptyLabel="No Philippine jobs have been imported yet."
      />
    </>
  );
}
