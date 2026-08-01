import {
  activity_log,
  freelance_opportunities,
  freelance_opportunity_events,
  freelance_opportunity_sources,
  freelance_persistence_runs,
  freelance_scan_runs,
  freelance_source_cache,
} from '@job-app/db/schema';
import { and, desc, eq, or, sql } from 'drizzle-orm';
import type { JobDatabase } from '../persistence.js';
import {
  FreelanceOpportunitySchema,
  FreelancePreparationSchema,
  FreelancePreparationUpdateSchema,
  FreelanceReadinessAssessmentSchema,
  FreelanceRiskAssessmentSchema,
  FreelanceSourceAttributionSchema,
  FreelanceStatusUpdateSchema,
  type FreelanceOpportunity,
  type FreelanceOpportunityStatus,
  type FreelancePreparation,
  type FreelanceScanPayload,
  type FreelanceSource,
} from './contracts.js';
import type { FreelanceWebQueryGroupId } from './web-discovery.js';

const jsonArray = <T>(value: string): T[] => {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
};

function parseJson<T>(value: string, parser: { parse(input: unknown): T }): T {
  return parser.parse(JSON.parse(value));
}

type OpportunityRow = typeof freelance_opportunities.$inferSelect;

export function storedFreelanceOpportunity(
  row: OpportunityRow,
  attributions: Array<typeof freelance_opportunity_sources.$inferSelect>,
): FreelanceOpportunity {
  return FreelanceOpportunitySchema.parse({
    id: row.id,
    identityKey: row.identity_key,
    semanticIdentityKey: row.semantic_identity_key,
    descriptionHash: row.description_hash,
    source: row.source,
    sourceIdentifier: row.source_identifier,
    canonicalUrl: row.canonical_url,
    title: row.title,
    clientOrCompany: row.client_or_company,
    publicDescription: row.public_description,
    publishedAt: row.published_at,
    expiresAt: row.expires_at,
    clientCountry: row.client_country,
    applicantGeographicRestrictions: jsonArray<string>(row.geographic_restrictions),
    timezoneRestrictions: jsonArray<string>(row.timezone_restrictions),
    remote: row.remote,
    contractType: row.contract_type,
    pay: {
      kind: row.pay_kind,
      originalCurrency: row.original_currency,
      minimum: row.budget_min,
      maximum: row.budget_max,
      period: row.pay_period,
      statedHourlyMinimum: row.stated_hourly_min,
      statedHourlyMaximum: row.stated_hourly_max,
      estimatedEffectiveHourlyRate: row.estimated_effective_hourly_rate,
      classification: row.pay_classification,
      evidenceLabel: row.pay_evidence_label,
    },
    requiredSkills: jsonArray<string>(row.required_skills),
    preferredSkills: jsonArray<string>(row.preferred_skills),
    minimumExperienceYears: row.minimum_experience_years,
    seniority: jsonArray<string>(row.seniority),
    categoryHints: jsonArray<string>(row.category_hints),
    sourceAttributions: attributions.map((item) =>
      FreelanceSourceAttributionSchema.parse({
        source: item.source,
        sourceIdentifier: item.source_identifier,
        sourceUrl: item.source_url,
        costClassification: item.cost_classification,
      })),
    views: jsonArray<string>(row.views),
    opportunityCategories: jsonArray<string>(row.opportunity_categories),
    readiness: parseJson(row.readiness_json, FreelanceReadinessAssessmentSchema),
    risk: FreelanceRiskAssessmentSchema.parse({
      level: row.scam_risk,
      reasons: jsonArray<string>(row.scam_risk_reasons),
      displayMessage: jsonArray<string>(row.scam_risk_reasons).length > 0
        ? 'Potential risk indicators detected.'
        : null,
    }),
    ethicsComplianceStatus: row.ethics_compliance_status,
    rankingScore: row.ranking_score,
    status: row.status,
    manualNote: row.manual_note,
    preparation: parseJson(row.preparation_json, FreelancePreparationSchema),
  });
}

