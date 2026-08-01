import type { JobSearchProfileId, ProfileMatchEvidence } from './job-search-profiles.v1.js';
import type { TavilyFetchReport, WebDiscoveryReport } from './contracts.js';
import { getJobSearchProfileDisplayName } from './job-search-profiles.v1.js';
import {
  fixedPublicJobDiscoveryPayloadForSchedule,
  runPublicJobDiscoveryDryRun,
  type PublicJobDiscoveryDryRunDependencies,
  type PublicJobDiscoverySourceName,
} from './orchestration.js';
import {
  DiscoveryDiagnosticReasonCodeSchema,
  type DiscoveryDiagnosticEvent,
  type DiscoveryDiagnosticReasonCode,
  type DiscoveryDiagnosticStage,
  type ProfileCoverageDecision,
} from './profile-coverage-diagnostics.js';

export const PROFILE_COVERAGE_REASON_CODES =
  DiscoveryDiagnosticReasonCodeSchema.options;

export interface ProfileCoverageNearMatch {
  title: string;
  company: string;
  source: string;
  additionalSources: string[];
  positiveSignals: ProfileMatchEvidence[];
  exactBlocker: DiscoveryDiagnosticReasonCode;
  blockerStage: DiscoveryDiagnosticStage;
  exclusionTiming:
    | 'BEFORE_PROFILE_MATCHING'
    | 'DURING_PROFILE_MATCHING'
    | 'AFTER_PROFILE_MATCHING';
  currentMatcherWouldMatch: boolean;
}

export interface ProfileCoverageProfileReport {
  profileId: JobSearchProfileId;
  profileLabel: string;
  candidatesEvaluated: number;
  candidatesWithPositiveSignals: number;
  currentMatcherMatchesBeforeFilters: number;
  newUniqueMatchesAfterDeduplication: number;
  blockedBeforeProfileMatching: number;
  blockedDuringProfileMatching: number;
  nearMatchCount: number;
  topNearMatches: ProfileCoverageNearMatch[];
}

export interface ProfileCoverageSourceReport {
  status:
    | 'ENABLED'
    | 'SUCCESS'
    | 'PARTIAL_SUCCESS'
    | 'FAILED'
    | 'DISABLED'
    | 'CACHED'
    | 'DAILY_LIMIT_REACHED'
    | 'MONTHLY_LIMIT_REACHED';
  sourceRecordsFetched: number;
  acceptedRecords: number;
  invalidRecords: number;
  duplicates: number;
  excludedByFilters: number;
  profileMatches: number;
  existingMatches: number;
  newSaveableMatches: number;
  safeFailureCode: string | null;
  safeCompanyFailures: Array<{ companyId: string; code: string }>;
  reasonCounts: Record<DiscoveryDiagnosticReasonCode, number>;
  tavily?: TavilyFetchReport;
  web?: WebDiscoveryReport;
}

export interface ProfileCoverageAuditResult {
  mode: 'PROFILE_COVERAGE_AUDIT';
  finalStatus: 'COMPLETED' | 'NO_DISCOVERY_SOURCES_ENABLED';
  dryRun: true;
  persistenceEnabled: false;
  geminiCalls: 0;
  applicationsCreated: 0;
  submissionsCreated: 0;
  activeProfileIds: JobSearchProfileId[];
  combinedTotals: {
    sourceRecordsFetched: number;
    uniqueAccepted: number;
    excludedByFilters: number;
    untargeted: number;
    profileMatches: number;
    existingMatches: number;
    newSaveableMatches: number;
    duplicates: number;
    nearMatches: number;
  };
  sources: Partial<Record<PublicJobDiscoverySourceName, ProfileCoverageSourceReport>>;
  profiles: ProfileCoverageProfileReport[];
}

function sourceKey(sourceName: string): PublicJobDiscoverySourceName | null {
  const normalized = sourceName.toLocaleLowerCase();
  if (normalized.includes('arbeitnow')) return 'arbeitnow';
  if (normalized.includes('remotive')) return 'remotive';
  if (normalized.includes('lever')) return 'lever';
  if (normalized.includes('tavily')) return 'tavily';
  if (normalized.includes('gemini search')) return 'tavily';
  return null;
}

function emptyReasonCounts(): Record<DiscoveryDiagnosticReasonCode, number> {
  return Object.fromEntries(
    PROFILE_COVERAGE_REASON_CODES.map((reason) => [reason, 0]),
  ) as Record<DiscoveryDiagnosticReasonCode, number>;
}

function decisionFor(
  event: DiscoveryDiagnosticEvent,
  profileId: JobSearchProfileId,
): ProfileCoverageDecision | undefined {
  return event.profileDecisions.find(
    (decision) => decision.profileId === profileId,
  );
}

