'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type {
  FreelanceScanResult,
  FreelanceSource,
} from '@job-app/ingestion/freelance/contracts';
import { AppIcon } from './icons';
import { FreelancePreviewResults } from './FreelancePreviewResults';

type View = 'SELECT' | 'RUNNING' | 'RESULT' | 'ERROR' | 'IMPORT';
type Capacity = {
  philippineDate: string;
  dailyLimit: number;
  savedToday: number;
  remaining: number;
};

const SOURCE_LABELS: Record<FreelanceSource, string> = {
  HIMALAYAS: 'Himalayas',
  REMOTIVE: 'Remotive',
  TAVILY: 'Tavily',
  GEMINI_SEARCH: 'Gemini Search',
  MANUAL: 'Manual URL import',
};

const READINESS_BLOCKER_LABELS = {
  MANDATORY_EXPERIENCE_REQUIREMENT: 'Mandatory experience requirement',
  SENIOR_OR_LEAD_RESPONSIBILITY: 'Senior or lead responsibility',
  UNRELATED_JOB_FAMILY: 'Unrelated job family',
  INSUFFICIENT_TASK_SCOPE_EVIDENCE: 'Insufficient task-scope evidence',
  SKILL_GAP_TOO_BROAD: 'Skill gap too broad',
  LEARNING_ESTIMATE_CANNOT_BE_DEFENDED: 'Learning estimate cannot be defended',
  CERTIFICATION_OR_REGULATED_WORK: 'Certification or regulated work',
  GEOGRAPHIC_RESTRICTION: 'Geographic restriction',
  FULL_TIME_NOT_FREELANCE: 'Full-time rather than freelance',
  VAGUE_PROJECT_SCOPE: 'Vague project scope',
  PAY_UNKNOWN: 'Pay requires review',
  SCAM_OR_COMPLIANCE_BOUNDARY: 'Safety or compliance boundary',
  OTHER_DETERMINISTIC_REASON: 'Other deterministic readiness boundary',
} as const;
type FreelanceReadinessBlocker = keyof typeof READINESS_BLOCKER_LABELS;
type FreelanceQueryYield = {
  queryId: string;
  urlsDiscovered: number;
  validIndividualOpportunities: number;
  nonOpportunityPages: number;
  duplicateOpportunities: number;
};
type FreelanceSourceDisplaySummary = FreelanceScanResult['sourceSummaries'][number] & {
  originalPagesFetched: number;
  validOpportunityPages: number;
  nonOpportunityPages: number;
  duplicateOrRepostPages: number;
  pagesRecoveredByExtract: number;
  pagesWithSufficientTaskScope: number;
  pagesWithInsufficientTaskScope: number;
  queriesUsed: string[];
  queryYields: FreelanceQueryYield[];
};
type FreelanceScanDisplayResult = Omit<FreelanceScanResult, 'sourceSummaries'> & {
  sourceSummaries: FreelanceSourceDisplaySummary[];
  sourceCandidatesBeforeDedup: number;
  candidatesMergedByDedup: number;
  validIndividualOpportunities: number;
  nonOpportunityPagesRejected: number;
  duplicateOrRepostPages: number;
  pagesWithSufficientTaskScope: number;
  pagesWithInsufficientTaskScope: number;
  reviewScopeManually: number;
  requiresReview?: number;
  readinessBlockers?: Array<{
    code: FreelanceReadinessBlocker;
    count: number;
  }>;
  previewOpportunityTotal: FreelanceScanResult['previewOpportunityTotal'];
  previewOpportunities: FreelanceScanResult['previewOpportunities'];
};

function idempotencyKey(mode: 'PREVIEW' | 'SAVE'): string {
  const id = typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `freelance-${mode.toLocaleLowerCase()}-${id}`;
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="freelance-result-metric"><span>{label}</span><strong>{value}</strong></div>;
}

