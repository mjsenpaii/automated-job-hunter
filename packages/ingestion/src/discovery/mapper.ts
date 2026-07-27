import type { RawJobInput } from '../types.js';
import type { DiscoveredJob } from './contracts.js';

export function mapDiscoveredJobToRawInput(
  discovered: DiscoveredJob,
): RawJobInput {
  return {
    source_name: discovered.sourceName,
    source_job_id: discovered.sourceJobId,
    original_url: discovered.sourceUrl,
    application_url: discovered.applicationUrl ?? discovered.sourceUrl,
    title: discovered.title,
    company: discovered.company,
    description: discovered.description,
    date_posted: discovered.publishedAt ?? undefined,
    // The public API exposes a location string, not separately verified
    // city/country fields. Preserve it without inventing a country.
    city: discovered.location ?? undefined,
    work_setup_hint:
      discovered.remote === true ? 'remote' : undefined,
    employment_type: discovered.employmentType ?? undefined,
    required_skills: discovered.tags,
    raw_html: JSON.stringify({
      version: 1,
      source: 'public-discovery',
      attribution: {
        sourceName: discovered.sourceName,
        sourceJobId: discovered.sourceJobId,
        sourceUrl: discovered.sourceUrl,
        location: discovered.location,
        remote: discovered.remote,
        employmentType: discovered.employmentType,
        tags: discovered.tags,
        publishedAt: discovered.publishedAt,
      },
    }),
  };
}
