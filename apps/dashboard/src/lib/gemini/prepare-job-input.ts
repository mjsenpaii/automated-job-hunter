import 'server-only';

import {
  cleanJobContent,
  detectJobInputKind,
  extractFromUrl,
  type ExtractedJobData,
} from '@job-app/ingestion/dashboard-server';

export class JobInputPreparationError extends Error {
  constructor(
    readonly code: 'EXTRACTION_FAILED' | 'SSRF_BLOCKED',
    message: string,
  ) {
    super(message);
    this.name = 'JobInputPreparationError';
  }
}

function normalizedSample(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 160);
}

function structuredUrlContext(
  data: ExtractedJobData,
  readableHtml: string,
): string {
  const location = [data.city, data.country].filter(Boolean).join(', ');
  const description = data.description
    ? cleanJobContent(data.description, 50_000)
    : '';
  const descriptionAlreadyPresent =
    description.length > 0 &&
    normalizedSample(readableHtml).includes(normalizedSample(description));
  return [
    data.title && `Job title: ${data.title}`,
    data.company && `Company: ${data.company}`,
    location && `Location: ${location}`,
    data.work_setup && `Work setup: ${data.work_setup}`,
    data.employment_type && `Employment type: ${data.employment_type}`,
    data.salary_text && `Salary: ${data.salary_text}`,
    data.eligibility_text && `Eligibility: ${data.eligibility_text}`,
    data.allowed_countries.length > 0 &&
      `Allowed countries: ${data.allowed_countries.join(', ')}`,
    data.allowed_regions.length > 0 &&
      `Allowed regions: ${data.allowed_regions.join(', ')}`,
    data.required_skills.length > 0 &&
      `Required skills: ${data.required_skills.join(', ')}`,
    data.preferred_skills.length > 0 &&
      `Preferred skills: ${data.preferred_skills.join(', ')}`,
    data.application_url && `Application URL: ${data.application_url}`,
    !descriptionAlreadyPresent && description,
  ]
    .filter((value): value is string => Boolean(value))
    .join('\n');
}

export async function prepareJobInput(input: string): Promise<{
  content: string;
  inputKind: 'url' | 'html' | 'text';
  sourceUrl: string | null;
  htmlWasComplex: boolean;
  warnings: string[];
}> {
  const inputKind = detectJobInputKind(input);
  let source = input;
  let urlContext = '';
  let sourceUrl: string | null = null;
  const warnings: string[] = [];

  if (inputKind === 'url') {
    sourceUrl = input.trim();
    const extracted = await extractFromUrl(sourceUrl);
    if (!extracted.success || !extracted.data?.raw_html) {
      const message = extracted.error ?? 'The URL could not be read.';
      const ssrf =
        /private|loopback|local network|reserved|scheme|dns/i.test(message);
      throw new JobInputPreparationError(
        ssrf ? 'SSRF_BLOCKED' : 'EXTRACTION_FAILED',
        ssrf
          ? 'That URL cannot be accessed safely.'
          : 'The job page could not be read. Paste the page content instead.',
      );
    }
    source = extracted.data.raw_html;
    const readableHtml = cleanJobContent(source);
    urlContext = structuredUrlContext(extracted.data, readableHtml);
  }

  const content = cleanJobContent(
    urlContext ? `${urlContext}\n${source}` : source,
  );
  const tagCount = source.match(/<[^>]+>/g)?.length ?? 0;
  const htmlWasComplex =
    tagCount >= 25 ||
    (tagCount >= 8 && source.length > Math.max(content.length * 1.8, 2_000));
  if (content.length < 20) {
    throw new JobInputPreparationError(
      'EXTRACTION_FAILED',
      'The pasted content did not contain enough readable job information.',
    );
  }
  if (source.length > content.length && source.length > 60_000) {
    warnings.push('Very long content was reduced to the most useful readable text.');
  }

  return { content, inputKind, sourceUrl, htmlWasComplex, warnings };
}
