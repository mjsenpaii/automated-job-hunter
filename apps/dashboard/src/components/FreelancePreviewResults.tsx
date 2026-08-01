'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type {
  FreelancePreviewOpportunitySummary,
  FreelancePreviewSaveResponse,
  FreelanceReadinessBlocker,
  FreelanceScanResult,
  FreelanceSource,
} from '@job-app/ingestion/freelance/contracts';
import { AppIcon } from './icons';

type PreviewFilter = 'ALL' | 'READY_NOW' | 'LEARNABLE_FAST_WITH_AI' | 'REVIEW_SCOPE_MANUALLY' | 'NOT_READY';

const SOURCE_LABELS: Record<FreelanceSource, string> = {
  HIMALAYAS: 'Himalayas',
  REMOTIVE: 'Remotive',
  TAVILY: 'Tavily',
  GEMINI_SEARCH: 'Gemini Search',
  MANUAL: 'Manual URL import',
};

export const PREVIEW_READINESS_BLOCKER_LABELS: Record<FreelanceReadinessBlocker, string> = {
  MANDATORY_EXPERIENCE_REQUIREMENT: 'Mandatory experience requirement',
  SENIOR_OR_LEAD_RESPONSIBILITY: 'Senior or lead responsibility',
  UNRELATED_JOB_FAMILY: 'Unrelated job family',
  INSUFFICIENT_TASK_SCOPE_EVIDENCE: 'Unsupported task scope',
  SKILL_GAP_TOO_BROAD: 'Skill gap is too broad',
  LEARNING_ESTIMATE_CANNOT_BE_DEFENDED: 'Learning estimate cannot be defended',
  CERTIFICATION_OR_REGULATED_WORK: 'Certification or regulated work',
  GEOGRAPHIC_RESTRICTION: 'Incompatible geographic restriction',
  FULL_TIME_NOT_FREELANCE: 'Full-time rather than freelance',
  VAGUE_PROJECT_SCOPE: 'Project scope is too vague',
  PAY_UNKNOWN: 'Pay requires review',
  SCAM_OR_COMPLIANCE_BOUNDARY: 'Safety or compliance boundary',
  OTHER_DETERMINISTIC_REASON: 'Other deterministic readiness boundary',
};

const READINESS_LABELS = {
  READY_NOW: 'READY NOW',
  LEARNABLE_FAST_WITH_AI: 'LEARNABLE FAST WITH AI',
  REVIEW_SCOPE_MANUALLY: 'REVIEW SCOPE MANUALLY',
  NOT_READY: 'NOT READY',
  HARD_REJECTED: 'HARD REJECTED',
} as const;

const ACTION_LABELS = {
  REVIEW_AND_APPLY_MANUALLY: 'Review and apply manually',
  APPLY_AFTER_PRACTICE: 'Apply after practice',
  BUILD_SAMPLE_FIRST: 'Build sample first',
  REVIEW_SCOPE_WITH_CLIENT: 'Review scope with client',
  SKIP_FOR_NOW: 'Skip for now',
} as const;

