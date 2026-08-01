'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type {
  DashboardJobScanCacheStrategy,
  DashboardJobScanCapacity,
  DashboardJobScanMode,
  DashboardJobScanResult,
  DashboardJobScanStage,
} from '@job-app/ingestion/discovery/dashboard-scan-contracts';
import { AppIcon } from './icons';

type ScanView = 'SELECT' | 'RUNNING' | 'RESULT' | 'ERROR';

const STAGE_LABELS: Record<DashboardJobScanStage, string> = {
  STARTING_SCAN: 'Starting scan',
  SELECTING_QUERY_GROUP: 'Selecting query group',
  READING_CACHED_RESULTS: 'Reading cached results',
  SEARCHING_TAVILY: 'Searching Tavily',
  SEARCHING_GEMINI: 'Searching Gemini',
  COMBINING_URLS: 'Combining URLs',
  REMOVING_DUPLICATE_URLS: 'Removing duplicate URLs',
  FETCHING_ORIGINAL_PAGES: 'Fetching original pages',
  RECOVERING_FAILED_PAGES: 'Recovering failed pages',
  PARSING_JOB_PAGES: 'Parsing job pages',
  FETCHING_JOBS: 'Fetching jobs',
  REMOVING_DUPLICATES: 'Removing duplicates',
  APPLYING_FILTERS: 'Applying filters',
  MATCHING_PROFILES: 'Matching profiles',
  VERIFYING_WITH_GEMINI: 'Verifying selected jobs',
  SAVING_VERIFIED_JOBS: 'Saving verified jobs',
  COMPLETING_BATCH: 'Completing batch',
  COMPLETED: 'Completed',
  COMPLETED_WITH_SOURCE_WARNINGS: 'Completed with source warnings',
  CANCELLED: 'Cancelled',
  FAILED: 'Failed safely',
};

export function canSaveDashboardScan(capacity: DashboardJobScanCapacity | null): boolean {
  return (capacity?.remaining ?? 0) > 0;
}

export function dashboardScanResultHeading(result: DashboardJobScanResult): string {
  if (result.status === 'NO_DISCOVERY_SOURCES_ENABLED') return 'No discovery sources are enabled.';
  if (result.status === 'NO_MATCHES') return 'No jobs matched your active profiles.';
  if (result.status === 'DAILY_CAP_REACHED') return 'Today’s save limit has been reached.';
  if (result.status === 'ALREADY_COMPLETED') return 'This scan was already completed.';
  if (result.status === 'QUERY_GROUPS_RECENTLY_EXHAUSTED') return 'All query groups ran recently.';
  if (result.status === 'DEEP_SCAN_COOLDOWN') return 'Deep Web Scan is in its seven-day cooldown.';
  if (result.status === 'CANCELLED') return 'Future batches were cancelled safely.';
  if (result.status === 'FAILED') return 'The scan stopped safely.';
  if (result.profileMatches > 0 && result.newSaveableMatches === 0) {
    return 'All matching jobs are already in your dashboard.';
  }
  return result.persistedThisRun > 0
    ? `${result.persistedThisRun} verified ${result.persistedThisRun === 1 ? 'job was' : 'jobs were'} saved.`
    : result.status === 'COMPLETED_WITH_SOURCE_WARNINGS'
      ? 'Scan completed with source warnings.'
      : 'Scan completed.';
}

function createIdempotencyKey(mode: DashboardJobScanMode): string {
  const unique = typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `dashboard-${mode.toLowerCase()}-${unique}`;
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="scan-result-metric"><span>{label}</span><strong>{value}</strong></div>;
}

const SOURCE_NAMES = {
  tavily: 'Combined web discovery',
  arbeitnow: 'Arbeitnow',
  remotive: 'Remotive',
  lever: 'Lever',
} as const;

const SOURCE_COSTS = {
  FREE_TIER_CREDITS: 'API credits',
  FREE: 'FREE',
  FREE_CONFIGURED_BOARDS: 'FREE · configured boards only',
} as const;

