'use client';

import { useState } from 'react';
import {
  formatJobDetailsAsText,
  getJobExportFilename,
  type JobDetailData,
} from '@/lib/jobs/job-export';
import { AppIcon } from './icons';

type ExportState = 'idle' | 'copying' | 'copied' | 'downloaded' | 'error';

async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  try {
    textarea.select();
    if (!document.execCommand('copy')) {
      throw new Error('Clipboard access was unavailable.');
    }
  } finally {
    textarea.remove();
  }
}

export function JobExportActions({ job }: { job: JobDetailData }) {
  const [state, setState] = useState<ExportState>('idle');
  const exportText = () => formatJobDetailsAsText(job);

  const copyDetails = async () => {
    setState('copying');
    try {
      await copyToClipboard(exportText());
      setState('copied');
    } catch {
      setState('error');
    }
  };

  const downloadDetails = () => {
    try {
      const blob = new Blob([exportText()], {
        type: 'text/plain;charset=utf-8',
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = getJobExportFilename(job);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      setState('downloaded');
    } catch {
      setState('error');
    }
  };

  const feedback =
    state === 'copying'
      ? 'Copying job details…'
      : state === 'copied'
        ? 'All job details copied.'
        : state === 'downloaded'
          ? 'Text file downloaded.'
          : state === 'error'
            ? 'Export failed. Try the other export option.'
            : '';

  return (
    <section className="summary-export" aria-labelledby="export-job-heading">
      <div className="visually-hidden">
        <h2 id="export-job-heading">Export job</h2>
        <p>Save or paste a complete plain-text copy.</p>
      </div>
      <div className="export-actions">
        <button
          type="button"
          className="button button-secondary"
          disabled={state === 'copying'}
          aria-busy={state === 'copying'}
          onClick={copyDetails}
        >
          <AppIcon name={state === 'copied' ? 'check' : 'copy'} size={17} />
          {state === 'copying' ? 'Copying…' : 'Copy all details'}
        </button>
        <button
          type="button"
          className="button button-secondary"
          disabled={state === 'copying'}
          onClick={downloadDetails}
        >
          <AppIcon name="download" size={17} />
          Download .txt
        </button>
        <button
          type="button"
          className="button button-secondary"
          disabled
          title="Resume generation is not available yet."
        >
          <AppIcon name="briefcase" size={17} />
          Generate resume
          <span className="button-status">Soon</span>
        </button>
      </div>
      <p
        className={`export-feedback${state === 'error' ? ' export-feedback-error' : ''}`}
        role={state === 'error' ? 'alert' : 'status'}
        aria-live={state === 'error' ? undefined : 'polite'}
      >
        {feedback}
      </p>
    </section>
  );
}
