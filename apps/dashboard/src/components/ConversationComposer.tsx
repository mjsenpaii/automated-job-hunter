'use client';

import { useRef } from 'react';
import {
  AnalyzeJobRequestSchema,
  MAX_JOB_INPUT_CHARS,
} from '@job-app/ingestion/gemini-contracts';
import { shouldSubmitComposer } from '@/lib/import/composer';
import { AppIcon } from './icons';

export function ConversationComposer({
  value,
  onChange,
  onSubmit,
  loading,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  loading: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const canSubmit =
    AnalyzeJobRequestSchema.safeParse({ input: value }).success && !loading;

  return (
    <div className="composer-wrap">
      <label htmlFor="job-import-input" className="visually-hidden">
        Job URL or pasted content
      </label>
      <div className="conversation-composer">
        <textarea
          ref={textareaRef}
          id="job-import-input"
          value={value}
          maxLength={MAX_JOB_INPUT_CHARS}
          rows={4}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (
              shouldSubmitComposer({
                key: event.key,
                shiftKey: event.shiftKey,
                isComposing: event.nativeEvent.isComposing,
                canSubmit,
              })
            ) {
              event.preventDefault();
              onSubmit();
            }
          }}
          placeholder="Paste a job URL, copied webpage, raw HTML, or job description…"
          aria-describedby="composer-help composer-count"
          disabled={loading}
        />
        <div className="composer-footer">
          <span id="composer-help">Enter to analyse · Shift+Enter for a new line</span>
          <span id="composer-count" className="composer-count">
            {value.length.toLocaleString()} / {MAX_JOB_INPUT_CHARS.toLocaleString()}
          </span>
          <button
            type="button"
            className="button button-primary composer-submit"
            onClick={onSubmit}
            disabled={!canSubmit}
          >
            {loading ? (
              <>
                <span className="spinner" aria-hidden="true" />
                Analysing
              </>
            ) : (
              <>
                Analyse
                <AppIcon name="send" size={17} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
