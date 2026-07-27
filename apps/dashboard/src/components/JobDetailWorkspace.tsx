'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { JobDetailData } from '@/lib/jobs/job-export';
import { AppIcon } from './icons';
import { JobExportActions } from './JobExportActions';
import StatusBadge from './StatusBadge';

type DetailTab =
  | 'overview'
  | 'requirements'
  | 'match'
  | 'application'
  | 'source';

function ChipList({
  items,
  empty,
  tone,
}: {
  items: string[];
  empty: string;
  tone?: 'success' | 'danger';
}) {
  if (items.length === 0) return <p className="detail-empty-copy">{empty}</p>;
  return (
    <div className="chip-list">
      {items.map((item) => (
        <span className={`detail-chip${tone ? ` chip-${tone}` : ''}`} key={item}>
          {item}
        </span>
      ))}
    </div>
  );
}

function BulletList({ items, empty }: { items: string[]; empty: string }) {
  if (items.length === 0) return <p className="detail-empty-copy">{empty}</p>;
  return (
    <ul className="detail-bullet-list">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function formatPeso(value: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 0,
  }).format(value);
}

export function JobDetailWorkspace({ job }: { job: JobDetailData }) {
  const router = useRouter();
  const [tab, setTab] = useState<DetailTab>('overview');
  const [status, setStatus] = useState(job.status);
  const [pendingAction, setPendingAction] = useState<'approve' | 'reject' | null>(
    null,
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const rejected = status === 'HARD_REJECTED';

  const tabs: Array<{ id: DetailTab; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'requirements', label: 'Requirements' },
    { id: 'match', label: 'Match' },
    { id: 'application', label: 'Application' },
    { id: 'source', label: 'Source' },
  ];

  const changeStatus = async (action: 'approve' | 'reject') => {
    setPendingAction(action);
    setActionError(null);
    try {
      const response = await fetch(`/api/jobs/${job.id}/${action}`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('The job status could not be updated.');
      setStatus(action === 'approve' ? 'USER_APPROVED' : 'USER_REJECTED');
      router.refresh();
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : 'The job status could not be updated.',
      );
    } finally {
      setPendingAction(null);
    }
  };

  const onTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const current = tabs.findIndex((item) => item.id === tab);
    let next = current;
    if (event.key === 'ArrowRight') next = (current + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (current - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else return;
    event.preventDefault();
    const nextTab = tabs[next];
    if (!nextTab) return;
    setTab(nextTab.id);
    document.getElementById(`job-${nextTab.id}-tab`)?.focus();
  };

  return (
    <>
      <header className="job-detail-header">
        <div>
          <h1>
            <span className="job-identity-label">Position:</span> {job.title}
          </h1>
          <p>
            <span className="job-identity-label">Company:</span> {job.company}
          </p>
        </div>
        <JobExportActions job={{ ...job, status }} />
      </header>

      <section className="panel job-decision-bar" aria-label="Decision summary and actions">
        <div className="decision-state">
          <p className="eyebrow">Decision</p>
          <StatusBadge status={status} />
        </div>
        <dl className="summary-facts">
          <div>
            <dt>Location</dt>
            <dd>{job.location}</dd>
          </div>
          <div>
            <dt>Work setup</dt>
            <dd>{job.workSetup.replace(/_/g, ' ')}</dd>
          </div>
          <div>
            <dt>Eligibility</dt>
            <dd>{job.eligibility?.replace(/_/g, ' ') || 'Not evaluated'}</dd>
          </div>
          <div>
            <dt>Score</dt>
            <dd>{job.score ? `${job.score.value}/100` : 'Not evaluated'}</dd>
          </div>
        </dl>
        <div className="summary-actions">
          <button
            type="button"
            className="button button-primary"
            disabled={rejected || pendingAction !== null}
            aria-busy={pendingAction === 'approve'}
            onClick={() => changeStatus('approve')}
            title={rejected ? 'Hard-rejected jobs cannot be shortlisted.' : undefined}
          >
            <AppIcon name="check" size={17} />
            {pendingAction === 'approve' ? 'Saving…' : 'Shortlist'}
          </button>
          <button
            type="button"
            className="button button-danger"
            disabled={rejected || pendingAction !== null}
            aria-busy={pendingAction === 'reject'}
            onClick={() => changeStatus('reject')}
            title={rejected ? 'This job was already rejected by the pipeline.' : undefined}
          >
            <AppIcon name="close" size={17} />
            {pendingAction === 'reject' ? 'Saving…' : 'Reject'}
          </button>
        </div>
        {actionError && (
          <div className="banner banner-danger decision-error" role="alert">
            {actionError}
          </div>
        )}
      </section>

      {rejected && (
        <section className="rejection-callout" aria-labelledby="rejection-heading">
          <AppIcon name="warning" />
          <div>
            <h2 id="rejection-heading">Hard-rejected before scoring</h2>
            {job.rejectionReasons.length > 0 ? (
              <ul>
                {job.rejectionReasons.map((reason) => (
                  <li key={reason}>{reason.replace(/_/g, ' ')}</li>
                ))}
              </ul>
            ) : (
              <p>
                This is a legacy rejected record, but its original pipeline reason
                is unavailable. No replacement reason has been inferred.
              </p>
            )}
          </div>
        </section>
      )}

      <section className="panel detail-main">
          <div className="section-tabs detail-tabs" role="tablist" aria-label="Job details">
            {tabs.map((item) => (
              <button
                type="button"
                role="tab"
                id={`job-${item.id}-tab`}
                aria-controls={`job-${item.id}-panel`}
                aria-selected={tab === item.id}
                tabIndex={tab === item.id ? 0 : -1}
                className={tab === item.id ? 'active' : ''}
                key={item.id}
                onClick={() => setTab(item.id)}
                onKeyDown={onTabKeyDown}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div
            role="tabpanel"
            id={`job-${tab}-panel`}
            aria-labelledby={`job-${tab}-tab`}
            className="detail-tab-panel"
          >
            {tab === 'overview' && (
              <>
                <section className="detail-section">
                  <h2>Role overview</h2>
                  <dl className="detail-definition-grid">
                    <div>
                      <dt>Location</dt>
                      <dd>{job.location}</dd>
                    </div>
                    <div>
                      <dt>Work setup</dt>
                      <dd>{job.workSetup.replace(/_/g, ' ')}</dd>
                    </div>
                    <div>
                      <dt>Employment</dt>
                      <dd>{job.employmentType.replace(/_/g, ' ')}</dd>
                    </div>
                    <div>
                      <dt>Posted</dt>
                      <dd>{job.datePosted}</dd>
                    </div>
                    <div>
                      <dt>Closing date</dt>
                      <dd>{job.dateExpires}</dd>
                    </div>
                    <div>
                      <dt>Vacancies</dt>
                      <dd>{job.vacancies ?? 'Not provided'}</dd>
                    </div>
                    <div>
                      <dt>Actual salary</dt>
                      <dd>{job.salary || 'Not provided'}</dd>
                    </div>
                    <div>
                      <dt>Salary grade</dt>
                      <dd>
                        {job.salaryGrade === null
                          ? 'Not provided'
                          : `SG ${job.salaryGrade}`}
                      </dd>
                    </div>
                    <div>
                      <dt>Eligibility</dt>
                      <dd>{job.eligibility?.replace(/_/g, ' ') || 'Not evaluated'}</dd>
                    </div>
                  </dl>
                </section>
                {job.salaryReferenceMin !== null &&
                  job.salaryReferenceMax !== null && (
                    <section className="detail-section">
                      <h2>Government salary reference</h2>
                      <dl className="detail-definition-grid">
                        <div>
                          <dt>{job.salaryReferenceScheduleYear} DBM reference</dt>
                          <dd>
                            {formatPeso(job.salaryReferenceMin)}–
                            {formatPeso(job.salaryReferenceMax)} per month
                            {job.salaryReferenceStepMin !== null &&
                              job.salaryReferenceStepMax !== null &&
                              ` · Steps ${job.salaryReferenceStepMin}–${job.salaryReferenceStepMax}`}
                          </dd>
                        </div>
                        <div>
                          <dt>Compensation status</dt>
                          <dd>
                            {job.compensationNote ||
                              'Reference only — this is not an offered salary.'}
                          </dd>
                        </div>
                        <div>
                          <dt>Source</dt>
                          <dd>{job.salaryReferenceSource}</dd>
                        </div>
                      </dl>
                    </section>
                  )}
                <section className="detail-section">
                  <h2>Description</h2>
                  <div className="clean-description">{job.description}</div>
                </section>
              </>
            )}

            {tab === 'requirements' && (
              <div className="detail-two-column">
                <section className="detail-section">
                  <h2>Requirements</h2>
                  <BulletList items={job.requirements} empty="No separate requirements were extracted." />
                </section>
                <section className="detail-section">
                  <h2>Responsibilities</h2>
                  <BulletList items={job.responsibilities} empty="No separate responsibilities were extracted." />
                </section>
                <section className="detail-section">
                  <h2>Required skills</h2>
                  <ChipList items={job.requiredSkills} empty="No required skills were recorded." />
                </section>
                <section className="detail-section">
                  <h2>Preferred skills</h2>
                  <ChipList items={job.preferredSkills} empty="No preferred skills were recorded." />
                </section>
                {job.civilServiceEligibility && (
                  <section className="detail-section">
                    <h2>Civil Service eligibility</h2>
                    <p>{job.civilServiceEligibility}</p>
                  </section>
                )}
                {job.scheduleNotes.length > 0 && (
                  <section className="detail-section">
                    <h2>Schedule notes</h2>
                    <BulletList
                      items={job.scheduleNotes}
                      empty="No schedule obligations were recorded."
                    />
                  </section>
                )}
              </div>
            )}

            {tab === 'match' && (
              <>
                {job.score ? (
                  <div className="match-layout">
                    <section className="detail-section">
                      <h2>{job.score.recommendation.replace(/_/g, ' ')}</h2>
                      <p>{job.score.reason}</p>
                      <div className="factor-list">
                        {job.score.factors.map((factor) => (
                          <div className="factor-item" key={factor.label}>
                            <div>
                              <span>{factor.label}</span>
                              <strong>
                                {factor.value}/{factor.max}
                              </strong>
                            </div>
                            <progress value={factor.value} max={factor.max}>
                              {factor.value} of {factor.max}
                            </progress>
                          </div>
                        ))}
                      </div>
                    </section>
                    <div>
                      <section className="detail-section">
                        <h2>Matched skills</h2>
                        <ChipList items={job.score.matchedSkills} empty="No verified skill matches were recorded." tone="success" />
                      </section>
                      <section className="detail-section">
                        <h2>Missing skills</h2>
                        <ChipList items={job.score.missingSkills} empty="No missing required skills were recorded." tone="danger" />
                      </section>
                      <section className="detail-section">
                        <h2>Risk flags</h2>
                        <BulletList items={job.score.riskFlags} empty="No risk flags were recorded." />
                      </section>
                    </div>
                  </div>
                ) : (
                  <div className="detail-empty-state">
                    <StatusBadge status="NOT_EVALUATED" />
                    <h2>No match score</h2>
                    <p>
                      {rejected
                        ? 'The deterministic pipeline stopped this job before scoring.'
                        : 'No persisted score exists for this job.'}
                    </p>
                  </div>
                )}
              </>
            )}

            {tab === 'application' && (
              <div className="detail-two-column">
                <section className="detail-section">
                  <h2>Instructions</h2>
                  <BulletList items={job.applicationInstructions} empty="No application instructions were extracted." />
                </section>
                <section className="detail-section">
                  <h2>Application details</h2>
                  <dl className="detail-definition-grid single">
                    <div>
                      <dt>Keyword</dt>
                      <dd>{job.applicationKeyword || 'Not provided'}</dd>
                    </div>
                    <div>
                      <dt>Application URL</dt>
                      <dd>
                        {job.applicationUrl ? (
                          <a href={job.applicationUrl} target="_blank" rel="noreferrer" className="text-link">
                            Open application page
                          </a>
                        ) : (
                          'Not provided'
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>Application email</dt>
                      <dd>
                        {job.applicationEmail ? (
                          <a
                            href={`mailto:${job.applicationEmail}`}
                            className="text-link"
                          >
                            {job.applicationEmail}
                          </a>
                        ) : (
                          'Not provided'
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>Application addressee</dt>
                      <dd>{job.applicationAddressee || 'Not provided'}</dd>
                    </div>
                  </dl>
                </section>
              </div>
            )}

            {tab === 'source' && (
              <section className="detail-section">
                <h2>Clean source snapshot</h2>
                <p className="detail-help">
                  Stored source data is shown as text only. HTML markup and inline
                  styles are removed before display.
                </p>
                <pre className="raw-source">{job.rawSource}</pre>
              </section>
            )}
          </div>
      </section>
    </>
  );
}
