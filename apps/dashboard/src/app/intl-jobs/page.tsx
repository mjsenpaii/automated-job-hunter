import Link from 'next/link';
import { desc, eq } from 'drizzle-orm';
import { jobs, job_scores } from '@job-app/db/schema';
import { getDatabase } from '@/lib/db';
import { AppIcon } from '@/components/icons';
import { JobList } from '@/components/JobList';
import { PageHeader } from '@/components/PageHeader';
import { toJobListItem } from '@/lib/jobs/view-model';

export const dynamic = 'force-dynamic';

export default async function InternationalJobsPage() {
  const db = getDatabase();
  const rows = await db
    .select({ job: jobs, score: job_scores })
    .from(jobs)
    .leftJoin(job_scores, eq(jobs.id, job_scores.job_id))
    .where(eq(jobs.category, 'INTERNATIONAL'))
    .orderBy(desc(jobs.created_at));

  return (
    <>
      <PageHeader
        eyebrow="Opportunities"
        title="International jobs"
        description="Global roles with work setup, eligibility, and score visible at a glance."
        action={
          <Link href="/import-job" className="button button-primary">
            <AppIcon name="import" size={18} />
            Import job
          </Link>
        }
      />
      <JobList
        jobs={rows.map(toJobListItem)}
        emptyLabel="No international jobs have been imported yet."
      />
    </>
  );
}