export interface FreelanceDailyState {
  philippineDate: string;
  dailyLimit: number;
  savedToday: number;
  remaining: number;
  idempotencyStatus: 'NOT_STARTED' | 'ALREADY_COMPLETED';
}

export interface FreelancePersistenceResult
  extends Omit<FreelanceDailyState, 'idempotencyStatus'> {
  idempotencyStatus: 'NEW' | 'ALREADY_COMPLETED' | 'NOT_STARTED';
  savedThisRun: number;
  duplicates: number;
  selected: number;
  savedAfterRun: number;
  savedOpportunities: FreelanceOpportunity[];
}

export interface FreelanceRepository {
  list(): Promise<FreelanceOpportunity[]>;
  findById(id: string): Promise<FreelanceOpportunity | null>;
  getDailyState(philippineDate: string, idempotencyKey: string, dailyLimit: number): Promise<FreelanceDailyState>;
  persistBatch(options: {
    opportunities: readonly FreelanceOpportunity[];
    philippineDate: string;
    idempotencyKey: string;
    taskId: string;
    dailyLimit: number;
  }): Promise<FreelancePersistenceResult>;
  saveForReview(options: {
    opportunity: FreelanceOpportunity;
    philippineDate: string;
    idempotencyKey: string;
    taskId: string;
    dailyLimit: number;
  }): Promise<FreelancePersistenceResult>;
  updateStatus(id: string, input: unknown): Promise<FreelanceOpportunity | null>;
  completePreparation(id: string, input: unknown, now: Date): Promise<FreelanceOpportunity | null>;
  getCandidateCache(source: 'HIMALAYAS' | 'REMOTIVE', cacheKey: string, now: Date): Promise<unknown[] | null>;
  putCandidateCache(source: 'HIMALAYAS' | 'REMOTIVE', cacheKey: string, candidates: readonly unknown[], now: Date, ttlMs: number): Promise<void>;
  mostRecentQueryGroup(): Promise<FreelanceWebQueryGroupId | null>;
  isScanCompleted(idempotencyKey: string): Promise<boolean>;
  recordScan(options: {
    payload: FreelanceScanPayload;
    runId: string;
    philippineDate: string;
    queryGroupId: FreelanceWebQueryGroupId | null;
    state: 'COMPLETED' | 'FAILED';
    savedCount: number;
    startedAt: Date;
    completedAt: Date;
  }): Promise<void>;
}

function dailyState(
  database: Pick<JobDatabase, 'select'>,
  philippineDate: string,
  idempotencyKey: string,
  dailyLimit: number,
): FreelanceDailyState {
  const completed = database.select({ key: freelance_persistence_runs.idempotency_key })
    .from(freelance_persistence_runs)
    .where(eq(freelance_persistence_runs.idempotency_key, idempotencyKey))
    .get();
  const aggregate = database.select({
    count: sql<number>`COALESCE(SUM(${freelance_persistence_runs.persisted_count}), 0)`,
  }).from(freelance_persistence_runs)
    .where(eq(freelance_persistence_runs.philippine_date, philippineDate))
    .get();
  const savedToday = Number(aggregate?.count ?? 0);
  return {
    philippineDate,
    dailyLimit,
    savedToday,
    remaining: Math.max(0, dailyLimit - savedToday),
    idempotencyStatus: completed ? 'ALREADY_COMPLETED' : 'NOT_STARTED',
  };
}

