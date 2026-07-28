import { z } from 'zod';
import {
  JobSearchScheduleGroupSchema,
  type JobSearchScheduleGroup,
} from './job-search-profiles.v1.js';

/**
 * Deterministic source retrieval hints for schedule groups.
 *
 * Hints only influence provider/local candidate retrieval.
 * Local profile matching remains authoritative.
 */

export const SourceRetrievalHintSchema = z
  .object({
    query: z.string(),
    category: z.string(),
    notes: z.string().trim().min(1),
  })
  .strict();
export type SourceRetrievalHint = z.infer<typeof SourceRetrievalHintSchema>;

export const ScheduleRetrievalHintsSchema = z
  .object({
    arbeitnow: SourceRetrievalHintSchema,
    remotive: SourceRetrievalHintSchema,
    lever: SourceRetrievalHintSchema,
  })
  .strict();
export type ScheduleRetrievalHints = z.infer<
  typeof ScheduleRetrievalHintsSchema
>;

const ScheduleRetrievalHintsByGroupSchema = z
  .object({
    MORNING: ScheduleRetrievalHintsSchema,
    EVENING: ScheduleRetrievalHintsSchema,
  })
  .strict();

export const SCHEDULE_RETRIEVAL_HINTS_V1 =
  ScheduleRetrievalHintsByGroupSchema.parse({
    MORNING: {
      arbeitnow: {
        // Arbeitnow has no server-side category/search parameter.
        // Empty local query keeps the latest remote page; profile matching
        // decides targeting. Recall is limited to the fetched page window.
        query: '',
        category: '',
        notes:
          'Arbeitnow has no combined server-side search. Morning fetches the latest remote page once; profile matching is authoritative. Automation and niche roles outside that page window may be missed.',
      },
      remotive: {
        query: '',
        category: 'software-dev',
        notes:
          'Remotive morning uses the software-dev category once as a retrieval hint for software development and related automation roles. Roles outside software-dev may be missed because Remotive accepts only one category per request.',
      },
      lever: {
        query: '',
        category: '',
        notes:
          'Lever has no search API. Morning attempts each configured board once; profile matching filters successful board results locally. Niche titles absent from the current board pages may be missed.',
      },
    },
    EVENING: {
      arbeitnow: {
        query: '',
        category: '',
        notes:
          'Arbeitnow has no combined server-side search. Evening fetches the latest remote page once; profile matching is authoritative for AI-augmented and low-code roles. Recall is limited to the fetched page window.',
      },
      remotive: {
        // Remotive officially supports one `search` parameter. A broad
        // development hint is applied once; local profile evidence remains
        // authoritative and low-code roles without "developer" may be missed.
        query: 'developer',
        category: '',
        notes:
          'Remotive evening uses one broad developer search hint and no category in one request. Local AI-assisted/low-code profile evidence remains authoritative. Low-code builder roles without developer wording and results beyond the 50-job ceiling may be missed.',
      },
      lever: {
        query: '',
        category: '',
        notes:
          'Lever has no search API. Evening attempts each configured board once; profile matching filters successful board results locally for AI-augmented and low-code evidence.',
      },
    },
  });

export function getScheduleRetrievalHints(
  group: JobSearchScheduleGroup,
): ScheduleRetrievalHints {
  JobSearchScheduleGroupSchema.parse(group);
  return SCHEDULE_RETRIEVAL_HINTS_V1[group];
}
