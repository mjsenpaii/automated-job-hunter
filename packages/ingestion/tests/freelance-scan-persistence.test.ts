import type { SkillEntry } from '@job-app/core';
import { createDatabase, getDb } from '@job-app/db/connection';
import * as databaseSchema from '@job-app/db/schema';
import {
  activity_log,
  applications,
  freelance_opportunities,
  freelance_opportunity_events,
  freelance_persistence_runs,
  job_discovery_persistence_runs,
} from '@job-app/db/schema';
import { readFileSync } from 'node:fs';
import { count } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { describe, expect, it, vi } from 'vitest';
import { createSqliteWebDiscoveryStore } from '../src/discovery/web-discovery-store.js';
import {
  buildFreelanceOpportunity,
  diagnoseFreelanceOpportunityReadiness,
  normalizeFreelancePay,
} from '../src/freelance/classification.js';
import { resolveFreelanceDiscoveryConfiguration } from '../src/freelance/configuration.js';
import {
  FREELANCE_SCAN_TASK_ID,
  FreelancePreviewOpportunitySummarySchema,
  FreelancePreviewSaveRequestSchema,
  type FreelanceOpportunityCandidate,
} from '../src/freelance/contracts.js';
import { createFreelanceRepository } from '../src/freelance/repository.js';
import {
  prepareManualFreelanceImport,
  preparePreviewOpportunityForReview,
  buildFreelancePreviewOpportunitySummaries,
  runFreelanceOpportunityScan,
} from '../src/freelance/scan.js';
import { HimalayasFreelanceAdapter } from '../src/freelance/adapters/himalayas.js';

const NOW = new Date('2026-08-01T02:00:00.000Z');

function skill(name: string): SkillEntry {
  return {
    name,
    category: 'other',
    proficiency: 'intermediate',
    verification_status: 'VERIFIED',
    source: 'USER_CONFIRMED',
    source_reference: 'freelance-scan-fixture',
    evidence_level: 'personal_project',
    allowed_in_resume: true,
  };
}

function candidate(index: number): FreelanceOpportunityCandidate {
  const url = `https://client.example/projects/wordpress-update-${index}`;
  return {
    source: 'MANUAL', sourceIdentifier: `candidate-${index}`, canonicalUrl: url,
    title: `WordPress landing page update ${index}`,
    clientOrCompany: 'Example Client',
    publicDescription: 'Update one small WordPress landing page using supplied copy and a clear design reference. Configure the form, verify responsive behavior, document every change, and provide a practice preview before delivery.',
    publishedAt: NOW.toISOString(), expiresAt: null, clientCountry: 'United States',
    applicantGeographicRestrictions: ['Worldwide'], timezoneRestrictions: [], remote: true,
    contractType: 'PROJECT',
    pay: normalizeFreelancePay({ kind: 'HOURLY', currency: 'USD', minimum: 8, maximum: 12, period: 'HOUR' }),
    requiredSkills: ['WordPress'], preferredSkills: [], minimumExperienceYears: null,
    seniority: [], categoryHints: ['Technical Quick Wins'],
    sourceAttributions: [{ source: 'MANUAL', sourceIdentifier: `candidate-${index}`, sourceUrl: url, costClassification: 'MANUAL_PUBLIC_URL' }],
  };
}

function opportunity(index: number) {
  return buildFreelanceOpportunity({ candidate: candidate(index), verifiedSkills: [skill('HTML')], now: NOW });
}