function insertOpportunity(
  database: Pick<JobDatabase, 'insert'>,
  opportunity: FreelanceOpportunity,
): void {
  database.insert(freelance_opportunities).values({
    id: opportunity.id,
    identity_key: opportunity.identityKey,
    semantic_identity_key: opportunity.semanticIdentityKey,
    source: opportunity.source,
    source_identifier: opportunity.sourceIdentifier,
    canonical_url: opportunity.canonicalUrl,
    title: opportunity.title,
    client_or_company: opportunity.clientOrCompany,
    description_hash: opportunity.descriptionHash,
    public_description: opportunity.publicDescription,
    published_at: opportunity.publishedAt,
    expires_at: opportunity.expiresAt,
    client_country: opportunity.clientCountry,
    geographic_restrictions: JSON.stringify(opportunity.applicantGeographicRestrictions),
    timezone_restrictions: JSON.stringify(opportunity.timezoneRestrictions),
    remote: opportunity.remote,
    contract_type: opportunity.contractType,
    pay_kind: opportunity.pay.kind,
    original_currency: opportunity.pay.originalCurrency,
    budget_min: opportunity.pay.minimum,
    budget_max: opportunity.pay.maximum,
    pay_period: opportunity.pay.period,
    stated_hourly_min: opportunity.pay.statedHourlyMinimum,
    stated_hourly_max: opportunity.pay.statedHourlyMaximum,
    estimated_effective_hourly_rate: opportunity.pay.estimatedEffectiveHourlyRate,
    pay_classification: opportunity.pay.classification,
    pay_evidence_label: opportunity.pay.evidenceLabel,
    required_skills: JSON.stringify(opportunity.requiredSkills),
    preferred_skills: JSON.stringify(opportunity.preferredSkills),
    minimum_experience_years: opportunity.minimumExperienceYears,
    seniority: JSON.stringify(opportunity.seniority),
    category_hints: JSON.stringify(opportunity.categoryHints),
    views: JSON.stringify(opportunity.views),
    opportunity_categories: JSON.stringify(opportunity.opportunityCategories),
    readiness: opportunity.readiness.classification,
    readiness_json: JSON.stringify(opportunity.readiness),
    scam_risk: opportunity.risk.level,
    scam_risk_reasons: JSON.stringify(opportunity.risk.reasons),
    ethics_compliance_status: opportunity.ethicsComplianceStatus,
    ranking_score: opportunity.rankingScore,
    status: opportunity.status,
    preparation_state: opportunity.preparation.state,
    preparation_json: JSON.stringify(opportunity.preparation),
  }).run();
  for (const attribution of opportunity.sourceAttributions) {
    database.insert(freelance_opportunity_sources).values({
      opportunity_id: opportunity.id,
      source: attribution.source,
      source_identifier: attribution.sourceIdentifier,
      source_url: attribution.sourceUrl,
      cost_classification: attribution.costClassification,
    }).onConflictDoNothing().run();
  }
}

function loadOne(database: JobDatabase, id: string): FreelanceOpportunity | null {
  const row = database.select().from(freelance_opportunities)
    .where(eq(freelance_opportunities.id, id)).get();
  if (!row) return null;
  const sources = database.select().from(freelance_opportunity_sources)
    .where(eq(freelance_opportunity_sources.opportunity_id, id)).all();
  return storedFreelanceOpportunity(row, sources);
}

type PersistenceOptions = {
  opportunities: readonly FreelanceOpportunity[];
  philippineDate: string;
  idempotencyKey: string;
  taskId: string;
  dailyLimit: number;
};

function validatePersistenceOptions(options: PersistenceOptions): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(options.philippineDate)) {
    throw new Error('Freelance persistence date must use YYYY-MM-DD.');
  }
  if (!Number.isInteger(options.dailyLimit) || options.dailyLimit < 1 || options.dailyLimit > 20) {
    throw new Error('Freelance daily persistence limit must be between 1 and 20.');
  }
}

