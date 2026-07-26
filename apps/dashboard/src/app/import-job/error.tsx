'use client';

import { useEffect } from 'react';
import Link from 'next/link';

/**
 * Route-level error boundary for /import-job.
 * Never shows raw stack traces. Offers recovery actions.
 */
export default function ImportJobError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Import job page error:', {
      message: error.message,
      digest: error.digest,
    });
  }, [error]);

  return (
    <div className="import-error-boundary">
      <h1>Something went wrong</h1>
      <p>
        The importer hit an unexpected error. Your entered details were not lost
        from the server — you can retry or return to start over.
      </p>
      <div className="actions">
        <button type="button" className="btn btn-primary" onClick={reset}>
          Try again
        </button>
        <Link href="/import-job" className="btn btn-outline">
          Return to importer
        </Link>
        <Link href="/" className="btn btn-outline">
          Back to dashboard
        </Link>
      </div>
      <style>{`
        .import-error-boundary {
          max-width: 36rem;
          margin: 2rem auto;
          padding: 1.5rem;
          border: 1px solid var(--border-color);
          border-radius: 10px;
          background: var(--bg-secondary);
        }
        .import-error-boundary h1 {
          font-size: 1.35rem;
          margin-bottom: 0.5rem;
        }
        .import-error-boundary p {
          color: var(--text-secondary);
          margin-bottom: 1.25rem;
        }
        .import-error-boundary .actions {
          display: flex;
          flex-wrap: wrap;
          gap: 0.75rem;
        }
        .import-error-boundary .btn:focus-visible {
          outline: 2px solid var(--accent-primary);
          outline-offset: 2px;
        }
      `}</style>
    </div>
  );
}