function signalWeight(signal: ProfileMatchEvidence): number {
  switch (signal.type) {
    case 'title_phrase':
    case 'title_role':
      return 100;
    case 'applicant_responsibility':
    case 'applicant_contextual_phrase':
      return 90;
    case 'contextual_phrase':
      return 20;
    case 'strong_technology':
    case 'platform':
      return 10;
    case 'tag':
    case 'skill':
      return 5;
    case 'source_category_alias':
      return 2;
  }
}

function eventRank(
  event: DiscoveryDiagnosticEvent,
  decision: ProfileCoverageDecision,
): number {
  return (
    (decision.matched ? 1_000 : 0) +
    decision.positiveSignals.reduce(
      (total, signal) => total + signalWeight(signal),
      0,
    ) +
    (event.passedLocalFilters ? 1 : 0)
  );
}

function blockerFor(
  event: DiscoveryDiagnosticEvent,
  decision: ProfileCoverageDecision,
): DiscoveryDiagnosticReasonCode {
  if (event.stage === 'LOCAL_FILTER') {
    return (
      event.reasonCodes.find((reason) => reason !== 'DUPLICATE') ??
      'OTHER_EXISTING_REASON'
    );
  }
  if (!decision.matched) {
    return decision.blocker ?? 'INSUFFICIENT_POSITIVE_EVIDENCE';
  }
  if (event.stage === 'PIPELINE' && event.reasonCodes.length > 0) {
    return event.reasonCodes[0] ?? 'OTHER_EXISTING_REASON';
  }
  return 'OTHER_EXISTING_REASON';
}

function timingFor(
  stage: DiscoveryDiagnosticStage,
): ProfileCoverageNearMatch['exclusionTiming'] {
  if (stage === 'LOCAL_FILTER') return 'BEFORE_PROFILE_MATCHING';
  if (stage === 'PROFILE_MATCHING') return 'DURING_PROFILE_MATCHING';
  return 'AFTER_PROFILE_MATCHING';
}

function buildProfileReport(
  profileId: JobSearchProfileId,
  events: readonly DiscoveryDiagnosticEvent[],
  newUniqueMatchesAfterDeduplication: number,
): ProfileCoverageProfileReport {
  const candidates = events.flatMap((event, stableOrder) => {
    const decision = decisionFor(event, profileId);
    return decision ? [{ event, decision, stableOrder }] : [];
  });
  const byIdentity = new Map<
    string,
    (typeof candidates)[number] & { sources: Set<string> }
  >();
  for (const candidate of candidates) {
    const key =
      candidate.event.normalizedId ??
      `${candidate.event.sourceName}:${candidate.event.sourceJobId}`;
    const existing = byIdentity.get(key);
    if (!existing) {
      byIdentity.set(key, {
        ...candidate,
        sources: new Set([candidate.event.sourceName]),
      });
      continue;
    }
    existing.sources.add(candidate.event.sourceName);
    if (
      eventRank(candidate.event, candidate.decision) >
      eventRank(existing.event, existing.decision)
    ) {
      const sources = existing.sources;
      byIdentity.set(key, { ...candidate, sources });
    }
  }

  const unique = [...byIdentity.values()];
  const nearMatches = unique
    .sort((left, right) => {
      const rankDifference =
        eventRank(right.event, right.decision) -
        eventRank(left.event, left.decision);
      return rankDifference || left.stableOrder - right.stableOrder;
    })
    .slice(0, 20)
    .map(({ event, decision, sources }): ProfileCoverageNearMatch => ({
      title: event.title,
      company: event.company,
      source: event.sourceName,
      additionalSources: [...sources]
        .filter((source) => source !== event.sourceName)
        .sort(),
      positiveSignals: decision.positiveSignals.map((signal) => ({ ...signal })),
      exactBlocker: blockerFor(event, decision),
      blockerStage: event.stage,
      exclusionTiming: timingFor(event.stage),
      currentMatcherWouldMatch: decision.matched,
    }));

  return {
    profileId,
    profileLabel: getJobSearchProfileDisplayName(profileId),
    candidatesEvaluated: unique.length,
    candidatesWithPositiveSignals: unique.filter(
      ({ decision }) => decision.positiveSignals.length > 0,
    ).length,
    currentMatcherMatchesBeforeFilters: unique.filter(
      ({ decision }) => decision.matched,
    ).length,
    newUniqueMatchesAfterDeduplication,
    blockedBeforeProfileMatching: unique.filter(
      ({ event }) => event.stage === 'LOCAL_FILTER',
    ).length,
    blockedDuringProfileMatching: unique.filter(
      ({ event, decision }) =>
        event.stage !== 'LOCAL_FILTER' && !decision.matched,
    ).length,
    nearMatchCount: unique.filter(
      ({ event, decision }) =>
        decision.positiveSignals.length > 0 &&
        (!decision.matched || event.stage === 'LOCAL_FILTER'),
    ).length,
    topNearMatches: nearMatches,
  };
}

