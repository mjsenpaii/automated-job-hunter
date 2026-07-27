'use client';

import Link from 'next/link';
import { useId, useMemo, useState, type KeyboardEvent } from 'react';
import {
  getMissingConfirmFields,
  type JobImportResult,
} from '@job-app/ingestion/import-contracts';
import type {
  EnrichedGeminiJobExtraction,
  GeminiExtractionMetadata,
  GeminiJobExtraction,
} from '@job-app/ingestion/gemini-contracts';
import { updateExtractionField } from '@/lib/import/extraction-state';
import { AppIcon } from './icons';
import { ExtractionOverviewFields } from './ExtractionOverviewFields';
import {
  ApplicationReview,
  OriginalContentReview,
  RequirementsReview,
} from './ExtractionReviewSections';
import StatusBadge from './StatusBadge';

type ReviewTab = 'overview' | 'requirements' | 'application' | 'original';

const REVIEW_TABS: Array<{ id: ReviewTab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'requirements', label: 'Requirements' },
  { id: 'application', label: 'Application' },
  { id: 'original', label: 'Original content' },
];

export function getAnalysisMethodPresentation(
  metadata: Pick<
    GeminiExtractionMetadata,
    'fallbackUsed' | 'fallbackReason'
  >,
): { label: string; detail: string } {
  if (!metadata.fallbackUsed) {
    return {
      label: 'Analysed with Flash Lite',
      detail: 'The first extraction passed the accuracy checks.',
    };
  }
  const serviceFallback =
    metadata.fallbackReason === 'PRIMARY_RATE_LIMITED' ||
    metadata.fallbackReason === 'PRIMARY_SERVICE_UNAVAILABLE' ||
    metadata.fallbackReason === 'PRIMARY_TIMEOUT';
  return {
    label: 'Re-analysed with Flash for accuracy',
    detail: serviceFallback
      ? 'The first pass was temporarily unavailable, so one fallback pass was used.'
      : 'The first pass needed more certainty, so one accuracy pass was used.',
  };
}

