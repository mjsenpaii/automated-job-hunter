import { NextResponse } from 'next/server';
import {
  AnalyzeJobRequestSchema,
  enrichGeminiJobExtraction,
  normalizeGeminiExtraction,
} from '@job-app/ingestion/gemini-contracts';
import { cleanJobContent } from '@job-app/ingestion/dashboard-server';
import { apiError } from '@job-app/ingestion/import-contracts';
import {
  extractJobWithGemini,
  GeminiExtractionError,
} from '@/lib/gemini/job-extractor';
import {
  extractVerifiedJobRequirements,
  GeminiJobRequirementsError,
} from '@job-app/ingestion/gemini-requirements-server';
import {
  prepareJobInput,
  JobInputPreparationError,
} from '@/lib/gemini/prepare-job-input';

export const runtime = 'nodejs';
export const maxDuration = 50;

function statusForGeminiError(error: GeminiExtractionError): number {
  switch (error.code) {
    case 'MODEL_RATE_LIMITED':
      return 429;
    case 'MODEL_TIMEOUT':
      return 504;
    case 'MODEL_OUTPUT_INVALID':
      return 422;
    case 'MODEL_NOT_CONFIGURED':
    case 'MODEL_CONFIGURATION_INVALID':
    case 'MODEL_UNAVAILABLE':
      return 503;
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      apiError('INVALID_JSON', 'Request body must be valid JSON.'),
      { status: 400 },
    );
  }

  const parsed = AnalyzeJobRequestSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const tooLarge = issue?.code === 'too_big';
    return NextResponse.json(
      apiError(
        tooLarge ? 'INPUT_TOO_LARGE' : 'VALIDATION_ERROR',
        issue?.message ?? 'Paste a URL or job posting to analyse.',
      ),
      { status: 400 },
    );
  }

  try {
    const prepared = await prepareJobInput(parsed.data.input);
    const result = await extractJobWithGemini(prepared);
    const verifiedRequirements = await extractVerifiedJobRequirements({
      title: result.extraction.title ?? '',
      company: result.extraction.company ?? '',
      rawDescription: prepared.content,
      providerMetadata: {
        sourceName: result.extraction.sourceSite,
        originalUrl: prepared.sourceUrl,
        country: result.extraction.country,
        workSetup: result.extraction.workSetup,
        employmentType: result.extraction.employmentType,
        salaryText: result.extraction.salaryText,
        location: result.extraction.location,
        tags: result.extraction.skills,
      },
    });
    const extraction = enrichGeminiJobExtraction(
      normalizeGeminiExtraction({
        ...result.extraction,
        sourceUrl: prepared.sourceUrl ?? result.extraction.sourceUrl,
        sourceSite:
          prepared.sourceUrl && !result.extraction.sourceSite
            ? new URL(prepared.sourceUrl).hostname.replace(/^www\./, '')
            : result.extraction.sourceSite,
        description: cleanJobContent(prepared.content),
      }),
    );

    return NextResponse.json({
      success: true,
      extraction,
      modelUsed: result.modelUsed,
      fallbackUsed: result.fallbackUsed,
      fallbackReason: result.fallbackReason,
      confidence: extraction.confidence,
      inputKind: prepared.inputKind,
      warnings: prepared.warnings,
      verifiedRequirements,
    });
  } catch (error) {
    if (error instanceof JobInputPreparationError) {
      return NextResponse.json(apiError(error.code, error.message), {
        status: error.code === 'SSRF_BLOCKED' ? 403 : 422,
      });
    }
    if (error instanceof GeminiExtractionError) {
      return NextResponse.json(apiError(error.code, error.message), {
        status: statusForGeminiError(error),
      });
    }
    if (error instanceof GeminiJobRequirementsError) {
      const status =
        error.code === 'MODEL_RATE_LIMITED'
          ? 429
          : error.code === 'MODEL_TIMEOUT'
            ? 504
            : error.code === 'MODEL_OUTPUT_INVALID'
              ? 422
              : 503;
      return NextResponse.json(
        apiError(error.code, 'Verified requirement extraction failed safely.'),
        { status },
      );
    }
    return NextResponse.json(
      apiError('INTERNAL_ERROR', 'Unable to analyse this job right now. Try again.'),
      { status: 500 },
    );
  }
}