export async function runProfileMatcherCoverageAudit(
  dependencies: PublicJobDiscoveryDryRunDependencies = {},
): Promise<ProfileCoverageAuditResult> {
  const events: DiscoveryDiagnosticEvent[] = [];
  const result = await runPublicJobDiscoveryDryRun(
    fixedPublicJobDiscoveryPayloadForSchedule('MORNING'),
    {
      ...dependencies,
      diagnosticCollector: {
        record(event) {
          events.push({
            ...event,
            reasonCodes: [...event.reasonCodes],
            profileDecisions: event.profileDecisions.map((decision) => ({
              ...decision,
              positiveSignals: decision.positiveSignals.map((signal) => ({
                ...signal,
              })),
            })),
          });
        },
      },
    },
  );

  const sources: ProfileCoverageAuditResult['sources'] = {};
  for (const [name, source] of Object.entries(result.sources)) {
    if (!source) continue;
    const key = name as PublicJobDiscoverySourceName;
    const reasonCounts = emptyReasonCounts();
    reasonCounts.INVALID_RECORD = source.invalidRecords;
    for (const event of events) {
      if (sourceKey(event.sourceName) !== key) continue;
      for (const reason of new Set(event.reasonCodes)) {
        reasonCounts[reason] += 1;
      }
    }
    const matchedSourceIdentities = new Set(
      events
        .filter(
          (event) =>
            sourceKey(event.sourceName) === key &&
            event.passedLocalFilters === true &&
            event.profileDecisions.some((decision) => decision.matched),
        )
        .map(
          (event) =>
            event.normalizedId ?? `${event.sourceName}:${event.sourceJobId}`,
        ),
    );
    sources[key] = {
      status: source.status,
      sourceRecordsFetched: source.sourceRecordsFetched,
      acceptedRecords: source.acceptedRecords,
      invalidRecords: source.invalidRecords,
      duplicates: source.duplicates,
      excludedByFilters: source.excludedByFilters,
      profileMatches: matchedSourceIdentities.size,
      existingMatches: source.profileMatchedDuplicates,
      newSaveableMatches: source.jobsThatWouldBePersisted,
      safeFailureCode: source.error?.code ?? null,
      safeCompanyFailures: (source.failedCompanies ?? []).map((failure) => ({
        companyId: failure.companyId,
        code: failure.errorCode,
      })),
      reasonCounts,
      ...(source.tavily ? { tavily: { ...source.tavily } } : {}),
      ...(source.web ? { web: source.web } : {}),
    };
  }

  const profiles = result.activeProfileIds.map((profileId) =>
    buildProfileReport(
      profileId,
      events,
      result.profileSummaries.find(
        (profile) => profile.profileId === profileId,
      )?.recordsMatched ?? 0,
    ),
  );
  const nearMatchIdentities = new Set<string>();
  const matchedIdentities = new Set<string>();
  const existingMatchedIdentities = new Set<string>();
  for (const event of events) {
    const decisions = event.profileDecisions;
    if (decisions.some((decision) => decision.positiveSignals.length > 0) &&
        (event.stage === 'LOCAL_FILTER' || !decisions.some((decision) => decision.matched))) {
      nearMatchIdentities.add(
        event.normalizedId ?? `${event.sourceName}:${event.sourceJobId}`,
      );
    }
    if (
      event.passedLocalFilters === true &&
      decisions.some((decision) => decision.matched)
    ) {
      const identity =
        event.normalizedId ?? `${event.sourceName}:${event.sourceJobId}`;
      matchedIdentities.add(identity);
      if (event.reasonCodes.includes('DUPLICATE')) {
        existingMatchedIdentities.add(identity);
      }
    }
  }

  return {
    mode: 'PROFILE_COVERAGE_AUDIT',
    finalStatus: result.finalStatus,
    dryRun: true,
    persistenceEnabled: false,
    geminiCalls: 0,
    applicationsCreated: 0,
    submissionsCreated: 0,
    activeProfileIds: [...result.activeProfileIds],
    combinedTotals: {
      sourceRecordsFetched: result.combinedTotals.sourceRecordsFetched,
      uniqueAccepted: result.combinedTotals.acceptedRecords,
      excludedByFilters: result.combinedTotals.excludedByFilters,
      untargeted: result.combinedTotals.untargeted,
      profileMatches: matchedIdentities.size,
      existingMatches: existingMatchedIdentities.size,
      newSaveableMatches: result.combinedTotals.jobsThatWouldBePersisted,
      duplicates: result.combinedTotals.duplicates,
      nearMatches: nearMatchIdentities.size,
    },
    sources,
    profiles,
  };
}