export function ExtractionReview({
  extraction,
  originalContent,
  metadata,
  editing,
  scoring,
  result,
  error,
  onChange,
  onEdit,
  onConfirm,
  onStartOver,
}: {
  extraction: EnrichedGeminiJobExtraction;
  originalContent: string;
  metadata: GeminiExtractionMetadata;
  editing: boolean;
  scoring: boolean;
  result: JobImportResult | null;
  error: string | null;
  onChange: (value: EnrichedGeminiJobExtraction) => void;
  onEdit: () => void;
  onConfirm: () => void;
  onStartOver: () => void;
}) {
  const [tab, setTab] = useState<ReviewTab>('overview');
  const id = useId();
  const analysisMethod = getAnalysisMethodPresentation(metadata);
  const missing = useMemo(
    () =>
      getMissingConfirmFields({
        title: extraction.title,
        company: extraction.company,
        description: extraction.description,
        url: extraction.sourceUrl,
        country: extraction.country,
        city: extraction.city,
        location: extraction.location,
        work_setup: extraction.workSetup,
      }),
    [extraction],
  );
  const hasRequiredMissing = missing.length > 0;

  const set = <K extends keyof GeminiJobExtraction>(
    field: K,
    value: GeminiJobExtraction[K],
  ) => onChange(updateExtractionField(extraction, field, value));

  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const current = REVIEW_TABS.findIndex((item) => item.id === tab);
    let next = current;
    if (event.key === 'ArrowRight') next = (current + 1) % REVIEW_TABS.length;
    else if (event.key === 'ArrowLeft') {
      next = (current - 1 + REVIEW_TABS.length) % REVIEW_TABS.length;
    } else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = REVIEW_TABS.length - 1;
    else return;
    event.preventDefault();
    const nextTab = REVIEW_TABS[next];
    if (!nextTab) return;
    setTab(nextTab.id);
    document.getElementById(`${id}-${nextTab.id}-tab`)?.focus();
  };

  return (
    <div className="review-grid">
      <section className="panel extraction-main" aria-labelledby={`${id}-review-title`}>
        <div className="extraction-summary">
          <div>
            <p className="eyebrow">Gemini analysis</p>
            <h2 id={`${id}-review-title`}>
              {extraction.title || 'Untitled role'}
            </h2>
            <p>
              {extraction.company || 'Company not provided'}
              {extraction.location ? ` · ${extraction.location}` : ''}
            </p>
          </div>
          <div className="confidence">
            <strong>{Math.round(metadata.confidence * 100)}%</strong>
            <span>confidence</span>
          </div>
        </div>

        <div className="analysis-method" role="status" aria-live="polite">
          <AppIcon name="check" size={17} />
          <span>
            <strong>{analysisMethod.label}</strong>
            <small>{analysisMethod.detail}</small>
          </span>
        </div>

        {hasRequiredMissing && (
          <div className="banner banner-warning review-banner" role="status">
            <AppIcon name="warning" size={18} />
            <span>
              Required before scoring: {missing.join(', ').replace(/_/g, ' ')}.
            </span>
          </div>
        )}

        <div className="section-tabs" role="tablist" aria-label="Extraction review">
          {REVIEW_TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`${id}-${item.id}-tab`}
              aria-controls={`${id}-${item.id}-panel`}
              aria-selected={tab === item.id}
              tabIndex={tab === item.id ? 0 : -1}
              className={tab === item.id ? 'active' : ''}
              onClick={() => setTab(item.id)}
              onKeyDown={onTabKeyDown}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div
          role="tabpanel"
          id={`${id}-${tab}-panel`}
          aria-labelledby={`${id}-${tab}-tab`}
          className="review-tab-panel"
        >
          {tab === 'overview' && (
            <ExtractionOverviewFields
              id={id}
              extraction={extraction}
              editing={editing}
              set={set}
            />
          )}
          {tab === 'requirements' && (
            <RequirementsReview
              id={id}
              extraction={extraction}
              editing={editing}
              set={set}
            />
          )}
          {tab === 'application' && (
            <ApplicationReview
              id={id}
              extraction={extraction}
              editing={editing}
              set={set}
            />
          )}
          {tab === 'original' && (
            <OriginalContentReview originalContent={originalContent} />
          )}
        </div>
      </section>

      <aside className="panel sticky-action-panel" aria-label="Review and actions">
        <div className="action-panel-section">
          <p className="eyebrow">Review status</p>
          {result ? (
            <StatusBadge status={result.status} />
          ) : hasRequiredMissing ? (
            <StatusBadge status="REQUIRES_REVIEW" />
          ) : (
            <StatusBadge status="NOT_EVALUATED" />
          )}
          <dl className="review-summary-list">
            <div>
              <dt>Analysis</dt>
              <dd>{metadata.fallbackUsed ? 'Accuracy fallback' : 'Primary pass'}</dd>
            </div>
            <div>
              <dt>Confidence</dt>
              <dd>{Math.round(metadata.confidence * 100)}%</dd>
            </div>
            <div>
              <dt>Missing required</dt>
              <dd>{missing.length}</dd>
            </div>
          </dl>
        </div>

        {error && (
          <div className="banner banner-danger" role="alert">
            <AppIcon name="warning" size={18} />
            <span>{error}</span>
          </div>
        )}

        {result && (
          <div className="pipeline-result" aria-live="polite">
            {result.status === 'SCORED' && (
              <>
                <span className="result-score">
                  {result.score.score}
                  <small>/100</small>
                </span>
                <p>{result.score.recommendation.replace(/_/g, ' ')}</p>
              </>
            )}
            {(result.status === 'HARD_REJECTED' ||
              result.status === 'INELIGIBLE') && (
              <>
                <strong>Actual pipeline reason</strong>
                <ul>
                  {result.rejectionReasons.map((reason) => (
                    <li key={reason}>{reason.replace(/_/g, ' ')}</li>
                  ))}
                </ul>
              </>
            )}
            {result.status === 'DUPLICATE' && <p>{result.message}</p>}
            {result.jobId && (
              <Link href={`/jobs/${result.jobId}`} className="text-link">
                Open saved job
              </Link>
            )}
          </div>
        )}

        <div className="sticky-actions">
          {!result && (
            <>
              <button
                type="button"
                className="button button-primary"
                onClick={onConfirm}
                disabled={hasRequiredMissing || scoring}
                title={
                  hasRequiredMissing
                    ? 'Complete the highlighted required fields first.'
                    : undefined
                }
              >
                {scoring ? (
                  <>
                    <span className="spinner" aria-hidden="true" />
                    Scoring
                  </>
                ) : (
                  <>
                    <AppIcon name="check" size={18} />
                    Confirm &amp; Score
                  </>
                )}
              </button>
              <button
                type="button"
                className="button button-secondary"
                onClick={onEdit}
              >
                <AppIcon name="edit" size={17} />
                {editing ? 'Finish editing' : 'Edit details'}
              </button>
            </>
          )}
          <button
            type="button"
            className="button button-secondary"
            onClick={onStartOver}
          >
            <AppIcon name="refresh" size={17} />
            Start over
          </button>
        </div>
        {!result && (
          <p className="action-note">
            Nothing is saved or scored until you confirm.
          </p>
        )}
      </aside>
    </div>
  );
}