describe('freelance configuration and preview safety', () => {
  it('requires exact enablement for the feature and every source', () => {
    for (const value of [undefined, '', 'TRUE', 'True', ' true', 'true ', '1', 'yes']) {
      const config = resolveFreelanceDiscoveryConfiguration({
        JOB_DISCOVERY_FREELANCE_ENABLED: value,
        JOB_DISCOVERY_TAVILY_EXTRACT_ENABLED: value,
        FREELANCE_SOURCE_HIMALAYAS_ENABLED: value,
        FREELANCE_SOURCE_REMOTIVE_ENABLED: value,
        FREELANCE_SOURCE_TAVILY_ENABLED: value,
        FREELANCE_SOURCE_GEMINI_SEARCH_ENABLED: value,
      });
      expect(config.enabled).toBe(false);
      expect(config.tavilyExtractEnabled).toBe(false);
      expect(Object.values(config.sources).every((enabled) => !enabled)).toBe(true);
    }
    expect(resolveFreelanceDiscoveryConfiguration({
      JOB_DISCOVERY_FREELANCE_ENABLED: 'true',
      JOB_DISCOVERY_TAVILY_EXTRACT_ENABLED: 'true',
      FREELANCE_SOURCE_HIMALAYAS_ENABLED: 'true',
    })).toMatchObject({
      enabled: true,
      tavilyExtractEnabled: true,
      sources: { himalayas: true, remotive: false, tavily: false, geminiSearch: false },
    });
  });

  it('stops before sources when all are disabled', async () => {
    const database = getDb(':memory:');
    const fetchImpl = vi.fn();
    const result = await runFreelanceOpportunityScan(
      { mode: 'PREVIEW', cacheStrategy: 'FRESH', idempotencyKey: 'all-disabled' },
      {
        environmentType: 'DEVELOPMENT', taskId: FREELANCE_SCAN_TASK_ID, runId: 'run_fixture',
        configuration: resolveFreelanceDiscoveryConfiguration({ JOB_DISCOVERY_FREELANCE_ENABLED: 'true' }),
        repository: createFreelanceRepository(database), verifiedSkills: [skill('HTML')],
        webStore: createSqliteWebDiscoveryStore(':memory:'),
        webCaps: { tavilyDaily: 30, tavilyMonthly: 900, geminiSearchDaily: 60 },
        tavilyApiKey: '', geminiApiKey: '', geminiSearchModel: null, fetchImpl: fetchImpl as typeof fetch,
        now: () => NOW,
      },
    );
    expect(result.status).toBe('NO_SOURCES_ENABLED');
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.geminiVerificationCalls).toBe(0);
    expect(result.applicationsCreated).toBe(0);
  });

  it('Preview classifies mocked listings but writes no opportunity or application', async () => {
    const database = getDb(':memory:');
    const fetchImpl = vi.fn(async () => Response.json({
      limit: 20,
      jobs: [{
        title: 'WordPress landing page update', excerpt: null,
        companyName: 'Public Client', companySlug: 'public-client', employmentType: 'Contractor',
        minSalary: 8, maxSalary: 12, salaryPeriod: 'hourly', currency: 'USD',
        seniority: [], locationRestrictions: [{ name: 'Worldwide' }], timezoneRestrictions: [],
        categories: ['Technology'], parentCategories: [],
        description: '<p>Requirements</p><p>WordPress is required.</p><p>Update one small landing page, configure a form, verify the responsive layout, document changes, and provide a practice preview before delivery.</p>',
        pubDate: NOW.toISOString(), expiryDate: null,
        applicationLink: 'https://himalayas.app/companies/public-client/jobs/wordpress-project',
        guid: 'preview-fixture',
      }, {
        title: 'Head of Marketing and Communications', excerpt: null,
        companyName: 'Public Client', companySlug: 'public-client', employmentType: 'Contractor',
        minSalary: null, maxSalary: null, salaryPeriod: null, currency: null,
        seniority: ['Executive'], locationRestrictions: [{ name: 'Worldwide' }], timezoneRestrictions: [],
        categories: ['Marketing'], parentCategories: [],
        description: '<p>Requirements</p><p>This contractor role requires 8 years of professional experience.</p><p>Lead communications planning, update the campaign calendar, and coordinate delivery across the organization.</p>',
        pubDate: NOW.toISOString(), expiryDate: null,
        applicationLink: 'https://himalayas.app/companies/public-client/jobs/head-marketing-contract',
        guid: 'preview-not-ready-fixture',
      }, {
        title: 'WordPress landing page update', excerpt: null,
        companyName: 'Public Client', companySlug: 'public-client', employmentType: 'Contractor',
        minSalary: 8, maxSalary: 12, salaryPeriod: 'hourly', currency: 'USD',
        seniority: [], locationRestrictions: [{ name: 'Worldwide' }], timezoneRestrictions: [],
        categories: ['Technology'], parentCategories: [],
        description: '<p>Requirements</p><p>WordPress is required.</p><p>Update one small landing page, configure a form, verify the responsive layout, document changes, and provide a practice preview before delivery.</p>',
        pubDate: NOW.toISOString(), expiryDate: null,
        applicationLink: 'https://himalayas.app/companies/public-client/jobs/wordpress-project',
        guid: 'preview-duplicate-fixture',
      }],
    }));
    const result = await runFreelanceOpportunityScan(
      { mode: 'PREVIEW', cacheStrategy: 'FRESH', idempotencyKey: 'preview-safe' },
      {
        environmentType: 'DEVELOPMENT', taskId: FREELANCE_SCAN_TASK_ID, runId: 'run_preview',
        configuration: resolveFreelanceDiscoveryConfiguration({
          JOB_DISCOVERY_FREELANCE_ENABLED: 'true', FREELANCE_SOURCE_HIMALAYAS_ENABLED: 'true',
        }),
        repository: createFreelanceRepository(database), verifiedSkills: [skill('HTML')],
        webStore: createSqliteWebDiscoveryStore(':memory:'),
        webCaps: { tavilyDaily: 30, tavilyMonthly: 900, geminiSearchDaily: 60 },
        tavilyApiKey: '', geminiApiKey: '', geminiSearchModel: null,
        himalayasAdapter: new HimalayasFreelanceAdapter({ fetchImpl: fetchImpl as typeof fetch }),
        now: () => NOW,
      },
    );
    expect(result.unique).toBe(2);
    expect(result.sourceCandidatesBeforeDedup).toBe(3);
    expect(result.candidatesMergedByDedup).toBe(1);
    expect(result.learnableFast).toBe(1);
    expect(result.notReady).toBe(1);
    expect(result.requiresReview).toBe(1);
    expect(result.readinessBlockers).toEqual([{
      code: 'MANDATORY_EXPERIENCE_REQUIREMENT',
      count: 1,
    }]);
    expect(result.readinessDiagnostics).toHaveLength(2);
    expect(result.previewOpportunityTotal).toBe(2);
    expect(result.previewOpportunities).toHaveLength(2);
    expect(result.previewOpportunities[0]).toMatchObject({
      temporaryResultId: expect.stringMatching(/^freelance_/),
      source: 'HIMALAYAS',
      sourceDomain: 'himalayas.app',
      originalUrl: 'https://himalayas.app/companies/public-client/jobs/wordpress-project',
      resultState: 'LEARNABLE_FAST_WITH_AI',
      taskScope: { status: 'SUFFICIENT' },
    });
    expect(JSON.stringify(result.previewOpportunities)).not.toContain('Update one small landing page');
    expect(JSON.stringify(result.previewOpportunities)).not.toMatch(/publicDescription|rawResponse|snippet|prompt/i);
    expect(result.readinessDiagnostics.find((item) => item.readiness === 'NOT_READY')).toMatchObject({
      title: 'Head of Marketing and Communications',
      primaryBlocker: 'MANDATORY_EXPERIENCE_REQUIREMENT',
      mandatoryExperienceYears: 8,
    });
    expect(result.savedThisRun).toBe(0);
    expect(result.geminiVerificationCalls).toBe(0);
    expect(database.select({ value: count() }).from(freelance_opportunities).get()?.value).toBe(0);
    expect(database.select({ value: count() }).from(applications).get()?.value).toBe(0);
    expect(database.select({ value: count() }).from(freelance_persistence_runs).get()?.value).toBe(0);
  });

  it('bounds browser-safe Preview summaries to the top 20 and requires explicit save confirmation', () => {
    const summaries = buildFreelancePreviewOpportunitySummaries(
      Array.from({ length: 25 }, (_, index) => opportunity(index)),
      [skill('HTML')],
      NOW,
    );
    expect(summaries.total).toBe(25);
    expect(summaries.items).toHaveLength(20);
    expect(summaries.items.every((item) =>
      FreelancePreviewOpportunitySummarySchema.safeParse(item).success)).toBe(true);
    expect(FreelancePreviewSaveRequestSchema.safeParse({
      runId: 'run_fixture', temporaryResultId: summaries.items[0]!.temporaryResultId,
      confirmed: false, blockerConfirmed: false,
    }).success).toBe(false);
    expect(FreelancePreviewSaveRequestSchema.safeParse({
      runId: 'run_fixture', temporaryResultId: summaries.items[0]!.temporaryResultId,
      confirmed: true, blockerConfirmed: false,
    }).success).toBe(true);
    expect(FreelancePreviewOpportunitySummarySchema.safeParse({
      ...summaries.items[0],
      originalUrl: 'http://127.0.0.1/private',
    }).success).toBe(false);
  });

  it('preserves trusted Preview source attribution without accepting raw browser evidence', () => {
    const imported = opportunity(80);
    const summary = buildFreelancePreviewOpportunitySummaries([{
      ...imported,
      source: 'TAVILY',
      sourceAttributions: [{
        source: 'TAVILY', sourceIdentifier: 'source-fixture',
        sourceUrl: imported.canonicalUrl, costClassification: 'API_CREDITS',
      }],
    }], [skill('HTML')], NOW).items[0]!;
    const prepared = preparePreviewOpportunityForReview(imported, summary);
    expect(prepared.source).toBe('TAVILY');
    expect(prepared.sourceAttributions).toEqual([{
      source: 'TAVILY',
      sourceIdentifier: `preview:${summary.temporaryResultId}`,
      sourceUrl: summary.originalUrl,
      costClassification: 'API_CREDITS',
    }]);
    expect(prepared.publicDescription).toBe(imported.publicDescription);
  });
});

