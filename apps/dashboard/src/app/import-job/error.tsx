'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function ImportJobError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Digest is an opaque server correlation id. Raw upstream errors are never
    // logged because SDK diagnostics may contain sensitive configuration.
    if (error.digest) {
      console.error('Import job page error digest:', error.digest);
    }
  }, [error.digest]);

  return (
    <div className="import-error-boundary">
      <h1>Something went wrong</h1>
      <p>The importer hit an unexpected error. Retry or return to a clean importer.</p>
      <div className="actions">
        <button type="button" className="button button-primary" onClick={reset}>
          Try again
        </button>
        <Link href="/import-job" className="button button-secondary">
          Return to importer
        </Link>
        <Link href="/" className="button button-secondary">
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
