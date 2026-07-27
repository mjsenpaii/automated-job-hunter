'use client';

import { useRef, useState } from 'react';
import {
  AnalyzeJobRequestSchema,
  AnalyzeJobSuccessSchema,
  type EnrichedGeminiJobExtraction,
  type GeminiExtractionMetadata,
} from '@job-app/ingestion/gemini-contracts';
import {
  parseJobImportResponse,
  validateConfirmScoreRequest,
  type JobImportResult,
} from '@job-app/ingestion/import-contracts';
import { extractionToConfirmPayload } from '@/lib/import/extraction-state';
import { AppIcon } from './icons';
import { ConversationComposer } from './ConversationComposer';
import { ExtractionReview } from './ExtractionReview';

export function ImportWorkspace() {
  const [input, setInput] = useState('');
  const [extraction, setExtraction] =
    useState<EnrichedGeminiJobExtraction | null>(null);
  const [metadata, setMetadata] = useState<GeminiExtractionMetadata | null>(null);
  const [analysing, setAnalysing] = useState(false);
  const [scoring, setScoring] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [result, setResult] = useState<JobImportResult | null>(null);
  const requestId = useRef(0);

  const analyse = async () => {
    if (!AnalyzeJobRequestSchema.safeParse({ input }).success || analysing) return;
    const id = ++requestId.current;
    setAnalysing(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch('/api/analyze-job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (id !== requestId.current) return;
      if (!response.ok) {
        const message =
          payload &&
          typeof payload === 'object' &&
          'message' in payload &&
          typeof payload.message === 'string'
            ? payload.message
            : 'The job could not be analysed. Try again.';
        throw new Error(message);
      }
      const parsed = AnalyzeJobSuccessSchema.safeParse(payload);
      if (!parsed.success) {
        throw new Error('The server returned an invalid extraction. Try again.');
      }
      setExtraction(parsed.data.extraction);
      setMetadata({
        modelUsed: parsed.data.modelUsed,
        fallbackUsed: parsed.data.fallbackUsed,
        fallbackReason: parsed.data.fallbackReason,
        confidence: parsed.data.confidence,
      });
      setWarnings(parsed.data.warnings);
      setEditing(false);
    } catch (caught) {
      setError(
        caught instanceof TypeError
          ? 'The server could not be reached. Check your connection and try again.'
          : caught instanceof Error
          ? caught.message
          : 'The job could not be analysed. Try again.',
      );
    } finally {
      if (id === requestId.current) setAnalysing(false);
    }
  };

  const confirm = async () => {
    if (!extraction || scoring) return;
    setError(null);
    const validation = validateConfirmScoreRequest(
      extractionToConfirmPayload(extraction, metadata ?? undefined),
    );
    if (!validation.ok) {
      setError(validation.message);
      setEditing(true);
      return;
    }

    setScoring(true);
    try {
      const response = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validation.data),
      });
      const payload: unknown = await response.json().catch(() => null);
      const parsed = parseJobImportResponse(payload);
      if (!parsed.success) throw new Error(parsed.message);
      setResult(parsed);
    } catch (caught) {
      setError(
        caught instanceof TypeError
          ? 'The server could not be reached. Check your connection and try again.'
          : caught instanceof Error
          ? caught.message
          : 'The job could not be scored. Try again.',
      );
    } finally {
      setScoring(false);
    }
  };

  const startOver = () => {
    requestId.current += 1;
    setInput('');
    setExtraction(null);
    setMetadata(null);
    setAnalysing(false);
    setScoring(false);
    setEditing(false);
    setError(null);
    setWarnings([]);
    setResult(null);
    requestAnimationFrame(() =>
      document.getElementById('job-import-input')?.focus(),
    );
  };

  return (
    <div className="import-workspace">
      <div className="conversation-thread">
        <div className="assistant-message">
          <span className="assistant-avatar" aria-hidden="true">
            <AppIcon name="spark" size={18} />
          </span>
          <div>
            <p className="eyebrow">Import assistant</p>
            <h1>Bring any job post. Leave with a reviewable record.</h1>
            <p>
              Paste a URL, copied webpage, raw HTML, or plain description. Gemini
              extracts facts first; you decide whether the existing pipeline may
              validate, classify, score, and save it.
            </p>
            <ul className="supported-inputs">
              <li>URL</li>
              <li>Copied webpage</li>
              <li>Raw HTML</li>
              <li>Plain text</li>
            </ul>
          </div>
        </div>

        {analysing && (
          <div className="assistant-loading" role="status" aria-live="polite">
            <span className="assistant-avatar" aria-hidden="true">
              <span className="spinner" />
            </span>
            <div>
              <strong>Analysing the job post</strong>
              <p>Cleaning page noise and extracting only supported facts…</p>
              <span className="loading-bar" aria-hidden="true" />
            </div>
          </div>
        )}

        {error && !extraction && (
          <div className="banner banner-danger import-error" role="alert">
            <AppIcon name="warning" size={18} />
            <span>{error}</span>
          </div>
        )}

        {warnings.map((warning) => (
          <div className="banner banner-info import-warning" role="status" key={warning}>
            <AppIcon name="warning" size={18} />
            <span>{warning}</span>
          </div>
        ))}

        {!extraction && (
          <ConversationComposer
            value={input}
            onChange={setInput}
            onSubmit={analyse}
            loading={analysing}
          />
        )}
      </div>

      {extraction && metadata && (
        <ExtractionReview
          extraction={extraction}
          originalContent={input}
          metadata={metadata}
          editing={editing}
          scoring={scoring}
          result={result}
          error={error}
          onChange={setExtraction}
          onEdit={() => setEditing((current) => !current)}
          onConfirm={confirm}
          onStartOver={startOver}
        />
      )}
    </div>
  );
}