export function FreelanceScanControl() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [view, setView] = useState<View>('SELECT');
  const [capacity, setCapacity] = useState<Capacity | null>(null);
  const [cacheStrategy, setCacheStrategy] = useState<'CACHED' | 'FRESH'>('CACHED');
  const [runId, setRunId] = useState<string | null>(null);
  const [result, setResult] = useState<FreelanceScanDisplayResult | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [importUrl, setImportUrl] = useState('');
  const [importState, setImportState] = useState<'IDLE' | 'WORKING' | 'DONE'>('IDLE');
  const [importResult, setImportResult] = useState<{ status: string; opportunityId: string | null } | null>(null);

  async function loadCapacity() {
    try {
      const response = await fetch('/api/freelance-scans/capacity', { cache: 'no-store' });
      setCapacity(response.ok ? await response.json() as Capacity : null);
    } catch { setCapacity(null); }
  }

  function open() {
    setView('SELECT');
    setRunId(null);
    setResult(null);
    setErrorCode(null);
    setCacheStrategy('CACHED');
    setImportState('IDLE');
    setImportResult(null);
    void loadCapacity();
    dialogRef.current?.showModal();
  }

  async function start(mode: 'PREVIEW' | 'SAVE') {
    setView('RUNNING');
    setErrorCode(null);
    try {
      const response = await fetch('/api/freelance-scans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, cacheStrategy, idempotencyKey: idempotencyKey(mode) }),
      });
      const body = await response.json() as { runId?: string; code?: string };
      if (!response.ok || !body.runId) throw new Error(body.code ?? 'SAFE_RUN_FAILURE');
      setRunId(body.runId);
    } catch (error) {
      setErrorCode(error instanceof Error ? error.message : 'SAFE_RUN_FAILURE');
      setView('ERROR');
    }
  }

  useEffect(() => {
    if (!runId || view !== 'RUNNING') return;
    let cancelled = false;
    const poll = async () => {
      try {
        const response = await fetch(`/api/freelance-scans/${encodeURIComponent(runId)}`, { cache: 'no-store' });
        const body = await response.json() as {
          active?: boolean;
          status?: string;
          result?: FreelanceScanDisplayResult | null;
          failureCode?: string | null;
        };
        if (cancelled) return;
        if (!response.ok || body.status === 'FAILED') {
          setErrorCode(body.failureCode ?? 'RUN_FAILED');
          setView('ERROR');
          return;
        }
        if (!body.active && body.result) {
          setResult(body.result);
          setView('RESULT');
          void loadCapacity();
          return;
        }
        window.setTimeout(poll, 1500);
      } catch {
        if (!cancelled) window.setTimeout(poll, 2000);
      }
    };
    void poll();
    return () => { cancelled = true; };
  }, [runId, view]);

  async function importOpportunity(event: React.FormEvent) {
    event.preventDefault();
    setImportState('WORKING');
    setErrorCode(null);
    try {
      const response = await fetch('/api/freelance-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: importUrl }),
      });
      const body = await response.json() as { status?: string; opportunityId?: string | null; code?: string };
      if (!response.ok) throw new Error(body.code ?? 'SAFE_IMPORT_FAILURE');
      setImportResult({ status: body.status ?? 'DONE', opportunityId: body.opportunityId ?? null });
      setImportState('DONE');
      void loadCapacity();
    } catch (error) {
      setErrorCode(error instanceof Error ? error.message : 'SAFE_IMPORT_FAILURE');
      setImportState('IDLE');
    }
  }

  return (
    <>
      <div className="freelance-header-actions">
        <button className="button button-primary" type="button" onClick={open}>
          <AppIcon name="search" size={18} />
          Scan Freelance Jobs
        </button>
      </div>
      <dialog ref={dialogRef} className="scan-dialog freelance-scan-dialog" aria-labelledby="freelance-scan-title">
        <div className="scan-dialog-card">
          <header className="scan-dialog-header">
            <div><h2 id="freelance-scan-title">Freelance Jobs</h2><p>Discovery and local review only. No proposal, bid, message, or application is sent.</p></div>
            <button type="button" className="scan-close" aria-label="Close freelance scan" onClick={() => dialogRef.current?.close()}><AppIcon name="close" /></button>
          </header>

          {view === 'SELECT' && <div className="scan-dialog-body">
            <div className="scan-capacity">
              <span>Saved today: <strong>{capacity ? `${capacity.savedToday} / ${capacity.dailyLimit}` : 'Unavailable'}</strong></span>
              <span>Remaining: <strong>{capacity?.remaining ?? 'Unavailable'}</strong></span>
            </div>
            <fieldset className="scan-cache-choice">
              <legend>Discovery results</legend>
              <label><input type="radio" name="freelance-cache-strategy" checked={cacheStrategy === 'CACHED'} onChange={() => setCacheStrategy('CACHED')} /><span><strong>Use cached results</strong><small>Fast and quota-conscious. The same validated listings may appear again.</small></span></label>
              <label><input type="radio" name="freelance-cache-strategy" checked={cacheStrategy === 'FRESH'} onChange={() => setCacheStrategy('FRESH')} /><span><strong>Use fresh results</strong><small>May call enabled public sources and consume Tavily or Gemini Search quota.</small></span></label>
            </fieldset>
            <div className="scan-choice-grid">
              <button type="button" className="scan-choice" onClick={() => void start('PREVIEW')}><span className="scan-choice-icon"><AppIcon name="search" /></span><strong>Preview</strong><p>Classifies rate, readiness, and risk. Saves nothing and consumes no freelance save slots.</p></button>
              <button type="button" className="scan-choice" disabled={(capacity?.remaining ?? 0) === 0} onClick={() => void start('SAVE')}><span className="scan-choice-icon"><AppIcon name="check" /></span><strong>Scan &amp; Save</strong><p>Saves up to the remaining 20-per-PHT-day freelance capacity. No application is created.</p></button>
            </div>
            <button className="button button-secondary" type="button" onClick={() => setView('IMPORT')}><AppIcon name="import" size={18} />Import Freelance URL</button>
          </div>}

          {view === 'RUNNING' && <div className="scan-progress" role="status" aria-live="polite"><span className="scan-spinner" aria-hidden="true" /><h3>Scanning enabled freelance sources</h3><p>Validating original public listings, then applying deterministic pay, readiness, and risk rules.</p><p>No automatic proposal or application can occur.</p></div>}

          {view === 'RESULT' && result && result.mode === 'PREVIEW' && <FreelancePreviewResults
            result={result}
            onClose={() => dialogRef.current?.close()}
            onSaved={() => void loadCapacity()}
          />}

          {view === 'RESULT' && result && result.mode === 'SAVE' && <div className="scan-dialog-body" aria-live="polite">
            <div className="scan-outcome scan-outcome-success"><span className="scan-choice-icon"><AppIcon name="check" /></span><div><p className="eyebrow">{result.mode === 'SAVE' ? 'Save scan complete' : 'Preview complete'}</p><h3>{result.status === 'NO_RESULTS' ? 'No suitable freelance opportunities were found.' : result.status.replaceAll('_', ' ').toLocaleLowerCase()}</h3></div></div>
            <div className="freelance-result-grid">
              <Metric label="Listings fetched from enabled sources" value={result.fetched} />
              <Metric label="Source candidates before global dedup" value={result.sourceCandidatesBeforeDedup} />
              <Metric label="Candidates merged by global dedup" value={result.candidatesMergedByDedup} />
              <Metric label="Final unique opportunities" value={result.unique} />
              <Metric label="Final valid individual opportunities" value={result.validIndividualOpportunities} />
              <Metric label="Non-opportunity source pages rejected" value={result.nonOpportunityPagesRejected} />
              <Metric label="Final aggregator/repost opportunities" value={result.duplicateOrRepostPages} />
              <Metric label="Final opportunities with sufficient task scope" value={result.pagesWithSufficientTaskScope} />
              <Metric label="Final opportunities with insufficient task scope" value={result.pagesWithInsufficientTaskScope} />
              <Metric label="Confirmed over $3/hour" value={result.aboveMinimum} />
              <Metric label="Pay unknown/review" value={result.unknownPay} />
              <Metric label="Ready now" value={result.readyNow} />
              <Metric label="Learnable fast with AI" value={result.learnableFast} />
              <Metric label="Review scope manually" value={result.reviewScopeManually} />
              <Metric label="Not ready" value={result.notReady} />
              <Metric label="Requires review" value={result.requiresReview ?? 0} />
              <Metric label="Hard rejected" value={result.hardRejected} />
              <Metric label="Saved" value={result.savedThisRun} />
              <Metric label="Daily capacity remaining" value={result.dailyRemaining} />
            </div>
            <section className="freelance-readiness-blockers" aria-labelledby="freelance-readiness-blockers-title">
              <div><h3 id="freelance-readiness-blockers-title">Primary readiness blockers</h3><p>Blockers are final-opportunity classifications. A scope blocker may also reflect missing required-skill evidence, so it does not have to equal the page-scope count. Requires review is cross-cutting and may overlap a readiness label.</p></div>
              {(result.readinessBlockers ?? []).length === 0
                ? <p>No deterministic readiness blockers were reported.</p>
                : <ul>{(result.readinessBlockers ?? []).map((blocker) => <li key={blocker.code}><span>{READINESS_BLOCKER_LABELS[blocker.code]}</span><strong>{blocker.count}</strong></li>)}</ul>}
            </section>
            <section className="freelance-source-panel" aria-labelledby="freelance-source-result-title">
              <h3 id="freelance-source-result-title">Source status</h3>
              <div className="freelance-source-grid">
                {result.sourceSummaries.map((source) => <article key={source.source}>
                  <div><strong>{SOURCE_LABELS[source.source]}</strong><span className={`scan-source-status scan-source-status-${source.status.toLocaleLowerCase().replaceAll('_', '-')}`}>{source.status.replaceAll('_', ' ')}</span></div>
                  <small>{source.costClassification.replaceAll('_', ' ')}</small>
                  {source.status === 'DISABLED'
                    ? <p>Disabled — usage not queried</p>
                    : <>
                      <p>{source.requestsCompleted} / {source.requestsAttempted} requests · {source.cacheHits} cache hits</p>
                      <p>{source.listingsFetched} fetched · {source.accepted} source candidates accepted before global dedup · attribution {source.attributionPreserved ? 'preserved' : 'requires review'}</p>
                      {source.source === 'TAVILY' && <>
                        <p>Search credits: {source.searchCreditsConsumed} · Extract credits: {source.extractCreditsConsumed}<br />Today: {source.dailyCreditsUsed} used / {source.dailyCreditsRemaining} remaining<br />Month: {source.monthlyCreditsUsed} used / {source.monthlyCreditsRemaining} remaining</p>
                        <p>{source.listingsFetched} URLs discovered · {source.originalPagesFetched} original pages fetched<br />{source.validOpportunityPages} source opportunity pages before global dedup · {source.nonOpportunityPages} non-opportunity source pages<br />{source.pagesRecoveredByExtract} pages recovered through Extract · {source.pagesWithSufficientTaskScope} source pages with sufficient scope</p>
                        {source.queriesUsed.length > 0 && <details className="freelance-query-yield"><summary>Search queries and useful-opportunity yield</summary><ul>{source.queryYields.map((query, index) => <li key={query.queryId}><span>{source.queriesUsed[index] ?? query.queryId}</span><strong>{query.validIndividualOpportunities} / {query.urlsDiscovered}</strong></li>)}</ul></details>}
                      </>}
                      {source.source === 'GEMINI_SEARCH' && <p>Prompts today: {source.dailyPromptsUsed} used / {source.dailyPromptsRemaining} remaining<br />Tokens: {source.totalTokens === null ? 'Usage unavailable' : source.totalTokens.toLocaleString()}</p>}
                      {source.source === 'GEMINI_SEARCH' && source.failures.includes('NETWORK_FAILURE') && <p className="freelance-source-warning">Network failure. Other freelance sources continued safely.</p>}
                    </>}
                </article>)}
              </div>
            </section>
            <div className="scan-dialog-actions">{result.savedThisRun > 0 && <Link className="button button-primary" href="/freelance" onClick={() => dialogRef.current?.close()}>View freelance jobs</Link>}<button className="button button-secondary" type="button" onClick={() => dialogRef.current?.close()}>Close</button></div>
          </div>}

          {view === 'IMPORT' && <form className="scan-dialog-body freelance-import-form" onSubmit={importOpportunity}>
            <div><h3>Import Freelance URL</h3><p>Paste one public opportunity URL. Login pages, private networks, CAPTCHA pages, and submission forms are rejected.</p></div>
            <label htmlFor="freelance-url">Public opportunity URL</label>
            <input id="freelance-url" type="url" required value={importUrl} onChange={(event) => setImportUrl(event.target.value)} placeholder="https://example.com/jobs/project" />
            {errorCode && <p role="alert" className="freelance-form-error">{errorCode.replaceAll('_', ' ')}</p>}
            {importState === 'DONE' && importResult && <div className="freelance-import-success" role="status"><strong>{importResult.status.replaceAll('_', ' ')}</strong>{importResult.opportunityId && <Link href={`/freelance/${importResult.opportunityId}`}>Review imported opportunity</Link>}</div>}
            <div className="scan-dialog-actions"><button type="button" className="button button-secondary" onClick={() => setView('SELECT')}>Back</button><button type="submit" className="button button-primary" disabled={importState === 'WORKING'}>{importState === 'WORKING' ? 'Validating…' : 'Import for review'}</button></div>
          </form>}

          {view === 'ERROR' && <div className="scan-dialog-body scan-error" role="alert"><div className="scan-outcome scan-outcome-danger"><span className="scan-choice-icon"><AppIcon name="warning" /></span><div><p className="eyebrow">Failed safely</p><h3>The freelance scan could not be completed.</h3></div></div><p>Reason: <strong>{(errorCode ?? 'SAFE_RUN_FAILURE').replaceAll('_', ' ')}</strong></p><p>No proposal, application, job write, or partial persistence was performed by this failed run.</p><div className="scan-dialog-actions"><button className="button button-secondary" type="button" onClick={() => dialogRef.current?.close()}>Close</button></div></div>}
        </div>
      </dialog>
    </>
  );
}
