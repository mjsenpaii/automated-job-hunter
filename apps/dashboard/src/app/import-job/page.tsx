'use client';

import { useCallback, useId, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { ConfirmRequiredField, ExtractedJobData, JobImportResult } from '@job-app/ingestion/import-contracts';
import {
  getMissingConfirmFields,
  validateConfirmScoreRequest,
} from '@job-app/ingestion/import-contracts';
import { postConfirmScore, postExtract } from '@/lib/import/safe-fetch';
import {
  deriveResultState,
  deriveReviewState,
  isValidHttpUrl,
  type ImportUiState,
} from '@/lib/import/form-state';
import { ImportField, displayOrFallback } from './ImportField';
import { ImportResultPanel } from './ImportResultPanel';
import { IMPORT_STYLES } from './import-styles';

type FormDraft = {
  title: string;
  company: string;
  description: string;
  url: string;
  country: string;
  city: string;
  work_setup: 'REMOTE' | 'HYBRID' | 'ONSITE' | 'TEMPORARY_REMOTE' | 'UNCLEAR';
  employment_type: string;
  skills: string;
  salary_text: string;
  seniority: string;
};

const EMPTY_DRAFT: FormDraft = {
  title: '',
  company: '',
  description: '',
  url: '',
  country: '',
  city: '',
  work_setup: 'UNCLEAR',
  employment_type: '',
  skills: '',
  salary_text: '',
  seniority: '',
};

function draftFromExtraction(data: ExtractedJobData, fallbackUrl: string): FormDraft {
  const work = (data.work_setup ?? 'UNCLEAR').toUpperCase();
  const work_setup: FormDraft['work_setup'] =
    work === 'REMOTE' ||
    work === 'HYBRID' ||
    work === 'ONSITE' ||
    work === 'TEMPORARY_REMOTE'
      ? work
      : 'UNCLEAR';

  return {
    title: data.title?.trim() ?? '',
    company: data.company?.trim() ?? '',
    description: data.description?.trim() ?? '',
    url: data.source_url?.trim() || fallbackUrl,
    country: data.country?.trim() ?? '',
    city: data.city?.trim() ?? '',
    work_setup,
    employment_type: data.employment_type?.trim() ?? '',
    skills: [...(data.required_skills ?? []), ...(data.preferred_skills ?? [])]
      .filter(Boolean)
      .join(', '),
    salary_text: data.salary_text?.trim() ?? '',
    seniority: data.seniority?.trim() ?? '',
  };
}

export default function ImportJobPage() {
  const formId = useId();
  const firstErrorRef = useRef<HTMLInputElement | null>(null);
  const scoringLock = useRef(false);

  const [uiState, setUiState] = useState<ImportUiState>('IDLE');
  const [url, setUrl] = useState('');
  const [draft, setDraft] = useState<FormDraft>(EMPTY_DRAFT);
  const [extracted, setExtracted] = useState<ExtractedJobData | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<JobImportResult | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const missingRequired = useMemo(
    () => getMissingConfirmFields(draft),
    [draft],
  );

  const updateField = useCallback(<K extends keyof FormDraft>(key: K, value: FormDraft[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => {
      if (!prev[key] && key !== 'country' && key !== 'city') return prev;
      const next = { ...prev };
      delete next[key];
      if (key === 'country' || key === 'city') delete next.country;
      return next;
    });
  }, []);

  const focusFirstInvalid = useCallback((errors: Record<string, string>) => {
    const order = ['title', 'company', 'description', 'url', 'country', 'city', 'work_setup'];
    const first = order.find((k) => errors[k]);
    if (!first) return;
    const el = document.getElementById(`${formId}-${first}`);
    if (el && 'focus' in el) {
      (el as HTMLElement).focus();
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else if (firstErrorRef.current) {
      firstErrorRef.current.focus();
    }
  }, [formId]);

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidHttpUrl(url) || uiState === 'SCANNING') return;

    setUiState('SCANNING');
    setErrorMessage(null);
    setStatusMessage('Reading the job posting…');
    setImportResult(null);
    setFieldErrors({});

    const res = await postExtract(url.trim());
    if (!res.ok) {
      setUiState('ERROR');
      setErrorMessage(res.error.message);
      setStatusMessage(null);
      return;
    }

    if (!res.data.data) {
      setUiState('ERROR');
      setErrorMessage(res.data.error || 'Failed to extract job data.');
      setStatusMessage(null);
      return;
    }

    const nextDraft = draftFromExtraction(res.data.data, url.trim());
    setExtracted(res.data.data);
    setDraft(nextDraft);
    setWarnings(res.data.warnings ?? []);
    const missing = getMissingConfirmFields(nextDraft);
    setUiState(deriveReviewState(missing));
    setStatusMessage(
      missing.length > 0
        ? 'We found the posting, but some required details are missing. Complete the highlighted fields before scoring.'
        : 'Review extracted details, then confirm and score.',
    );
    setErrorMessage(null);
  };

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (scoringLock.current) return;

    const validated = validateConfirmScoreRequest(draft);
    if (!validated.ok) {
      setFieldErrors(validated.fieldErrors);
      setUiState('PARTIAL_RESULT');
      setStatusMessage(validated.message);
      focusFirstInvalid(validated.fieldErrors);
      return;
    }

    scoringLock.current = true;
    setUiState('SCORING');
    setStatusMessage('Checking eligibility and match…');
    setErrorMessage(null);

    try {
      const res = await postConfirmScore(validated.data);
      if (!res.ok) {
        setUiState('ERROR');
        setErrorMessage(res.error.message);
        if (res.error.fieldErrors) setFieldErrors(res.error.fieldErrors);
        setStatusMessage(null);
        return;
      }

      setImportResult(res.data);
      setUiState(deriveResultState(res.data.status));
      setStatusMessage(null);
      setErrorMessage(null);
    } finally {
      scoringLock.current = false;
    }
  };

  const resetToIdle = () => {
    scoringLock.current = false;
    setUiState('IDLE');
    setUrl('');
    setDraft(EMPTY_DRAFT);
    setExtracted(null);
    setFieldErrors({});
    setStatusMessage(null);
    setErrorMessage(null);
    setImportResult(null);
    setWarnings([]);
  };

  const backToReview = () => {
    scoringLock.current = false;
    setImportResult(null);
    setErrorMessage(null);
    setUiState(deriveReviewState(getMissingConfirmFields(draft)));
    setStatusMessage('Edit the extracted details, then confirm and score.');
  };

  const showReview =
    uiState === 'PARTIAL_RESULT' ||
    uiState === 'READY_TO_SCORE' ||
    uiState === 'SCORING' ||
    (uiState === 'ERROR' && extracted !== null);

  const showResult =
    uiState === 'SCORED' ||
    uiState === 'HARD_REJECTED' ||
    uiState === 'INELIGIBLE' ||
    uiState === 'DUPLICATE';

  const scoringInFlight = uiState === 'SCORING';
  const confirmDisabled =
    scoringInFlight ||
    missingRequired.length > 0 ||
    (uiState !== 'READY_TO_SCORE' &&
      uiState !== 'PARTIAL_RESULT' &&
      uiState !== 'ERROR');

  const missingSet = new Set<string>(missingRequired);
  const fieldInvalid = (key: string) =>
    Boolean(fieldErrors[key]) ||
    missingSet.has(key) ||
    (key === 'country' && missingSet.has('location' satisfies ConfirmRequiredField));

  return (
    <div className="import-page">
      <header className="import-header">
        <h1>Import job from URL</h1>
        <p>
          Scan a public job posting, review the extracted details, then confirm
          to run eligibility checks and scoring.
        </p>
      </header>

      <div aria-live="polite" className="sr-status">
        {statusMessage}
      </div>

      {(uiState === 'IDLE' || uiState === 'SCANNING' || (uiState === 'ERROR' && !extracted)) && (
        <section className="panel">
          <form onSubmit={handleScan} className="scan-form" noValidate>
            <div className="field">
              <label htmlFor={`${formId}-scan-url`}>Job URL</label>
              <div className="url-row">
                <input
                  id={`${formId}-scan-url`}
                  type="url"
                  inputMode="url"
                  autoComplete="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://company.com/careers/role"
                  disabled={uiState === 'SCANNING'}
                  aria-invalid={Boolean(errorMessage) && !isValidHttpUrl(url)}
                  aria-describedby={errorMessage ? `${formId}-scan-error` : undefined}
                />
                <button
                  type="button"
                  className="btn btn-outline"
                  disabled={uiState === 'SCANNING'}
                  onClick={async () => {
                    try {
                      const text = await navigator.clipboard.readText();
                      setUrl(text);
                    } catch {
                      setErrorMessage('Could not read the clipboard.');
                    }
                  }}
                >
                  Paste
                </button>
              </div>
            </div>

            {errorMessage && (
              <div id={`${formId}-scan-error`} className="banner banner-error" role="alert">
                <strong>Unable to scan</strong>
                <p>{errorMessage}</p>
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary"
              disabled={uiState === 'SCANNING' || !isValidHttpUrl(url)}
            >
              {uiState === 'SCANNING' ? 'Reading the job posting…' : 'Scan posting'}
            </button>

            <p className="hint">
              <Link href="/add-job">Or enter job details manually</Link>
            </p>
          </form>
        </section>
      )}

      {showReview && (
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Review extracted details</h2>
              <p className="meta">
                Source:{' '}
                <a href={draft.url} target="_blank" rel="noreferrer">
                  {displayOrFallback(draft.url, 'Not provided')}
                </a>
                {extracted?.extraction_method && (
                  <> · Method: {extracted.extraction_method}</>
                )}
              </p>
            </div>
          </div>

          {statusMessage && (
            <div className="banner banner-info" role="status">
              {statusMessage}
            </div>
          )}

          {warnings.length > 0 && (
            <ul className="warnings">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}

          {errorMessage && (
            <div className="banner banner-error" role="alert">
              <strong>Scoring failed</strong>
              <p>{errorMessage}</p>
              <button type="button" className="btn btn-outline" onClick={backToReview}>
                Edit extracted details
              </button>
            </div>
          )}

          <form onSubmit={handleConfirm} className="review-form" noValidate>
            <fieldset disabled={uiState === 'SCORING'}>
              <legend>Basic information</legend>
              <div className="grid-2">
                <ImportField
                  id={`${formId}-title`}
                  label="Job title"
                  required
                  invalid={fieldInvalid('title')}
                  error={fieldErrors.title}
                  value={draft.title}
                  onChange={(v) => updateField('title', v)}
                  inputRef={firstErrorRef}
                />
                <ImportField
                  id={`${formId}-company`}
                  label="Company name"
                  required
                  invalid={fieldInvalid('company')}
                  error={fieldErrors.company}
                  value={draft.company}
                  onChange={(v) => updateField('company', v)}
                />
              </div>
              <ImportField
                id={`${formId}-url`}
                label="Source URL"
                required
                type="url"
                invalid={fieldInvalid('url')}
                error={fieldErrors.url}
                value={draft.url}
                onChange={(v) => updateField('url', v)}
              />
            </fieldset>

            <fieldset disabled={uiState === 'SCORING'}>
              <legend>Location and work setup</legend>
              <div className="grid-3">
                <ImportField
                  id={`${formId}-country`}
                  label="Country"
                  required={missingSet.has('location')}
                  invalid={fieldInvalid('country')}
                  error={fieldErrors.country}
                  value={draft.country}
                  onChange={(v) => updateField('country', v)}
                  hint="Provide country or city"
                />
                <ImportField
                  id={`${formId}-city`}
                  label="City"
                  value={draft.city}
                  onChange={(v) => updateField('city', v)}
                />
                <div className="field">
                  <label htmlFor={`${formId}-work_setup`}>
                    Work setup <span className="req" aria-hidden="true">*</span>
                  </label>
                  <select
                    id={`${formId}-work_setup`}
                    value={draft.work_setup}
                    onChange={(e) =>
                      updateField('work_setup', e.target.value as FormDraft['work_setup'])
                    }
                    aria-invalid={fieldInvalid('work_setup')}
                    aria-describedby={
                      fieldErrors.work_setup ? `${formId}-work_setup-err` : undefined
                    }
                    className={fieldInvalid('work_setup') ? 'invalid' : undefined}
                  >
                    <option value="UNCLEAR">Unclear</option>
                    <option value="REMOTE">Remote</option>
                    <option value="HYBRID">Hybrid</option>
                    <option value="ONSITE">On-site</option>
                    <option value="TEMPORARY_REMOTE">Temporary remote</option>
                  </select>
                  {fieldErrors.work_setup && (
                    <p id={`${formId}-work_setup-err`} className="field-error" role="alert">
                      {fieldErrors.work_setup}
                    </p>
                  )}
                </div>
              </div>
              <div className="grid-2">
                <ImportField
                  id={`${formId}-employment_type`}
                  label="Employment type"
                  value={draft.employment_type}
                  onChange={(v) => updateField('employment_type', v)}
                  hint="Optional"
                />
                <ImportField
                  id={`${formId}-seniority`}
                  label="Seniority"
                  value={draft.seniority}
                  onChange={(v) => updateField('seniority', v)}
                  hint="Optional"
                />
              </div>
            </fieldset>

            <fieldset disabled={uiState === 'SCORING'}>
              <legend>Description</legend>
              <div className="field">
                <label htmlFor={`${formId}-description`}>
                  Job description <span className="req" aria-hidden="true">*</span>
                </label>
                <textarea
                  id={`${formId}-description`}
                  rows={8}
                  value={draft.description}
                  onChange={(e) => updateField('description', e.target.value)}
                  aria-invalid={fieldInvalid('description')}
                  aria-describedby={
                    fieldErrors.description ? `${formId}-description-err` : undefined
                  }
                  className={fieldInvalid('description') ? 'invalid' : undefined}
                  required
                />
                {fieldErrors.description && (
                  <p id={`${formId}-description-err`} className="field-error" role="alert">
                    {fieldErrors.description}
                  </p>
                )}
              </div>
            </fieldset>

            <fieldset disabled={uiState === 'SCORING'}>
              <legend>Requirements and compensation</legend>
              <ImportField
                id={`${formId}-skills`}
                label="Skills"
                value={draft.skills}
                onChange={(v) => updateField('skills', v)}
                hint="Optional — comma-separated"
              />
              <ImportField
                id={`${formId}-salary_text`}
                label="Salary"
                value={draft.salary_text}
                onChange={(v) => updateField('salary_text', v)}
                hint="Optional — not invented if missing"
              />
            </fieldset>

            {missingRequired.length > 0 && (
              <div className="banner banner-warn" role="status">
                Complete the required fields before scoring: {missingRequired.join(', ')}.
              </div>
            )}

            <div className="form-actions">
              <button type="button" className="btn btn-outline" onClick={resetToIdle}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={confirmDisabled}>
                {uiState === 'SCORING' ? 'Checking eligibility and match…' : 'Confirm and score'}
              </button>
            </div>
          </form>
        </section>
      )}

      {showResult && importResult && (
        <ImportResultPanel result={importResult} onAgain={resetToIdle} onEdit={backToReview} />
      )}

      <style>{IMPORT_STYLES}</style>
    </div>
  );
}
