import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { getDatabase } from '@/lib/db';
import { jobs, job_scores } from '@job-app/db/schema';
import ScoreGauge from '@/components/ScoreGauge';
import StatusBadge from '@/components/StatusBadge';
import WorkSetupBadge from '@/components/WorkSetupBadge';
import FactorChart, { type FactorDatum } from '@/components/FactorChart';

// This page renders ONLY persisted production-pipeline results read from the
// local database at request time. No demo/mock values. Reading the DB happens
// per-request (never at build), so this route is always dynamic.
export const dynamic = 'force-dynamic';

/**
 * Factor display metadata: label + maximum points each factor can contribute.
 * Mirrors the 100-point model in `@job-app/core` `ScoreFactorsSchema`.
 */
const FACTOR_META: { key: string; label: string; max: number }[] = [
  { key: 'role_fit', label: 'Role fit', max: 20 },
  { key: 'technical_match', label: 'Technical match', max: 25 },
  { key: 'experience_fit', label: 'Experience fit', max: 15 },
  { key: 'location_eligibility', label: 'Location & eligibility', max: 15 },
  { key: 'work_setup_fit', label: 'Work-setup fit', max: 10 },
  { key: 'employment_fit', label: 'Employment fit', max: 5 },
  { key: 'project_relevance', label: 'Project relevance', max: 5 },
  { key: 'freshness', label: 'Freshness', max: 5 },
];

function safeParseArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((v) => String(v)) : [];
  } catch {
    return [];
  }
}

