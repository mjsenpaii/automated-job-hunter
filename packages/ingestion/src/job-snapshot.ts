import { z } from 'zod';
import { GovernmentSalaryReferenceSchema } from './government-enrichment.js';
import { VerifiedJobRequirementsExtractionSchema } from './job-requirements-contracts.js';

const SnapshotPipelineSchema = z
  .object({
    status: z.string().optional(),
    rejectionReasons: z.array(z.string()).optional(),
  })
  .passthrough();

/**
 * Legacy version-1 snapshots and version-2 government-enriched snapshots share
 * this tolerant parser. Unknown future fields are preserved, while typed
 * government metadata is validated before use.
 */
export const StoredJobSnapshotSchema = z
  .object({
    version: z.number().int().positive(),
    source: z.string().optional(),
    extraction: z.record(z.unknown()).default({}),
    pipeline: SnapshotPipelineSchema.optional(),
    government: GovernmentSalaryReferenceSchema.optional(),
    verifiedRequirements: VerifiedJobRequirementsExtractionSchema.optional(),
  })
  .passthrough();

export type StoredJobSnapshot = z.infer<typeof StoredJobSnapshotSchema>;

export function parseStoredJobSnapshot(
  value: string | null | undefined,
): StoredJobSnapshot | null {
  if (!value) return null;
  let decoded: unknown;
  try {
    decoded = JSON.parse(value);
  } catch {
    return null;
  }
  const parsed = StoredJobSnapshotSchema.safeParse(decoded);
  return parsed.success ? parsed.data : null;
}