function safeOriginalUrl(value: string): string | null {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLocaleLowerCase();
    const blocked = hostname === 'localhost' || hostname.endsWith('.local') ||
      ['[::1]', '::1', '0.0.0.0'].includes(hostname) ||
      /^127\./.test(hostname) || /^10\./.test(hostname) || /^192\.168\./.test(hostname) ||
      /^169\.254\./.test(hostname) || /^172\.(1[6-9]|2\d|3[01])\./.test(hostname);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !blocked
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function humanize(value: string): string {
  return value.replaceAll('_', ' ').toLocaleLowerCase();
}

function publishedLabel(value: string | null): string {
  if (!value) return 'Published date unavailable';
  return new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium' }).format(new Date(value));
}

function PreviewMetric({ label, value }: { label: string; value: number | string }) {
  return <div className="freelance-preview-metric"><strong>{value}</strong><span>{label}</span></div>;
}

function OpportunityDetails({ opportunity }: { opportunity: FreelancePreviewOpportunitySummary }) {
  return <details className="freelance-preview-disclosure">
    <summary>Review details</summary>
    <div className="freelance-preview-detail-grid">
      <section>
        <h5>Skills</h5>
        <p><strong>Transferable:</strong> {opportunity.transferableSkills.length > 0 ? opportunity.transferableSkills.join(' · ') : 'No verified overlap identified'}</p>
        <p><strong>Gaps:</strong> {opportunity.missingSkills.length > 0 ? opportunity.missingSkills.join(' · ') : 'No core gap identified'}</p>
      </section>
      <section>
        <h5>Task scope</h5>
        <p>{opportunity.taskScope.status === 'SUFFICIENT' ? 'Sufficient original-page scope found.' : 'Original-page scope is incomplete.'}</p>
        <p>{opportunity.taskScope.evidenceCount} scope signal{opportunity.taskScope.evidenceCount === 1 ? '' : 's'} · {opportunity.taskScope.requiredSkillEvidenceCount} skill signal{opportunity.taskScope.requiredSkillEvidenceCount === 1 ? '' : 's'}</p>
      </section>
      {opportunity.learning && <section className="freelance-preview-learning">
        <h5>Preparation</h5>
        <p><strong>{opportunity.learning.timeUncertain
          ? 'Learning time uncertain — review the full scope first.'
          : `${opportunity.learning.minimumHours}–${opportunity.learning.maximumHours} focused hours`}</strong></p>
        {opportunity.learning.practiceRequirements.length > 0 && <p>Practice: {opportunity.learning.practiceRequirements.join(' · ')}</p>}
        {opportunity.learning.suggestedSampleProject && <p>Sample: {opportunity.learning.suggestedSampleProject}</p>}
        {opportunity.learning.deliveryRisks.length > 0 && <p>Delivery risks: {opportunity.learning.deliveryRisks.join(' · ')}</p>}
      </section>}
      {opportunity.riskIndicators.length > 0 && <section>
        <h5>Potential risk indicators</h5>
        <p>{opportunity.riskIndicators.map(humanize).join(' · ')}</p>
      </section>}
    </div>
  </details>;
}

type SaveState = {
  status: FreelancePreviewSaveResponse['status'];
  opportunityId: string | null;
  dailyRemaining: number;
} | { status: 'FAILED'; code: string };

function PreviewOpportunityRow({
  opportunity,
  runId,
  onSaved,
}: {
  opportunity: FreelancePreviewOpportunitySummary;
  runId: string;
  onSaved(): void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [blockerConfirmed, setBlockerConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState<SaveState | null>(null);
  const originalUrl = safeOriginalUrl(opportunity.originalUrl);
  const blocker = opportunity.primaryBlocker
    ? PREVIEW_READINESS_BLOCKER_LABELS[opportunity.primaryBlocker]
    : 'No deterministic readiness blocker';
  const cannotSave = opportunity.resultState === 'HARD_REJECTED' || opportunity.expired || !originalUrl;
  const needsBlockerConfirmation = opportunity.resultState === 'NOT_READY';

  async function saveForReview() {
    setSaving(true);
    setSaveState(null);
    try {
      const response = await fetch('/api/freelance-opportunities/save-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          runId,
          temporaryResultId: opportunity.temporaryResultId,
          confirmed: true,
          blockerConfirmed,
        }),
      });
      const body = await response.json() as Partial<FreelancePreviewSaveResponse> & { code?: string };
      if (!response.ok || !body.status) throw new Error(body.code ?? 'SAFE_PREVIEW_SAVE_FAILURE');
      setSaveState({
        status: body.status,
        opportunityId: body.opportunityId ?? null,
        dailyRemaining: body.dailyRemaining ?? 0,
      });
      setConfirming(false);
      if (body.status === 'SAVED_FOR_REVIEW') onSaved();
    } catch (error) {
      setSaveState({
        status: 'FAILED',
        code: error instanceof Error ? error.message : 'SAFE_PREVIEW_SAVE_FAILURE',
      });
    } finally {
      setSaving(false);
    }
  }

  return <article className="freelance-preview-row">
    <div className="freelance-preview-row-main">
      <div className="freelance-preview-title-line">
        <div>
          <p className="freelance-preview-source">{SOURCE_LABELS[opportunity.source]} · {opportunity.sourceDomain}</p>
          <h4>{opportunity.title}</h4>
          <p>{opportunity.clientOrCompany ?? 'Client not provided'}</p>
        </div>
        <span className={`freelance-readiness freelance-readiness-${opportunity.resultState.toLocaleLowerCase()}`}>{READINESS_LABELS[opportunity.resultState]}</span>
      </div>
      <dl className="freelance-preview-facts">
        <div><dt>Blocker</dt><dd>{blocker}</dd></div>
        <div><dt>Pay</dt><dd>{opportunity.originalPayText ?? humanize(opportunity.payClassification)}</dd></div>
        <div><dt>Geography</dt><dd>{humanize(opportunity.geographicEligibility)}</dd></div>
        <div><dt>Contract</dt><dd>{humanize(opportunity.contractType)}</dd></div>
      </dl>
      {opportunity.resultState === 'REVIEW_SCOPE_MANUALLY' && <p className="freelance-preview-guidance">Valid opportunity, but more scope, pay, or eligibility evidence is needed. Review the original listing before deciding.</p>}
      {opportunity.resultState === 'NOT_READY' && <p className="freelance-preview-guidance freelance-preview-guidance-blocked">Not ready: {blocker}.</p>}
      <div className="freelance-preview-row-footer">
        <div className="freelance-preview-meta">
          <span>{opportunity.taskScope.status === 'SUFFICIENT' ? 'Scope supported' : 'Scope incomplete'}</span>
          <span>{ACTION_LABELS[opportunity.recommendedAction]}</span>
          <span>Risk: {opportunity.scamRisk}</span>
          <span>{opportunity.remote === true ? 'Remote' : opportunity.remote === false ? 'On-site' : 'Remote status unclear'}</span>
          <span>{publishedLabel(opportunity.publishedAt)}</span>
          {opportunity.views.length > 0 && <span>Views: {opportunity.views.map(humanize).join(' · ')}</span>}
          {opportunity.matchedCategories.length > 0 && <span>Category: {opportunity.matchedCategories.map(humanize).join(' · ')}</span>}
          {opportunity.aggregatorOrRepost && <span>Aggregator or repost</span>}
          {opportunity.expired && <span>Expired</span>}
          {opportunity.missingSkills.length > 0 && <span>Gaps: {opportunity.missingSkills.slice(0, 3).join(' · ')}</span>}
        </div>
        <div className="freelance-preview-actions">
          {originalUrl
            ? <a className="button button-secondary" href={originalUrl} target="_blank" rel="noopener noreferrer">Open original listing</a>
            : <span className="freelance-preview-unavailable">Original link unavailable</span>}
          {!cannotSave && !saveState && <button className="button button-secondary" type="button" aria-expanded={confirming} disabled={confirming} onClick={() => setConfirming(true)}>Save for Review</button>}
        </div>
      </div>
      <OpportunityDetails opportunity={opportunity} />
    </div>

    {confirming && <div className="freelance-preview-confirm" role="group" aria-label={`Confirm saving ${opportunity.title} for review`}>
      <div><strong>Save this temporary result for local review?</strong><p>Readiness: {READINESS_LABELS[opportunity.resultState]}. Blocker: {blocker}. This does not contact the client or create an application.</p></div>
      {needsBlockerConfirmation && <label><input type="checkbox" checked={blockerConfirmed} onChange={(event) => setBlockerConfirmed(event.target.checked)} />I understand this opportunity is NOT READY because of the blocker shown above.</label>}
      <div className="freelance-preview-confirm-actions">
        <button type="button" className="button button-secondary" onClick={() => { setConfirming(false); setBlockerConfirmed(false); }}>Cancel</button>
        <button type="button" className="button button-primary" disabled={saving || (needsBlockerConfirmation && !blockerConfirmed)} onClick={() => void saveForReview()}>{saving ? 'Saving…' : 'Confirm local save'}</button>
      </div>
    </div>}

    {saveState && <div className={`freelance-preview-save-feedback ${saveState.status === 'FAILED' ? 'is-error' : ''}`} role="status" aria-live="polite">
      {saveState.status === 'SAVED_FOR_REVIEW' && <>Saved locally for review. {saveState.dailyRemaining} daily slot{saveState.dailyRemaining === 1 ? '' : 's'} remain. {saveState.opportunityId && <Link href={`/freelance/${saveState.opportunityId}`}>View saved opportunity</Link>}</>}
      {saveState.status === 'DUPLICATE' && <>Already saved. No duplicate was created.</>}
      {saveState.status === 'DAILY_CAP_REACHED' && <>Daily freelance save capacity is exhausted. The temporary result was not saved.</>}
      {saveState.status === 'FAILED' && <>Could not save safely: {humanize(saveState.code)}.</>}
    </div>}
  </article>;
}