function statusClass(status: string) {
  return `scan-source-status scan-source-status-${status.toLowerCase().replaceAll('_', '-')}`;
}

export function JobScanResultView({
  result,
  onClose = () => undefined,
}: {
  result: DashboardJobScanResult;
  onClose?: () => void;
}) {
  const failed = result.status === 'FAILED';
  const neutral = result.status === 'NO_MATCHES' || result.status === 'CANCELLED';
  return (
    <div className="scan-dialog-body" aria-live="polite">
      <div className={`scan-outcome scan-outcome-${failed ? 'danger' : neutral ? 'neutral' : 'success'}`}>
        <span className="scan-choice-icon"><AppIcon name={failed ? 'warning' : neutral ? 'search' : 'check'} /></span>
        <div>
          <p className="eyebrow">{result.mode === 'SAVE' ? 'Save scan complete' : result.mode === 'DEEP' ? 'Deep scan complete' : 'Preview complete'}</p>
          <h3>{dashboardScanResultHeading(result)}</h3>
        </div>
      </div>
      {failed && (
        <div className="scan-failure-detail" role="alert">
          <span>Failed stage: <strong>{STAGE_LABELS[result.failedStage ?? 'FAILED']}</strong></span>
          <span>Reason: <strong>{(result.failureCode ?? 'UNKNOWN_SAFE_FAILURE').replaceAll('_', ' ')}</strong></span>
        </div>
      )}
      {result.webDiscovery && (
        <div className="scan-capacity">
          <span>Query group: <strong>{result.webDiscovery.selectedQueryGroup?.replaceAll('_', ' ') ?? 'None'}</strong></span>
          <span>Cache: <strong>{result.cacheStrategy === 'CACHED' ? 'Use cached results' : 'Fresh web results'}</strong></span>
          <span>Stopping reason: <strong>{result.webDiscovery.stoppingReason.replaceAll('_', ' ')}</strong></span>
        </div>
      )}
      <div className="scan-result-grid">
        <Metric label="Jobs scanned" value={result.fetched} />
        <Metric label="Unique jobs" value={result.uniqueAccepted} />
        <Metric label="Duplicate identities" value={result.duplicates} />
        <Metric label="Filter exclusions" value={result.exclusions} />
        <Metric label="Profile matches found" value={result.profileMatches} />
        <Metric label="Matches already stored" value={result.existingMatches} />
        <Metric label="New saveable matches" value={result.newSaveableMatches} />
        <Metric label="Near matches" value={result.nearMatches} />
        <Metric label="Selected for verification" value={result.selectedForGemini} />
        <Metric label="Gemini verification calls" value={result.geminiCalls} />
        <Metric label="Verification input tokens" value={result.inputTokens ?? 'Usage unavailable'} />
        <Metric label="Verification output tokens" value={result.outputTokens ?? 'Usage unavailable'} />
        <Metric label="Jobs saved" value={result.persistedThisRun} />
        <Metric label="Daily slots remaining" value={result.dailyRemaining} />
        <Metric label="Elapsed" value={`${(result.elapsedMs / 1000).toFixed(1)}s`} />
      </div>

      {result.webDiscovery && (
        <section className="scan-source-summary" aria-labelledby="web-processing-title">
          <div className="scan-section-heading"><div><p className="eyebrow">Original-page processing</p><h4 id="web-processing-title">Public URL pipeline</h4></div><span className="scan-cost-note">No currency estimate</span></div>
          <div className="scan-result-grid">
            <Metric label="URLs before deduplication" value={result.webDiscovery.urlsBeforeDeduplication} />
            <Metric label="Cross-source duplicates" value={result.webDiscovery.crossSourceDuplicates} />
            <Metric label="Unique URLs" value={result.webDiscovery.uniqueUrls} />
            <Metric label="Found by both sources" value={result.webDiscovery.urlsFoundByBothSources} />
            <Metric label="Pages attempted" value={result.webDiscovery.pagesFetchAttempted} />
            <Metric label="Pages parsed directly" value={result.webDiscovery.pagesParsedDirectly} />
            <Metric label="Pages sent to Extract" value={result.webDiscovery.pagesSentToExtract} />
            <Metric label="Pages recovered" value={result.webDiscovery.pagesRecoveredByExtract} />
            <Metric label="Pages rejected" value={result.webDiscovery.pagesRejected} />
          </div>
        </section>
      )}

      <section className="scan-source-summary" aria-labelledby="scan-source-summary-title">
        <div className="scan-section-heading"><div><p className="eyebrow">Source summary</p><h4 id="scan-source-summary-title">Discovery and usage</h4></div><span className="scan-cost-note">Actual usage or unavailable</span></div>
        <div className="scan-source-grid">
          <article className="scan-source-card">
            <div className="scan-source-card-heading"><strong>Tavily Basic Search</strong><span className={statusClass(result.tavily.status)}>{result.tavily.status.replaceAll('_', ' ')}</span></div>
            <small>API credits</small>
            <dl className="scan-source-details">
              <div><dt>Searches attempted</dt><dd>{result.tavily.searchesAttempted}</dd></div>
              <div><dt>Search cache hits</dt><dd>{result.tavily.cacheHits}</dd></div>
              <div><dt>Current-run Search credits</dt><dd>{result.tavily.searchCreditsConsumed}</dd></div>
              <div><dt>URLs discovered</dt><dd>{result.tavily.urlsDiscovered}</dd></div>
              <div><dt>Confirmed today</dt><dd>{result.tavily.dailyCreditsConfirmed}</dd></div>
              <div><dt>Reserved today</dt><dd>{result.tavily.dailyCreditsReserved}</dd></div>
              <div><dt>Daily remaining</dt><dd>{result.tavily.dailyCreditsRemaining}</dd></div>
              <div><dt>Confirmed this month</dt><dd>{result.tavily.monthlyCreditsConfirmed}</dd></div>
              <div><dt>Reserved this month</dt><dd>{result.tavily.monthlyCreditsReserved}</dd></div>
              <div><dt>Monthly remaining</dt><dd>{result.tavily.monthlyCreditsRemaining}</dd></div>
            </dl>
          </article>
          <article className="scan-source-card">
            <div className="scan-source-card-heading"><strong>Gemini Search</strong><span className={statusClass(result.geminiSearch.status)}>{result.geminiSearch.status.replaceAll('_', ' ')}</span></div>
            <small>API quota</small>
            <dl className="scan-source-details">
              <div><dt>Prompts attempted</dt><dd>{result.geminiSearch.promptsAttempted}</dd></div>
              <div><dt>Prompt cache hits</dt><dd>{result.geminiSearch.cacheHits}</dd></div>
              <div><dt>Grounded URLs</dt><dd>{result.geminiSearch.groundedUrlsFound}</dd></div>
              <div><dt>Daily remaining</dt><dd>{result.geminiSearch.dailyPromptsRemaining}</dd></div>
              <div><dt>Input tokens</dt><dd>{result.geminiSearch.inputTokens ?? 'Usage unavailable'}</dd></div>
              <div><dt>Output tokens</dt><dd>{result.geminiSearch.outputTokens ?? 'Usage unavailable'}</dd></div>
            </dl>
          </article>
          <article className="scan-source-card">
            <div className="scan-source-card-heading"><strong>Tavily Basic Extract</strong><span className={statusClass(result.tavily.extractStatus)}>{result.tavily.extractEnabled ? result.tavily.extractStatus.replaceAll('_', ' ') : 'Disabled'}</span></div>
            <small>API credits · fetch recovery only</small>
            <dl className="scan-source-details">
              <div><dt>URLs attempted</dt><dd>{result.tavily.extractUrlsAttempted}</dd></div>
              <div><dt>Pages recovered</dt><dd>{result.tavily.extractPagesRecovered}</dd></div>
              <div><dt>Extract credits</dt><dd>{result.tavily.extractCreditsConsumed}</dd></div>
              <div><dt>Current-run Tavily credits</dt><dd>{result.tavily.totalCreditsConsumed}</dd></div>
            </dl>
          </article>
          {result.sourceSummaries.filter((source) => source.source !== 'tavily').map((source) => (
            <article className="scan-source-card" key={source.source}>
              <div className="scan-source-card-heading"><strong>{SOURCE_NAMES[source.source]}</strong><span className={statusClass(source.status)}>{source.status.replaceAll('_', ' ')}</span></div>
              <small>{SOURCE_COSTS[source.costClassification]}</small>
              {source.status !== 'DISABLED' && <dl className="scan-source-details"><div><dt>Fetched</dt><dd>{source.fetched}</dd></div><div><dt>Matches</dt><dd>{source.profileMatches}</dd></div></dl>}
            </article>
          ))}
        </div>
      </section>
      {result.sourceFailures.length > 0 && (
        <div className="scan-source-failures"><strong>Safe source warnings</strong><ul>{result.sourceFailures.map((failure) => <li key={`${failure.source}-${failure.provider ?? ''}-${failure.companyId ?? failure.queryId ?? ''}-${failure.code}`}>{failure.provider ? failure.provider.replaceAll('_', ' ') : failure.source}{failure.companyId ? ` / ${failure.companyId}` : failure.queryId ? ` / ${failure.queryId}` : ''}: {failure.code.replaceAll('_', ' ')}{failure.providerCategory ? ` (${failure.providerCategory.replaceAll('_', ' ')})` : ''}{failure.providerStatus ? ` [HTTP ${failure.providerStatus}]` : ''}</li>)}</ul></div>
      )}
      <div className="scan-dialog-actions">
        {result.persistedThisRun > 0 && <Link href="/intl-jobs" className="button button-primary">View Jobs</Link>}
        <button className="button button-secondary" type="button" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

function CacheChoice({ value, onChange }: { value: DashboardJobScanCacheStrategy; onChange: (value: DashboardJobScanCacheStrategy) => void }) {
  return (
    <fieldset className="scan-cache-choice">
      <legend>Discovery results</legend>
      <label><input type="radio" name="scan-cache" checked={value === 'CACHED'} onChange={() => onChange('CACHED')} /><span><strong>Use cached results</strong><small>Fastest. May return the same listings; consumes zero new search quota when caches are valid.</small></span></label>
      <label><input type="radio" name="scan-cache" checked={value === 'FRESH'} onChange={() => onChange('FRESH')} /><span><strong>Use fresh web results</strong><small>Rotates to another fixed query group. May consume Tavily credits and Gemini Search quota, and may still return duplicates.</small></span></label>
    </fieldset>
  );
}

export function JobScanControl() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [view, setView] = useState<ScanView>('SELECT');
  const [capacity, setCapacity] = useState<DashboardJobScanCapacity | null>(null);
  const [capacityError, setCapacityError] = useState(false);
  const [stage, setStage] = useState<DashboardJobScanStage>('STARTING_SCAN');
  const [runId, setRunId] = useState<string | null>(null);
  const [result, setResult] = useState<DashboardJobScanResult | null>(null);
  const [cacheStrategy, setCacheStrategy] = useState<DashboardJobScanCacheStrategy>('CACHED');
  const [deepConfirmed, setDeepConfirmed] = useState(false);
  const [deepVerifyAndSave, setDeepVerifyAndSave] = useState(false);
  const [confirmRecentGroupReuse, setConfirmRecentGroupReuse] = useState(false);
  const [cancellationRequested, setCancellationRequested] = useState(false);

  async function loadCapacity() {
    setCapacityError(false);
    try {
      const response = await fetch('/api/job-scans/capacity', { cache: 'no-store' });
      if (!response.ok) throw new Error('capacity unavailable');
      setCapacity(await response.json() as DashboardJobScanCapacity);
    } catch {
      setCapacity(null);
      setCapacityError(true);
    }
  }

  function openDialog() {
    setView('SELECT'); setResult(null); setRunId(null); setStage('STARTING_SCAN');
    setCacheStrategy('CACHED'); setDeepConfirmed(false); setDeepVerifyAndSave(false); setConfirmRecentGroupReuse(false); setCancellationRequested(false);
    void loadCapacity();
    dialogRef.current?.showModal();
  }

  function closeDialog() {
    if (view !== 'RUNNING') dialogRef.current?.close();
  }

  async function startScan(mode: DashboardJobScanMode) {
    if (mode === 'SAVE' && !canSaveDashboardScan(capacity)) return;
    if (mode === 'DEEP' && (!deepConfirmed || !capacity?.deepScanEligible)) return;
    setView('RUNNING'); setStage('STARTING_SCAN');
    try {
      const response = await fetch('/api/job-scans', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mode,
          idempotencyKey: createIdempotencyKey(mode),
          cacheStrategy: mode === 'DEEP' ? 'FRESH' : cacheStrategy,
          confirmRecentlyExhausted: mode !== 'DEEP' && cacheStrategy === 'FRESH'
            ? confirmRecentGroupReuse
            : false,
          verifyAndSave: mode === 'DEEP' ? deepVerifyAndSave : false,
          deepScanConfirmed: mode === 'DEEP',
        }),
      });
      if (!response.ok) throw new Error('start failed');
      const body = await response.json() as { runId: string };
      setRunId(body.runId);
    } catch {
      setView('ERROR'); setStage('FAILED');
    }
  }

  async function cancelFutureBatches() {
    if (!runId || cancellationRequested) return;
    const response = await fetch(`/api/job-scans/${encodeURIComponent(runId)}/cancel`, { method: 'POST' });
    if (response.ok) setCancellationRequested(true);
  }

  useEffect(() => {
    if (view !== 'RUNNING' || !runId) return;
    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const response = await fetch(`/api/job-scans/${encodeURIComponent(runId)}`, { cache: 'no-store' });
        if (!response.ok) throw new Error('status failed');
        const body = await response.json() as { stage: DashboardJobScanStage; status: 'ACTIVE' | 'COMPLETED' | 'FAILED'; result: DashboardJobScanResult | null };
        if (cancelled) return;
        setStage(body.stage);
        if (body.status === 'COMPLETED' && body.result) {
          setResult(body.result); setView('RESULT'); void loadCapacity(); return;
        }
        if (body.status === 'FAILED') { setView('ERROR'); return; }
        timeout = setTimeout(poll, 1500);
      } catch { if (!cancelled) setView('ERROR'); }
    };
    void poll();
    return () => { cancelled = true; if (timeout) clearTimeout(timeout); };
  }, [runId, view]);

  return (
    <>
      <button className="button button-secondary" type="button" onClick={openDialog} disabled={view === 'RUNNING'}><AppIcon name="search" size={18} />Scan Jobs</button>
      <dialog ref={dialogRef} className="scan-dialog" aria-labelledby="scan-dialog-title" onCancel={(event) => { if (view === 'RUNNING') event.preventDefault(); }} onClick={(event) => { if (event.target === event.currentTarget) closeDialog(); }}>
        <div className="scan-dialog-card">
          <header className="scan-dialog-header"><div><p className="eyebrow">Public job discovery</p><h2 id="scan-dialog-title">Scan Jobs</h2></div><button className="icon-button scan-close" type="button" aria-label="Close scan dialog" onClick={closeDialog} disabled={view === 'RUNNING'}><AppIcon name="close" /></button></header>
          {view === 'SELECT' && (
            <div className="scan-dialog-body">
              <div className="scan-capacity" aria-live="polite">{capacity ? <><span>Saved today: <strong>{capacity.savedToday} / {capacity.dailyLimit}</strong></span><span>Remaining: <strong>{capacity.remaining}</strong></span></> : capacityError ? <span>Scanning is unavailable in this environment.</span> : <span>Checking today’s save capacity…</span>}</div>
              <CacheChoice value={cacheStrategy} onChange={setCacheStrategy} />
              {cacheStrategy === 'FRESH' && <label className="scan-check scan-fresh-confirm"><input type="checkbox" checked={confirmRecentGroupReuse} onChange={(event) => setConfirmRecentGroupReuse(event.target.checked)} />If all fixed groups ran within six hours, explicitly allow the oldest group to run again.</label>}
              <div className="scan-choice-grid">
                <section className="scan-choice"><span className="scan-choice-icon"><AppIcon name="search" /></span><h3>Preview Scan</h3><p>Discovers and matches public jobs. Uses no Gemini verification, saves nothing, and consumes no job slots.</p><button className="button button-secondary" type="button" onClick={() => void startScan('PREVIEW')}>Preview Scan</button></section>
                <section className="scan-choice"><span className="scan-choice-icon"><AppIcon name="spark" /></span><h3>Scan &amp; Save</h3><p>Only new saveable matches use Gemini verification. Saves within the shared five-job Philippine-day limit. Creates no applications.</p><button className="button button-primary" type="button" onClick={() => void startScan('SAVE')} disabled={!canSaveDashboardScan(capacity) || capacityError}>Scan &amp; Save</button>{capacity?.remaining === 0 && <small>Daily save limit reached. Preview remains available.</small>}</section>
                <section className="scan-choice scan-choice-wide"><span className="scan-choice-icon"><AppIcon name="search" /></span><h3>Deep Web Scan</h3><p>Processes up to 1,000 unique public URLs. The cap is not a guaranteed result. It may take significantly longer and consume Tavily API credits and Gemini Search API quota. It may start only once every seven Philippine days. It creates and submits no applications.</p><label className="scan-check"><input type="checkbox" checked={deepVerifyAndSave} onChange={(event) => setDeepVerifyAndSave(event.target.checked)} disabled={!canSaveDashboardScan(capacity)} />Verify and save top new matches</label><label className="scan-check"><input type="checkbox" checked={deepConfirmed} onChange={(event) => setDeepConfirmed(event.target.checked)} />I understand the limits and want to start a fresh Deep Web Scan.</label><button className="button button-secondary" type="button" onClick={() => void startScan('DEEP')} disabled={!capacity?.deepScanEnabled || !capacity.deepScanEligible || !deepConfirmed || capacityError}>Deep Web Scan</button>{capacity && !capacity.deepScanEligible && <small>Available again {capacity.deepScanEligibleAgainAt ? new Date(capacity.deepScanEligibleAgainAt).toLocaleString() : 'after the cooldown'}.</small>}</section>
              </div>
            </div>
          )}
          {view === 'RUNNING' && <div className="scan-progress" aria-live="polite" aria-busy="true"><span className="scan-spinner" aria-hidden="true" /><p className="eyebrow">Scan in progress</p><h3>{STAGE_LABELS[stage]}</h3><p>Real stages are shown without estimated percentages. Persistence remains atomic and bounded.</p>{runId?.length && stage !== 'SAVING_VERIFIED_JOBS' ? <button className="button button-secondary" type="button" onClick={() => void cancelFutureBatches()} disabled={cancellationRequested}>{cancellationRequested ? 'Cancellation requested' : 'Cancel future batches'}</button> : null}</div>}
          {view === 'RESULT' && result && <JobScanResultView result={result} onClose={closeDialog} />}
          {view === 'ERROR' && <div className="scan-progress scan-error" role="alert"><span className="scan-choice-icon"><AppIcon name="warning" /></span><p className="eyebrow">Failed safely</p><h3>The scan could not be completed.</h3><p>No partial job persistence occurred. Provider and model details remain private.</p><button className="button button-secondary" type="button" onClick={closeDialog}>Close</button></div>}
        </div>
      </dialog>
    </>
  );
}