function safeParseFactors(value: string | null | undefined): Record<string, number> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, number>) : null;
  } catch {
    return null;
  }
}

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const db = getDatabase();
  const rows = await db
    .select({ job: jobs, score: job_scores })
    .from(jobs)
    .leftJoin(job_scores, eq(jobs.id, job_scores.job_id))
    .where(eq(jobs.id, id))
    .limit(1);

  if (!rows || rows.length === 0) {
    return (
      <div className="animate-fade-in">
        <Link href="/" className="back-link mb-6 inline-block">← Back to Dashboard</Link>
        <div className="glass-card">
          <h1 className="mb-2">Job not found</h1>
          <p className="text-muted">No job exists with id <code>{id}</code>.</p>
        </div>
      </div>
    );
  }

  const { job, score } = rows[0];

  const isHardRejected = job.status === 'HARD_REJECTED';
  const rejectionReasons = safeParseArray(job.rejection_reasons);
  const factors = safeParseFactors(score?.factors);
  const matchedSkills = safeParseArray(score?.matched_skills);
  const missingSkills = safeParseArray(score?.missing_skills);
  const riskFlags = safeParseArray(score?.risk_flags);
  const requiredSkills = safeParseArray(job.required_skills);
  const preferredSkills = safeParseArray(job.preferred_skills);

  // Only treat scoring data as present when the pipeline actually produced it.
  const hasScore = score != null && factors != null;
  const scoreRow = hasScore ? score : null;

  const factorRows: FactorDatum[] = hasScore && factors
    ? FACTOR_META.map((f) => ({
        name: f.label,
        value: typeof factors[f.key] === 'number' ? factors[f.key] : 0,
        max: f.max,
      }))
    : [];

  const locationParts = [job.city, job.region, job.country].filter(Boolean);
  const location = locationParts.length > 0 ? locationParts.join(', ') : 'Location not specified';

  return (
    <div className="animate-fade-in job-detail-page">
      <Link href="/" className="back-link mb-6 inline-block">← Back to Dashboard</Link>

      <div className="grid grid-cols-3 lg-grid-cols-1 gap-6">
        <div className="col-span-2 lg-col-span-1">
          <div className="glass-card mb-6">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h1 className="mb-2">{job.title}</h1>
                <h3 className="company-name text-muted">{job.company}</h3>
              </div>
              {scoreRow ? (
                <ScoreGauge score={scoreRow.score} size={80} />
              ) : (
                <span className="not-evaluated-badge">Not evaluated</span>
              )}
            </div>

            <div className="flex gap-4 flex-wrap mb-8">
              <WorkSetupBadge setup={job.work_setup} />
              <StatusBadge status={isHardRejected ? 'Rejected' : job.status} />
              <span className="badge glass-panel">{location}</span>
              {job.eligibility_status && (
                <span className="badge glass-panel">Eligibility: {job.eligibility_status}</span>
              )}
            </div>

            {isHardRejected && (
              <section className="reject-banner mb-8">
                <h3>Hard-rejected by the scoring pipeline</h3>
                {rejectionReasons.length > 0 ? (
                  <ul className="reject-list">
                    {rejectionReasons.map((r) => (
                      <li key={r}>{r.replace(/_/g, ' ')}</li>
                    ))}
                  </ul>
                ) : (
                  <p>Rejection reason was not recorded for this job.</p>
                )}
              </section>
            )}

            <section className="mb-8">
              <h3>Job Description</h3>
              <p className="description">{job.description}</p>
            </section>

            {requiredSkills.length > 0 && (
              <section className="mb-8">
                <h3>Required Skills</h3>
                <div className="chip-row">
                  {requiredSkills.map((s) => (
                    <span key={s} className="badge glass-panel">{s}</span>
                  ))}
                </div>
              </section>
            )}

            {preferredSkills.length > 0 && (
              <section>
                <h3>Preferred Skills</h3>
                <div className="chip-row">
                  {preferredSkills.map((s) => (
                    <span key={s} className="badge glass-panel">{s}</span>
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>

        <div className="col-span-1">
          <div className="glass-card mb-6">
            <h3 className="mb-4">Match Analysis</h3>
            {scoreRow ? (
              <>
                <div className="recommendation mb-4">
                  <span className="text-muted">Recommendation</span>
                  <strong>{(scoreRow.recommendation || '').replace(/_/g, ' ') || '—'}</strong>
                </div>

                <FactorChart factors={factorRows} />

                {matchedSkills.length > 0 && (
                  <div className="skills-block">
                    <h4>Matched skills</h4>
                    <div className="chip-row">
                      {matchedSkills.map((s) => (
                        <span key={s} className="badge chip-match">{s}</span>
                      ))}
                    </div>
                  </div>
                )}

                {missingSkills.length > 0 && (
                  <div className="skills-block">
                    <h4>Missing required skills</h4>
                    <div className="chip-row">
                      {missingSkills.map((s) => (
                        <span key={s} className="badge chip-missing">{s}</span>
                      ))}
                    </div>
                  </div>
                )}

                {riskFlags.length > 0 && (
                  <div className="skills-block">
                    <h4>Risk flags</h4>
                    <ul className="risk-list">
                      {riskFlags.map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {scoreRow.reason && <p className="reason">{scoreRow.reason}</p>}
              </>
            ) : (
              <p className="not-evaluated">
                Not evaluated
                {isHardRejected ? ' — this job was hard-rejected before scoring.' : '.'}
              </p>
            )}
          </div>

          <div className="glass-card action-panel">
            <h3 className="mb-4">Actions</h3>
            <div className="flex flex-col gap-3">
              {isHardRejected ? (
                <p className="text-muted actions-disabled-note">
                  Generate Resume and Approve &amp; Shortlist are disabled for hard-rejected jobs.
                </p>
              ) : (
                <>
                  <button className="btn btn-primary w-full">Generate Resume</button>
                  <button
                    className="btn btn-outline w-full"
                    style={{ borderColor: 'var(--status-approved)', color: 'var(--status-approved)' }}
                  >
                    Approve &amp; Shortlist
                  </button>
                  <button
                    className="btn btn-outline w-full"
                    style={{ borderColor: 'var(--status-rejected)', color: 'var(--status-rejected)' }}
                  >
                    Reject Job
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .back-link {
          color: var(--text-muted);
          transition: color 0.2s;
        }
        .back-link:hover {
          color: var(--text-primary);
        }

        .company-name {
          color: var(--text-secondary);
          font-weight: 500;
        }

        .col-span-2 { grid-column: span 2 / span 2; }
        .col-span-1 { grid-column: span 1 / span 1; }

        @media (max-width: 1024px) {
          .lg-col-span-1 { grid-column: span 1 / span 1; }
        }

        .description {
          color: var(--text-secondary);
          white-space: pre-wrap;
        }

        .chip-row {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
        }

        .reject-banner {
          border: 1px solid var(--status-rejected);
          border-radius: 12px;
          padding: 1rem 1.25rem;
          background: rgba(239, 68, 68, 0.08);
        }
        .reject-banner h3 {
          color: var(--status-rejected);
          margin-bottom: 0.5rem;
        }
        .reject-list {
          list-style: none;
          padding-left: 0;
          margin: 0;
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
        }
        .reject-list li {
          text-transform: capitalize;
          background: rgba(239, 68, 68, 0.15);
          color: var(--status-rejected);
          padding: 0.25rem 0.75rem;
          border-radius: 999px;
          font-size: 0.8125rem;
          font-weight: 600;
        }

        .recommendation {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }
        .recommendation strong {
          text-transform: capitalize;
        }

        .skills-block {
          margin-top: 1.5rem;
        }
        .skills-block h4 {
          margin-bottom: 0.5rem;
          font-size: 0.9375rem;
        }
        .chip-match {
          background: rgba(16, 185, 129, 0.15);
          color: var(--status-approved);
        }
        .chip-missing {
          background: rgba(239, 68, 68, 0.15);
          color: var(--status-rejected);
        }
        .risk-list {
          margin: 0;
          padding-left: 1.25rem;
          color: var(--text-secondary);
        }
        .reason {
          margin-top: 1.5rem;
          color: var(--text-secondary);
          font-style: italic;
        }

        .not-evaluated,
        .actions-disabled-note {
          color: var(--text-muted);
        }
        .not-evaluated-badge {
          padding: 0.5rem 1rem;
          border: 1px dashed var(--glass-border);
          border-radius: 999px;
          color: var(--text-muted);
          font-size: 0.875rem;
          white-space: nowrap;
        }

        .w-full { width: 100%; }
      `}</style>
    </div>
  );
}
