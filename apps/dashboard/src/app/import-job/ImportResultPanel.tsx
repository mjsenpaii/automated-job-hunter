'use client';

import Link from 'next/link';
import type { JobImportResult } from '@job-app/ingestion/import-contracts';
import { displayOrFallback } from './ImportField';

export function ImportResultPanel({
  result,
  onAgain,
  onEdit,
}: {
  result: JobImportResult;
  onAgain: () => void;
  onEdit: () => void;
}) {
  if (result.status === 'DUPLICATE') {
    const existingId = result.duplicateOfId || result.jobId;
    return (
      <section className="panel result-panel">
        <h2>Duplicate posting</h2>
        <p>This job already exists in your saved jobs. No new record was created.</p>
        <div className="form-actions">
          {existingId && (
            <Link href={`/jobs/${existingId}`} className="btn btn-primary">
              Open saved job
            </Link>
          )}
          <button type="button" className="btn btn-outline" onClick={onAgain}>
            Import another
          </button>
        </div>
      </section>
    );
  }

  const rejected =
    result.status === 'HARD_REJECTED' || result.status === 'INELIGIBLE';
  const scored = result.status === 'SCORED';

  return (
    <section className="panel result-panel">
      <header className="result-head">
        <div>
          <p className="eyebrow">
            {result.status === 'INELIGIBLE'
              ? 'Rejected before scoring — ineligible'
              : rejected
                ? 'Rejected before scoring'
                : 'Scored'}
          </p>
          <h2>{displayOrFallback(result.title, 'Untitled role')}</h2>
          <p className="meta">{displayOrFallback(result.company, 'Not provided')}</p>
        </div>
        <div className="score-box" aria-label="Match score">
          {scored && result.score ? (
            <>
              <span className="score-value">{result.score.score}</span>
              <span className="score-label">/ 100</span>
              <p className="rec">{result.score.recommendation.replace(/_/g, ' ')}</p>
            </>
          ) : (
            <span className="not-eval">Not evaluated</span>
          )}
        </div>
      </header>

      {rejected && (
        <div className="banner banner-error" role="status">
          <strong>Rejection reasons</strong>
          <ul className="reason-list">
            {(result.rejectionReasons ?? []).map((r) => (
              <li key={r}>{r.replace(/_/g, ' ')}</li>
            ))}
          </ul>
        </div>
      )}

      {scored && result.score && (
        <div className="decision">
          {result.score.reason && <p>{result.score.reason}</p>}
          {result.score.matched_skills && result.score.matched_skills.length > 0 && (
            <p>
              <strong>Matched skills:</strong> {result.score.matched_skills.join(', ')}
            </p>
          )}
          {result.score.missing_skills && result.score.missing_skills.length > 0 && (
            <p>
              <strong>Missing required skills:</strong>{' '}
              {result.score.missing_skills.join(', ')}
            </p>
          )}
          {result.score.risk_flags && result.score.risk_flags.length > 0 && (
            <p>
              <strong>Risk flags:</strong> {result.score.risk_flags.join('; ')}
            </p>
          )}
          {result.eligibilityStatus && (
            <p>
              <strong>Eligibility:</strong> {result.eligibilityStatus}
            </p>
          )}
        </div>
      )}

      <div className="form-actions">
        {result.jobId && (
          <Link href={`/jobs/${result.jobId}`} className="btn btn-primary">
            Open saved job
          </Link>
        )}
        <button type="button" className="btn btn-outline" onClick={onAgain}>
          Import another
        </button>
        {rejected && (
          <button type="button" className="btn btn-outline" onClick={onEdit}>
            Edit extracted details
          </button>
        )}
      </div>
    </section>
  );
}
