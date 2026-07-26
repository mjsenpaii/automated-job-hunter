/**
 * Safe JSON fetch for importer API calls.
 * Never assumes the body is JSON; never throws on malformed responses.
 */

import {
  apiError,
  parseJobImportResponse,
  type ApiError,
  type ExtractionResult,
  type JobImportResult,
} from '@job-app/ingestion/import-contracts';
export type SafeJsonResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: ApiError };

function isJsonContentType(headers: Headers): boolean {
  const ct = headers.get('content-type') ?? '';
  return ct.includes('application/json');
}

async function readJsonBody(res: Response): Promise<unknown> {
  if (!isJsonContentType(res.headers)) {
    try {
      await res.text();
    } catch {
      /* ignore */
    }
    return null;
  }
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function postJson(url: string, body: unknown): Promise<{
  status: number;
  payload: unknown | null;
  networkError: boolean;
}> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
    const payload = await readJsonBody(res);
    return { status: res.status, payload, networkError: false };
  } catch {
    return { status: 0, payload: null, networkError: true };
  }
}

function asApiError(status: number, payload: unknown | null): ApiError {
  if (payload && typeof payload === 'object') {
    const parsed = parseJobImportResponse(payload);
    if ('success' in parsed && parsed.success === false) return parsed;

    const p = payload as Record<string, unknown>;
    if (typeof p.message === 'string') {
      return apiError(
        status === 409 ? 'DUPLICATE' : 'INTERNAL_ERROR',
        p.message,
        typeof p.fieldErrors === 'object' && p.fieldErrors
          ? (p.fieldErrors as Record<string, string>)
          : undefined,
      );
    }
    if (typeof p.error === 'string') {
      return apiError(status === 409 ? 'DUPLICATE' : 'INTERNAL_ERROR', p.error);
    }
  }

  if (payload === null) {
    return apiError(
      'INVALID_JSON',
      'Unable to load. The server returned a non-JSON response.',
    );
  }

  return apiError('INTERNAL_ERROR', 'Request failed.');
}

/** POST /api/extract — returns the extraction envelope or a structured error. */
export async function postExtract(url: string): Promise<
  SafeJsonResult<ExtractionResult & { missingFields?: string[] }>
> {
  const { status, payload, networkError } = await postJson('/api/extract', { url });

  if (networkError) {
    return {
      ok: false,
      status: 0,
      error: apiError('INTERNAL_ERROR', 'Network error. Check your connection and try again.'),
    };
  }

  if (status < 200 || status >= 300) {
    return { ok: false, status, error: asApiError(status, payload) };
  }

  if (!payload || typeof payload !== 'object') {
    return {
      ok: false,
      status,
      error: apiError('INVALID_JSON', 'Unexpected response from the server.'),
    };
  }

  const p = payload as ExtractionResult & { missingFields?: string[]; success?: boolean };
  if (p.success === false) {
    return { ok: false, status, error: asApiError(status, payload) };
  }

  return { ok: true, status, data: p };
}

/** POST /api/jobs — returns a narrowed JobImportResult or ApiError. */
export async function postConfirmScore(
  body: unknown,
): Promise<SafeJsonResult<JobImportResult>> {
  const { status, payload, networkError } = await postJson('/api/jobs', body);

  if (networkError) {
    return {
      ok: false,
      status: 0,
      error: apiError('INTERNAL_ERROR', 'Network error. Check your connection and try again.'),
    };
  }

  // 409 duplicate is a successful business outcome for the UI state machine.
  if (status === 409 && payload) {
    const parsed = parseJobImportResponse(payload);
    if ('success' in parsed && parsed.success === true && parsed.status === 'DUPLICATE') {
      return { ok: true, status, data: parsed };
    }
    return { ok: false, status, error: asApiError(status, payload) };
  }

  if (status < 200 || status >= 300) {
    return { ok: false, status, error: asApiError(status, payload) };
  }

  const parsed = parseJobImportResponse(payload);
  if ('success' in parsed && parsed.success === false) {
    return { ok: false, status, error: parsed };
  }

  return { ok: true, status, data: parsed as JobImportResult };
}
