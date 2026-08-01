import { z } from 'zod';
import type {
  JobSearchProfileId,
  ProfileMatchEvidence,
} from './job-search-profiles.v1.js';

export const DiscoveryDiagnosticReasonCodeSchema = z.enum([
  'INVALID_RECORD',
  'DUPLICATE',
  'EXCLUDED_TITLE',
  'EXCLUDED_EMPLOYMENT_TYPE',
  'EXCLUDED_LOCATION',
  'EXCESSIVE_EXPERIENCE_OR_SENIORITY',
  'UNRELATED_ROLE_FAMILY',
  'INSUFFICIENT_POSITIVE_EVIDENCE',
  'CONFLICTING_NEGATIVE_EVIDENCE',
  'UNTARGETED',
  'OTHER_EXISTING_REASON',
]);
export type DiscoveryDiagnosticReasonCode = z.infer<
  typeof DiscoveryDiagnosticReasonCodeSchema
>;

export const DiscoveryDiagnosticStageSchema = z.enum([
  'SOURCE_VALIDATION',
  'NORMALIZATION',
  'DEDUPLICATION',
  'LOCAL_FILTER',
  'PROFILE_MATCHING',
  'PIPELINE',
]);
export type DiscoveryDiagnosticStage = z.infer<
  typeof DiscoveryDiagnosticStageSchema
>;

export interface ProfileCoverageDecision {
  profileId: JobSearchProfileId;
  matched: boolean;
  positiveSignals: ProfileMatchEvidence[];
  blocker: DiscoveryDiagnosticReasonCode | null;
}

export interface DiscoveryDiagnosticEvent {
  sourceName: string;
  sourceJobId: string;
  normalizedId: string | null;
  title: string;
  company: string;
  stage: DiscoveryDiagnosticStage;
  reasonCodes: DiscoveryDiagnosticReasonCode[];
  passedLocalFilters: boolean | null;
  profileDecisions: ProfileCoverageDecision[];
}

export interface DiscoveryDiagnosticCollector {
  record(event: DiscoveryDiagnosticEvent): void;
}