function persistOpportunities(
  database: JobDatabase,
  options: PersistenceOptions,
  policy: 'AUTOMATIC' | 'EXPLICIT_REVIEW',
): FreelancePersistenceResult {
  validatePersistenceOptions(options);
  return database.transaction((transaction): FreelancePersistenceResult => {
    const before = dailyState(transaction, options.philippineDate, options.idempotencyKey, options.dailyLimit);
    if (before.idempotencyStatus === 'ALREADY_COMPLETED') {
      return { ...before, idempotencyStatus: 'ALREADY_COMPLETED', savedThisRun: 0, duplicates: 0, selected: 0, savedAfterRun: before.savedToday, savedOpportunities: [] };
    }
    if (before.remaining === 0) {
      return { ...before, idempotencyStatus: 'NOT_STARTED', savedThisRun: 0, duplicates: 0, selected: 0, savedAfterRun: before.savedToday, savedOpportunities: [] };
    }
    const ordered = [...options.opportunities]
      .filter((item) => policy === 'EXPLICIT_REVIEW' || ['LOW', 'MEDIUM'].includes(item.risk.level))
      .filter((item) => item.risk.level !== 'HARD_REJECTED')
      .filter((item) => !['HARD_REJECTED', 'EXPIRED'].includes(item.status))
      .filter((item) => policy === 'EXPLICIT_REVIEW' || ['READY_NOW', 'LEARNABLE_FAST_WITH_AI'].includes(
        item.readiness.classification,
      ))
      .sort((left, right) => right.rankingScore - left.rankingScore || left.identityKey.localeCompare(right.identityKey));
    const existingRows = transaction.select({
      key: freelance_opportunities.identity_key,
      semanticKey: freelance_opportunities.semantic_identity_key,
    }).from(freelance_opportunities).all();
    const existing = new Set(existingRows.map((row) => row.key));
    const existingSemantic = new Set(existingRows.map((row) => row.semanticKey));
    const unique: FreelanceOpportunity[] = [];
    const batchedByIdentity = new Map<string, number>();
    const batchedBySemantic = new Map<string, number>();
    let duplicates = 0;
    for (const opportunity of ordered) {
      const batchedIndex = batchedByIdentity.get(opportunity.identityKey) ??
        batchedBySemantic.get(opportunity.semanticIdentityKey);
      if (batchedIndex !== undefined) {
        duplicates += 1;
        const batched = unique[batchedIndex]!;
        const attributions = [...batched.sourceAttributions];
        for (const attribution of opportunity.sourceAttributions) {
          if (!attributions.some((item) =>
            item.source === attribution.source &&
            item.sourceIdentifier === attribution.sourceIdentifier)) {
            attributions.push(attribution);
          }
        }
        unique[batchedIndex] = { ...batched, sourceAttributions: attributions };
        continue;
      }
      if (existing.has(opportunity.identityKey) || existingSemantic.has(opportunity.semanticIdentityKey)) {
        duplicates += 1;
        const persisted = transaction.select({ id: freelance_opportunities.id })
          .from(freelance_opportunities)
          .where(or(
            eq(freelance_opportunities.identity_key, opportunity.identityKey),
            eq(freelance_opportunities.semantic_identity_key, opportunity.semanticIdentityKey),
          )).get();
        if (persisted) {
          for (const attribution of opportunity.sourceAttributions) {
            transaction.insert(freelance_opportunity_sources).values({
              opportunity_id: persisted.id,
              source: attribution.source,
              source_identifier: attribution.sourceIdentifier,
              source_url: attribution.sourceUrl,
              cost_classification: attribution.costClassification,
            }).onConflictDoNothing().run();
          }
        }
        continue;
      }
      existing.add(opportunity.identityKey);
      existingSemantic.add(opportunity.semanticIdentityKey);
      batchedByIdentity.set(opportunity.identityKey, unique.length);
      batchedBySemantic.set(opportunity.semanticIdentityKey, unique.length);
      unique.push(opportunity);
    }
    const selected = unique.slice(0, before.remaining);
    transaction.insert(freelance_persistence_runs).values({
      idempotency_key: options.idempotencyKey,
      philippine_date: options.philippineDate,
      task_id: options.taskId,
      persisted_count: selected.length,
    }).run();
    selected.forEach((opportunity) => insertOpportunity(transaction, opportunity));
    transaction.insert(activity_log).values({
      action: policy === 'EXPLICIT_REVIEW'
        ? 'FREELANCE_PREVIEW_SAVED_FOR_REVIEW'
        : 'FREELANCE_DISCOVERY_COMPLETED',
      entity_type: 'system',
      entity_id: options.idempotencyKey,
      details: JSON.stringify(policy === 'EXPLICIT_REVIEW'
        ? {
            version: 1,
            philippineDate: options.philippineDate,
            saved: selected.length,
            duplicateCount: duplicates,
            opportunityIds: selected.map((item) => item.id),
            localOnly: true,
            proposalsSent: 0,
            bidsPlaced: 0,
            messagesSent: 0,
            applicationsCreated: 0,
            submissionsCreated: 0,
          }
        : {
            version: 1,
            philippineDate: options.philippineDate,
            saved: selected.length,
            duplicateCount: duplicates,
            opportunityIds: selected.map((item) => item.id),
            applicationsCreated: 0,
            submissionsCreated: 0,
          }),
    }).run();
    return {
      philippineDate: options.philippineDate,
      dailyLimit: options.dailyLimit,
      savedToday: before.savedToday,
      remaining: Math.max(0, before.remaining - selected.length),
      idempotencyStatus: 'NEW',
      savedThisRun: selected.length,
      duplicates,
      selected: selected.length,
      savedAfterRun: before.savedToday + selected.length,
      savedOpportunities: selected,
    };
  });
}