describe('freelance atomic persistence and local preparation', () => {
  it('rolls the whole selected batch and activity/ledger writes back on a database failure', async () => {
    const sqlite = createDatabase(':memory:');
    sqlite.exec(`
      CREATE TRIGGER reject_freelance_fixture
      BEFORE INSERT ON freelance_opportunities
      WHEN NEW.title = 'Fail atomic fixture'
      BEGIN
        SELECT RAISE(ABORT, 'fixture failure');
      END;
    `);
    const database = drizzle(sqlite, { schema: databaseSchema });
    const repository = createFreelanceRepository(database);
    const failing = buildFreelanceOpportunity({
      candidate: { ...candidate(99), title: 'Fail atomic fixture' },
      verifiedSkills: [skill('HTML')], now: NOW,
    });
    await expect(repository.persistBatch({
      opportunities: [opportunity(98), failing],
      philippineDate: '2026-08-01', idempotencyKey: 'atomic-failure-fixture',
      taskId: FREELANCE_SCAN_TASK_ID, dailyLimit: 20,
    })).rejects.toThrow();
    expect(database.select({ value: count() }).from(freelance_opportunities).get()?.value).toBe(0);
    expect(database.select({ value: count() }).from(freelance_persistence_runs).get()?.value).toBe(0);
    expect(database.select({ value: count() }).from(activity_log).get()?.value).toBe(0);
    sqlite.close();
  });

  it('caps automatic freelance saves at 20 independently from the regular five-job ledger', async () => {
    const database = getDb(':memory:');
    const repository = createFreelanceRepository(database);
    const saved = await repository.persistBatch({
      opportunities: Array.from({ length: 25 }, (_, index) => opportunity(index)),
      philippineDate: '2026-08-01', idempotencyKey: 'freelance-cap-fixture',
      taskId: FREELANCE_SCAN_TASK_ID, dailyLimit: 20,
    });
    expect(saved.savedThisRun).toBe(20);
    expect(saved.remaining).toBe(0);
    expect(database.select({ value: count() }).from(freelance_opportunities).get()?.value).toBe(20);
    expect(database.select({ value: count() }).from(job_discovery_persistence_runs).get()?.value).toBe(0);
    expect(database.select({ value: count() }).from(applications).get()?.value).toBe(0);

    const next = await repository.persistBatch({
      opportunities: [opportunity(30)], philippineDate: '2026-08-01',
      idempotencyKey: 'freelance-over-cap', taskId: FREELANCE_SCAN_TASK_ID, dailyLimit: 20,
    });
    expect(next.savedThisRun).toBe(0);
    expect(database.select({ value: count() }).from(freelance_opportunities).get()?.value).toBe(20);
  });

  it('deduplicates opportunities and treats Mark Preparation Complete as a local-only action', async () => {
    const database = getDb(':memory:');
    const repository = createFreelanceRepository(database);
    const semanticDuplicate = buildFreelanceOpportunity({
      candidate: {
        ...candidate(1),
        source: 'TAVILY',
        sourceIdentifier: 'same-project-different-source',
        canonicalUrl: 'https://another-source.example/opportunities/same-project',
        sourceAttributions: [{
          source: 'TAVILY', sourceIdentifier: 'same-project-different-source',
          sourceUrl: 'https://another-source.example/opportunities/same-project',
          costClassification: 'API_CREDITS',
        }],
      },
      verifiedSkills: [skill('HTML')], now: NOW,
    });
    const first = await repository.persistBatch({
      opportunities: [opportunity(1), opportunity(1), semanticDuplicate],
      philippineDate: '2026-08-01', idempotencyKey: 'dedupe-fixture',
      taskId: FREELANCE_SCAN_TASK_ID, dailyLimit: 20,
    });
    expect(first.savedThisRun).toBe(1);
    expect(first.duplicates).toBe(2);
    expect(first.savedOpportunities[0]?.sourceAttributions).toHaveLength(2);
    const prepared = await repository.completePreparation(first.savedOpportunities[0]!.id, {
      action: 'MARK_PREPARATION_COMPLETE', learningCompleted: true,
      sampleCreated: true, sampleLinkOrNote: 'Local sample note', remainingConcerns: 'Confirm final scope',
      readinessConfirmedManually: true,
    }, NOW);
    expect(prepared?.preparation).toMatchObject({ state: 'COMPLETED', readinessConfirmedManually: true });
    expect(prepared?.readiness.applicationReady).toBe(true);
    expect(database.select({ value: count() }).from(freelance_opportunity_events).get()?.value).toBe(1);
    expect(database.select({ value: count() }).from(applications).get()?.value).toBe(0);
    expect(database.select({ value: count() }).from(activity_log).get()?.value).toBe(1);
  });

  it('never persists a manual-scope-review opportunity', async () => {
    const database = getDb(':memory:');
    const repository = createFreelanceRepository(database);
    const reviewOnly = buildFreelanceOpportunity({
      candidate: {
        ...candidate(71),
        publicDescription: 'A remote freelance project is available worldwide. Pay and the complete task deliverables will be discussed after a manual scope review.',
        requiredSkills: [],
      },
      verifiedSkills: [skill('HTML')],
      now: NOW,
    });
    expect(diagnoseFreelanceOpportunityReadiness(reviewOnly, [skill('HTML')]).resultState)
      .toBe('REVIEW_SCOPE_MANUALLY');
    const result = await repository.persistBatch({
      opportunities: [reviewOnly], philippineDate: '2026-08-01',
      idempotencyKey: 'manual-review-not-saved', taskId: FREELANCE_SCAN_TASK_ID,
      dailyLimit: 20,
    });
    expect(result.savedThisRun).toBe(0);
    expect(database.select({ value: count() }).from(freelance_opportunities).get()?.value).toBe(0);
    expect(database.select({ value: count() }).from(applications).get()?.value).toBe(0);
  });

  it('saves an explicitly confirmed review item locally while keeping automatic persistence unchanged', async () => {
    const database = getDb(':memory:');
    const repository = createFreelanceRepository(database);
    const notReady = buildFreelanceOpportunity({
      candidate: {
        ...candidate(72),
        title: 'Senior WordPress platform owner',
        minimumExperienceYears: 8,
        seniority: ['Senior'],
      },
      verifiedSkills: [skill('HTML')],
      now: NOW,
    });
    expect(notReady.readiness.classification).toBe('NOT_READY');
    const automatic = await repository.persistBatch({
      opportunities: [notReady], philippineDate: '2026-08-01',
      idempotencyKey: 'automatic-not-ready', taskId: FREELANCE_SCAN_TASK_ID,
      dailyLimit: 20,
    });
    expect(automatic.savedThisRun).toBe(0);

    const explicit = await repository.saveForReview({
      opportunity: notReady, philippineDate: '2026-08-01',
      idempotencyKey: 'explicit-not-ready-review', taskId: 'dashboard-preview-review',
      dailyLimit: 20,
    });
    expect(explicit.savedThisRun).toBe(1);
    expect(explicit.remaining).toBe(19);
    expect(database.select({ value: count() }).from(freelance_opportunities).get()?.value).toBe(1);
    expect(database.select({ value: count() }).from(applications).get()?.value).toBe(0);
    const activity = database.select().from(activity_log).all();
    expect(activity.at(-1)?.action).toBe('FREELANCE_PREVIEW_SAVED_FOR_REVIEW');
    expect(activity.at(-1)?.details).toContain('"applicationsCreated":0');
    expect(activity.at(-1)?.details).toContain('"proposalsSent":0');
  });

  it('deduplicates explicit review saves, respects the daily cap, and refuses hard rejection', async () => {
    const database = getDb(':memory:');
    const repository = createFreelanceRepository(database);
    const first = await repository.saveForReview({
      opportunity: opportunity(73), philippineDate: '2026-08-01',
      idempotencyKey: 'explicit-first', taskId: 'dashboard-preview-review', dailyLimit: 1,
    });
    expect(first.savedThisRun).toBe(1);
    const atCap = await repository.saveForReview({
      opportunity: opportunity(74), philippineDate: '2026-08-01',
      idempotencyKey: 'explicit-cap', taskId: 'dashboard-preview-review', dailyLimit: 1,
    });
    expect(atCap.savedThisRun).toBe(0);

    const secondDatabase = getDb(':memory:');
    const secondRepository = createFreelanceRepository(secondDatabase);
    await secondRepository.saveForReview({
      opportunity: opportunity(75), philippineDate: '2026-08-01',
      idempotencyKey: 'explicit-dedupe-first', taskId: 'dashboard-preview-review', dailyLimit: 20,
    });
    const duplicate = await secondRepository.saveForReview({
      opportunity: opportunity(75), philippineDate: '2026-08-01',
      idempotencyKey: 'explicit-dedupe-second', taskId: 'dashboard-preview-review', dailyLimit: 20,
    });
    expect(duplicate).toMatchObject({ savedThisRun: 0, duplicates: 1 });

    const hardRejected = {
      ...opportunity(76),
      risk: { level: 'HARD_REJECTED' as const, reasons: ['PAY_TO_WORK' as const], displayMessage: 'Potential risk indicators detected.' as const },
      ethicsComplianceStatus: 'HARD_REJECTED' as const,
      status: 'HARD_REJECTED' as const,
    };
    const blocked = await secondRepository.saveForReview({
      opportunity: hardRejected, philippineDate: '2026-08-01',
      idempotencyKey: 'explicit-hard-rejected', taskId: 'dashboard-preview-review', dailyLimit: 20,
    });
    expect(blocked.savedThisRun).toBe(0);
    expect(secondDatabase.select({ value: count() }).from(freelance_opportunities).get()?.value).toBe(1);
    expect(secondDatabase.select({ value: count() }).from(applications).get()?.value).toBe(0);
  });

  it('routes manual URLs through existing SSRF checks and defines no marketplace scraper', async () => {
    await expect(prepareManualFreelanceImport('http://127.0.0.1/private-project', {
      verifiedSkills: [skill('HTML')],
    })).rejects.toThrow('MANUAL_FREELANCE_PAGE_UNPARSEABLE');
    const source = [
      '../src/freelance/scan.ts',
      '../src/freelance/web-discovery.ts',
      '../src/freelance/runtime.ts',
    ].map((path) => readFileSync(new URL(path, import.meta.url), 'utf8')).join('\n');
    expect(source).not.toMatch(/api\.upwork|upwork\.com\/api|freelancer\.com\/api|graphql.*upwork/i);
    expect(source).not.toMatch(/puppeteer|playwright|captcha|browser cookies/i);
  });

  it('keeps the freelance task manual, single-attempt, and on the shared queue', () => {
    const taskSource = readFileSync(new URL('../../../src/trigger/freelance-opportunity-dashboard-scan.ts', import.meta.url), 'utf8');
    expect(taskSource).toContain('publicJobDiscoveryQueue');
    expect(taskSource).toContain('maxAttempts: 1');
    expect(taskSource).not.toMatch(/schedules\.task|cron:/);
  });
});
