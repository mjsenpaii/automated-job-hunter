import Link from 'next/link';
import { desc, eq } from 'drizzle-orm';
import { jobs, job_scores } from '@job-app/db/schema';
import { getDatabase } from '@/lib/db';
import { AppIcon } from '@/components/icons';
import { EmptyState } from '@/components/EmptyState';
import { MetricCard } from '@/components/MetricCard';
import { PageHeader } from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';

export const dynamic = 'force-dynamic';

function formatDate(value: string): string {
  if (!value) return 'Date unknown';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Date unknown'
    : new Intl.DateTimeFormat('en', {
        month: 'short',
        day: 'numeric',
      }).format(date);
}

export default async function DashboardHome() {
  const db = getDatabase();
  const jobRows = await db
    .select({ job: jobs, score: job_scores })
    .from(jobs)
    .leftJoin(job_scores, eq(jobs.id, job_scores.job_id))
    .orderBy(desc(jobs.created_at));

  const totalJobs = jobRows.length;
  const awaitingReview = jobRows.filter(
    ({ job }) =>
      job.eligibility_status === 'REQUIRES_REVIEW' ||
      ['DISCOVERED', 'INGESTED'].includes(job.status),
  ).length;
  const shortlisted = jobRows.filter(
    ({ job }) => job.status === 'USER_APPROVED',
  ).length;
  const hardRejected = jobRows.filter(
    ({ job }) => job.status === 'HARD_REJECTED',
  ).length;
  const recent = jobRows.slice(0, 6);

  const nextAction =
    totalJobs === 0
      ? {
          title: 'Import your first job',
          description:
            'Paste a listing and let Gemini prepare a reviewable draft before the existing pipeline scores it.',
          href: '/import-job',
          label: 'Import job',
        }
      : awaitingReview > 0
        ? {
            title: `Review ${awaitingReview} uncertain ${awaitingReview === 1 ? 'job' : 'jobs'}`,
            description:
              'These roles need a location or eligibility decision before you can rely on their recommendation.',
            href: '/intl-jobs',
            label: 'Open review queue',
          }
        : {
            title: 'Add another opportunity',
            description:
              'Your current queue is classified. Import a new role when you find one worth evaluating.',
            href: '/import-job',
            label: 'Import job',
          };

  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="Overview"
        description="A concise view of imported opportunities and the decisions that need your attention."
        action={
          <Link href="/import-job" className="button button-primary">
            <AppIcon name="import" size={18} />
            Import job
          </Link>
        }
      />

      <section className="metrics-grid" aria-label="Job pipeline metrics">
        <MetricCard
          label="Imported jobs"
          value={totalJobs}
          detail="All saved opportunities"
          icon="briefcase"
          tone="info"
        />
        <MetricCard
          label="Awaiting review"
          value={awaitingReview}
          detail="Eligibility or status check"
          icon="clock"
          tone="warning"
        />
        <MetricCard
          label="Shortlisted"
          value={shortlisted}
          detail="Approved by you"
          icon="check"
          tone="success"
        />
        <MetricCard
          label="Hard rejected"
          value={hardRejected}
          detail="Stopped before scoring"
          icon="warning"
          tone="danger"
        />
      </section>

      {totalJobs === 0 ? (
        <EmptyState
          title="No imported jobs yet"
          description="Start with a job URL, copied webpage, raw HTML, or a plain job description."
          actionLabel="Import your first job"
          actionHref="/import-job"
          icon="import"
        />
      ) : (
        <div className="dashboard-grid">
          <section className="panel" aria-labelledby="recent-jobs-heading">
            <div className="section-header">
              <div>
                <h2 id="recent-jobs-heading">Recent jobs</h2>
                <p>Latest pipeline activity</p>
              </div>
              <Link href="/ph-jobs" className="text-link">
                Browse all
              </Link>
            </div>
            <div className="recent-list">
              {recent.map(({ job, score }) => (
                <Link
                  href={`/jobs/${job.id}`}
                  className="recent-row"
                  key={job.id}
                >
                  <span className="recent-job">
                    <strong>{job.title}</strong>
                    <span>{job.company}</span>
                  </span>
                  <StatusBadge status={job.status} />
                  <span className="recent-date">{formatDate(job.created_at)}</span>
                  <span className={`score-cell${score ? '' : ' muted'}`}>
                    {score ? `${score.score}/100` : '—'}
                  </span>
                </Link>
              ))}
            </div>
          </section>

          <aside className="panel next-action" aria-labelledby="next-action-heading">
            <span className="next-action-icon">
              <AppIcon name="spark" />
            </span>
            <p className="eyebrow">Recommended next action</p>
            <h2 id="next-action-heading">{nextAction.title}</h2>
            <p>{nextAction.description}</p>
            <Link href={nextAction.href} className="button button-primary">
              {nextAction.label}
              <AppIcon name="arrowRight" size={17} />
            </Link>
          </aside>
        </div>
      )}
    </>
  );
}