export function createFreelanceRepository(database: JobDatabase): FreelanceRepository {
  return {
    async list() {
      const rows = database.select().from(freelance_opportunities)
        .orderBy(desc(freelance_opportunities.ranking_score), desc(freelance_opportunities.created_at)).all();
      const sources = database.select().from(freelance_opportunity_sources).all();
      const byOpportunity = new Map<string, typeof sources>();
      for (const source of sources) {
        byOpportunity.set(source.opportunity_id, [
          ...(byOpportunity.get(source.opportunity_id) ?? []),
          source,
        ]);
      }
      return rows.map((row) => storedFreelanceOpportunity(row, byOpportunity.get(row.id) ?? []));
    },
    async findById(id) {
      return loadOne(database, id);
    },
    async getDailyState(philippineDate, idempotencyKey, dailyLimit) {
      return dailyState(database, philippineDate, idempotencyKey, dailyLimit);
    },
    async persistBatch(options) {
      return persistOpportunities(database, options, 'AUTOMATIC');
    },
    async saveForReview(options) {
      return persistOpportunities(database, {
        ...options,
        opportunities: [options.opportunity],
      }, 'EXPLICIT_REVIEW');
    },
    async updateStatus(id, input) {
      const parsed = FreelanceStatusUpdateSchema.parse(input);
      const next: FreelanceOpportunityStatus = parsed.action === 'SHORTLIST'
        ? 'SHORTLISTED'
        : parsed.action === 'DISMISS'
          ? 'DISMISSED'
          : 'APPLIED_MANUALLY';
      database.transaction((transaction) => {
        transaction.update(freelance_opportunities).set({
          status: next,
          manual_note: parsed.note ?? null,
          updated_at: new Date().toISOString(),
        }).where(eq(freelance_opportunities.id, id)).run();
        transaction.insert(freelance_opportunity_events).values({
          opportunity_id: id,
          action: parsed.action,
          safe_details: JSON.stringify({ localOnly: true, notePresent: Boolean(parsed.note) }),
        }).run();
      });
      return loadOne(database, id);
    },
    async completePreparation(id, input, now) {
      const parsed = FreelancePreparationUpdateSchema.parse(input);
      const current = loadOne(database, id);
      if (!current || current.readiness.classification !== 'LEARNABLE_FAST_WITH_AI') return null;
      const preparation: FreelancePreparation = {
        state: 'COMPLETED',
        learningCompleted: true,
        sampleCreated: parsed.sampleCreated,
        sampleLinkOrNote: parsed.sampleLinkOrNote,
        remainingConcerns: parsed.remainingConcerns,
        readinessConfirmedManually: true,
        completedAt: now.toISOString(),
      };
      const readiness = { ...current.readiness, applicationReady: true };
      database.transaction((transaction) => {
        transaction.update(freelance_opportunities).set({
          preparation_state: 'COMPLETED',
          preparation_json: JSON.stringify(preparation),
          readiness_json: JSON.stringify(readiness),
          updated_at: now.toISOString(),
        }).where(eq(freelance_opportunities.id, id)).run();
        transaction.insert(freelance_opportunity_events).values({
          opportunity_id: id,
          action: 'MARK_PREPARATION_COMPLETE',
          safe_details: JSON.stringify({
            localOnly: true,
            learningCompleted: true,
            sampleCreated: parsed.sampleCreated,
            concernsRecorded: Boolean(parsed.remainingConcerns),
          }),
        }).run();
      });
      return loadOne(database, id);
    },
    async getCandidateCache(source, cacheKey, now) {
      const row = database.select().from(freelance_source_cache).where(and(
        eq(freelance_source_cache.source, source),
        eq(freelance_source_cache.cache_key, cacheKey),
      )).get();
      if (!row || Date.parse(row.expires_at) <= now.getTime()) return null;
      try {
        const parsed: unknown = JSON.parse(row.normalized_json);
        return Array.isArray(parsed) ? parsed : null;
      } catch {
        return null;
      }
    },
    async putCandidateCache(source, cacheKey, candidates, now, ttlMs) {
      database.insert(freelance_source_cache).values({
        source,
        cache_key: cacheKey,
        normalized_json: JSON.stringify(candidates),
        fetched_at: now.toISOString(),
        expires_at: new Date(now.getTime() + ttlMs).toISOString(),
      }).onConflictDoUpdate({
        target: [freelance_source_cache.source, freelance_source_cache.cache_key],
        set: {
          normalized_json: JSON.stringify(candidates),
          fetched_at: now.toISOString(),
          expires_at: new Date(now.getTime() + ttlMs).toISOString(),
        },
      }).run();
    },
    async mostRecentQueryGroup() {
      const row = database.select({ queryGroup: freelance_scan_runs.query_group_id })
        .from(freelance_scan_runs)
        .where(eq(freelance_scan_runs.state, 'COMPLETED'))
        .orderBy(desc(freelance_scan_runs.completed_at)).get();
      return row?.queryGroup && ['TECHNICAL_QUICK_WINS', 'AI_AUTOMATION', 'BEGINNER_REMOTE_WORK', 'PHILIPPINES_APAC'].includes(row.queryGroup)
        ? row.queryGroup as FreelanceWebQueryGroupId
        : null;
    },
    async isScanCompleted(idempotencyKey) {
      return Boolean(database.select({ key: freelance_scan_runs.idempotency_key })
        .from(freelance_scan_runs)
        .where(and(
          eq(freelance_scan_runs.idempotency_key, idempotencyKey),
          eq(freelance_scan_runs.state, 'COMPLETED'),
        )).get());
    },
    async recordScan(options) {
      database.insert(freelance_scan_runs).values({
        idempotency_key: options.payload.idempotencyKey,
        trigger_run_id: options.runId,
        philippine_date: options.philippineDate,
        mode: options.payload.mode,
        cache_strategy: options.payload.cacheStrategy,
        query_group_id: options.queryGroupId,
        state: options.state,
        saved_count: options.savedCount,
        started_at: options.startedAt.toISOString(),
        completed_at: options.completedAt.toISOString(),
      }).onConflictDoNothing().run();
    },
  };
}