export function FreelancePreviewResults({
  result,
  onClose,
  onSaved,
}: {
  result: FreelanceScanResult;
  onClose(): void;
  onSaved(): void;
}) {
  const [filter, setFilter] = useState<PreviewFilter>('ALL');
  const filtered = useMemo(() => result.previewOpportunities.filter((item) =>
    filter === 'ALL' || item.resultState === filter,
  ), [filter, result.previewOpportunities]);
  const tavily = result.sourceSummaries.find((source) => source.source === 'TAVILY');

  return <div className="freelance-preview-workspace" aria-live="polite">
    <header className="freelance-preview-header">
      <div>
        <h3>Preview complete</h3>
        <p>Preview opportunities are temporary and have not been saved.</p>
      </div>
      <button className="button button-secondary" type="button" onClick={onClose}>Close</button>
    </header>

    <section className="freelance-preview-summary" aria-label="Preview summary">
      <PreviewMetric label="Valid opportunities" value={result.validIndividualOpportunities} />
      <PreviewMetric label="Ready now" value={result.readyNow} />
      <PreviewMetric label="Learnable fast" value={result.learnableFast} />
      <PreviewMetric label="Manual review" value={result.reviewScopeManually} />
      <PreviewMetric label="Not ready" value={result.notReady} />
      <PreviewMetric label="Hard rejected" value={result.hardRejected} />
      <PreviewMetric label="Search credits" value={tavily?.status === 'DISABLED' ? 'Disabled' : tavily?.searchCreditsConsumed ?? 0} />
      <PreviewMetric label="Extract credits" value={tavily?.status === 'DISABLED' ? 'Disabled' : tavily?.extractCreditsConsumed ?? 0} />
    </section>

    <section className="freelance-preview-results" aria-labelledby="freelance-preview-results-title">
      <div className="freelance-preview-results-heading">
        <div><h3 id="freelance-preview-results-title">Preview opportunities</h3><p>Latest temporary scan result · no automatic saving</p></div>
        {result.previewOpportunityTotal > result.previewOpportunities.length && <p>Showing the top {result.previewOpportunities.length} final Preview opportunities.</p>}
      </div>
      <div className="freelance-preview-filters" role="group" aria-label="Filter Preview opportunities">
        {([
          ['ALL', 'All'],
          ['READY_NOW', 'Ready now'],
          ['LEARNABLE_FAST_WITH_AI', 'Learnable fast'],
          ['REVIEW_SCOPE_MANUALLY', 'Manual review'],
          ['NOT_READY', 'Not ready'],
        ] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={filter === value} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}>{label}</button>)}
      </div>
      {result.previewOpportunities.length === 0
        ? <div className="freelance-preview-empty"><h4>No final Preview opportunities</h4><p>Rejected non-opportunity pages remain in the aggregate source-quality metrics and are not shown as jobs.</p></div>
        : filtered.length === 0
          ? <div className="freelance-preview-empty"><h4>No opportunities match this filter</h4><p>Choose another readiness filter to inspect the remaining temporary results.</p></div>
          : <div className="freelance-preview-list">{filtered.map((opportunity) => <PreviewOpportunityRow key={opportunity.temporaryResultId} opportunity={opportunity} runId={result.runId} onSaved={onSaved} />)}</div>}
    </section>

    <details className="freelance-preview-diagnostics">
      <summary>Source diagnostics</summary>
      <div className="freelance-source-grid">
        {result.sourceSummaries.map((source) => <article key={source.source}>
          <div><strong>{SOURCE_LABELS[source.source]}</strong><span className={`scan-source-status scan-source-status-${source.status.toLocaleLowerCase().replaceAll('_', '-')}`}>{humanize(source.status)}</span></div>
          {source.status === 'DISABLED'
            ? <p>Disabled — usage not queried</p>
            : <>
              <p>{source.requestsCompleted} / {source.requestsAttempted} requests · {source.cacheHits} cache hits</p>
              <p>{source.listingsFetched} discovered · {source.originalPagesFetched} pages fetched · {source.validOpportunityPages} valid source pages · {source.nonOpportunityPages} non-opportunity pages</p>
              {source.source === 'TAVILY' && <p>Search credits: {source.searchCreditsConsumed} · Extract credits: {source.extractCreditsConsumed} · useful opportunities: {source.validOpportunityPages}</p>}
            </>}
        </article>)}
      </div>
    </details>
  </div>;
}
