import { NextResponse } from 'next/server';
import {
  extractFromUrl,
  apiError,
  validateUrl,
} from '@job-app/ingestion/dashboard-server';

export async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        apiError('INVALID_JSON', 'Request body must be valid JSON.'),
        { status: 400 },
      );
    }

    const url =
      body && typeof body === 'object' && 'url' in body
        ? String((body as { url?: unknown }).url ?? '').trim()
        : '';

    if (!url) {
      return NextResponse.json(
        apiError('VALIDATION_ERROR', 'URL is required.', { url: 'URL is required.' }),
        { status: 400 },
      );
    }

    const syncValidation = validateUrl(url);
    if (!syncValidation.valid) {
      return NextResponse.json(
        apiError('SSRF_BLOCKED', syncValidation.error || 'URL is not allowed.'),
        { status: 400 },
      );
    }

    const result = await extractFromUrl(url);
    if (!result.success) {
      const message = result.error || 'Failed to extract job data.';
      const isBlocked =
        message.toLowerCase().includes('allow') ||
        message.toLowerCase().includes('private') ||
        message.toLowerCase().includes('local') ||
        message.toLowerCase().includes('format');
      return NextResponse.json(
        {
          ...apiError(isBlocked ? 'SSRF_BLOCKED' : 'EXTRACTION_FAILED', message),
          data: null,
          warnings: result.warnings,
          requires_manual_input: result.requires_manual_input,
          missingFields: result.missingFields ?? [],
        },
        { status: isBlocked ? 400 : 422 },
      );
    }

    return NextResponse.json({
      success: true,
      data: result.data,
      warnings: result.warnings,
      requires_manual_input: result.requires_manual_input,
      missingFields: result.missingFields ?? [],
    });
  } catch (error) {
    console.error('Extraction API error:', {
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      apiError('INTERNAL_ERROR', 'Unable to scan the posting. Try again.'),
      { status: 500 },
    );
  }
}
