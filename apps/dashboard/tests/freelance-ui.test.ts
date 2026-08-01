import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  FreelanceScanResultSchema,
  type FreelanceOpportunity,
} from '@job-app/ingestion/freelance/contracts';
import { FreelanceScanControl } from '../src/components/FreelanceScanControl';
import { FreelancePreviewResults } from '../src/components/FreelancePreviewResults';
import { FreelanceWorkspace } from '../src/components/FreelanceWorkspace';

const opportunity: Omit<FreelanceOpportunity, 'publicDescription'> = {
  id: 'freelance_aaaaaaaaaaaaaaaaaaaaaaaa',
  identityKey: 'a'.repeat(64),
  semanticIdentityKey: 'c'.repeat(64),
  descriptionHash: 'b'.repeat(64),
  source: 'MANUAL',
  sourceIdentifier: 'fixture',
  canonicalUrl: 'https://client.example/projects/wordpress',
  title: 'WordPress landing page update',
  clientOrCompany: 'Example Client',
  publishedAt: '2026-08-01T00:00:00.000Z',
  expiresAt: null,
  clientCountry: 'United States',
  applicantGeographicRestrictions: ['Worldwide'],
  timezoneRestrictions: [],
  remote: true,
  contractType: 'PROJECT',
  pay: {
    kind: 'HOURLY', originalCurrency: 'USD', minimum: 8, maximum: 12,
    period: 'HOUR', statedHourlyMinimum: 8, statedHourlyMaximum: 12,
    estimatedEffectiveHourlyRate: null, classification: 'ABOVE_MINIMUM',
    evidenceLabel: 'USD 8-12 per hour',
  },
  requiredSkills: ['WordPress'],
  preferredSkills: [],
  minimumExperienceYears: null,
  seniority: [],
  categoryHints: ['Technical Quick Wins'],
  sourceAttributions: [{
    source: 'MANUAL', sourceIdentifier: 'fixture',
    sourceUrl: 'https://client.example/projects/wordpress',
    costClassification: 'MANUAL_PUBLIC_URL',
  }],
  views: ['PHILIPPINES', 'INTERNATIONAL_CLIENTS', 'WORLDWIDE_REMOTE'],
  opportunityCategories: ['TECHNICAL_QUICK_WINS'],
  readiness: {
    classification: 'LEARNABLE_FAST_WITH_AI', transferableSkills: ['HTML'],
    missingSkills: ['WordPress'], learningHoursMinimum: 8, learningHoursMaximum: 16,
    learningTimeUncertain: false,
    narrowGapReasons: ['ADJACENT_VERIFIED_SKILLS', 'BOUNDED_LOW_RISK_SCOPE'],
    practiceBeforeApplying: ['Build and edit a local WordPress landing page.'],
    suggestedSampleProject: 'A responsive WordPress landing page with one form.',
    deliveryRisks: ['Do not claim unverified platform experience.'],
    confidence: 'MEDIUM', recommendedAction: 'BUILD_SAMPLE_FIRST', applicationReady: false,
  },
  risk: { level: 'LOW', reasons: [], displayMessage: null },
  ethicsComplianceStatus: 'PASS',
  rankingScore: 730,
  status: 'NEW',
  manualNote: null,
  preparation: {
    state: 'NOT_STARTED', learningCompleted: false, sampleCreated: false,
    sampleLinkOrNote: null, remainingConcerns: null,
    readinessConfirmedManually: false, completedAt: null,
  },
};

const disabledSource = (source: 'HIMALAYAS' | 'REMOTIVE' | 'TAVILY' | 'GEMINI_SEARCH') => ({
  source, status: 'DISABLED' as const,
  costClassification: source === 'HIMALAYAS' ? 'FREE_NO_API_KEY' as const
    : source === 'REMOTIVE' ? 'FREE_PUBLIC_API_NO_KEY' as const
      : source === 'TAVILY' ? 'API_CREDITS' as const : 'API_QUOTA' as const,
  requestsAttempted: 0, requestsCompleted: 0, cacheHits: 0, listingsFetched: 0,
  accepted: 0, originalPagesFetched: 0, validOpportunityPages: 0,
  nonOpportunityPages: 0, duplicateOrRepostPages: 0, pagesRecoveredByExtract: 0,
  pagesWithSufficientTaskScope: 0, pagesWithInsufficientTaskScope: 0,
  queriesUsed: [], queryYields: [], attributionPreserved: true,
  searchCreditsConsumed: 0, extractCreditsConsumed: 0,
  dailyCreditsUsed: 0, dailyCreditsRemaining: 0,
  monthlyCreditsUsed: 0, monthlyCreditsRemaining: 0,
  dailyPromptsUsed: 0, dailyPromptsRemaining: 0,
  inputTokens: null, outputTokens: null, totalTokens: null,
  providerResponseReached: null, quotaReservationReleased: null, failures: [],
});

const previewResult = FreelanceScanResultSchema.parse({
  runId: 'run_previewfixture', mode: 'PREVIEW', environment: 'DEVELOPMENT',
  philippineDate: '2026-08-02', status: 'COMPLETED',
  sourceSummaries: ['HIMALAYAS', 'REMOTIVE', 'TAVILY', 'GEMINI_SEARCH'].map((source) =>
    disabledSource(source as 'HIMALAYAS' | 'REMOTIVE' | 'TAVILY' | 'GEMINI_SEARCH')),
  fetched: 1, unique: 1, validIndividualOpportunities: 1,
  aboveMinimum: 0, unknownPay: 1, readyNow: 0, learnableFast: 0,
  notReady: 1, requiresReview: 1, reviewScopeManually: 0, hardRejected: 0,
  previewOpportunityTotal: 1,
  previewOpportunities: [{
    temporaryResultId: 'freelance_aaaaaaaaaaaaaaaaaaaaaaaa',
    title: 'Small WordPress content update', clientOrCompany: null,
    source: 'TAVILY', sourceDomain: 'jobs.example',
    originalUrl: 'https://jobs.example/project/1', publishedAt: null,
    contractType: 'PROJECT', remote: true, geographicEligibility: 'REQUIRES_REVIEW',
    views: ['PHILIPPINES'], originalPayText: null, payClassification: 'UNKNOWN',
    readiness: 'NOT_READY', resultState: 'NOT_READY',
    primaryBlocker: 'INSUFFICIENT_TASK_SCOPE_EVIDENCE',
    matchedCategories: ['TECHNICAL_QUICK_WINS'], transferableSkills: ['HTML'],
    missingSkills: ['WordPress'], taskScope: {
      status: 'INSUFFICIENT', evidenceCount: 0, requiredSkillEvidenceCount: 0,
    }, learning: null, scamRisk: 'LOW', riskIndicators: [],
    aggregatorOrRepost: false, recommendedAction: 'REVIEW_SCOPE_WITH_CLIENT', expired: false,
  }],
  selected: 0, savedThisRun: 0, savedBeforeRun: 0, savedAfterRun: 0,
  dailyRemaining: 20, geminiSearchPrompts: 0, geminiVerificationCalls: 0,
  applicationsCreated: 0, submissionsCreated: 0, proposalsSent: 0,
  bidsPlaced: 0, messagesSent: 0, idempotencyStatus: 'NOT_STARTED', elapsedMs: 1,
});

describe('Freelance Jobs dashboard', () => {
  it('renders manual scan modes and explicitly rules out automatic proposals and applications', () => {
    const html = renderToStaticMarkup(createElement(FreelanceScanControl));
    expect(html).toContain('Scan Freelance Jobs');
    expect(html).toContain('Preview');
    expect(html).toContain('Scan &amp; Save');
    expect(html).toContain('Import Freelance URL');
    expect(html).toContain('No proposal, bid, message, or application is sent.');
    expect(html).not.toMatch(/Auto Apply|Auto Bid|Auto Message|Auto Accept/i);
  });

  it('keeps all readiness outcomes visible and avoids false quota exhaustion for disabled sources', () => {
    const source = readFileSync(new URL('../src/components/FreelanceScanControl.tsx', import.meta.url), 'utf8');
    expect(source).toContain('label="Ready now"');
    expect(source).toContain('label="Learnable fast with AI"');
    expect(source).toContain('label="Review scope manually"');
    expect(source).toContain('label="Not ready"');
    expect(source).toContain('label="Requires review"');
    expect(source).toContain('label="Hard rejected"');
    expect(source).toContain('Primary readiness blockers');
    expect(source).toContain('Disabled — usage not queried');
    expect(source).toContain("source.status === 'DISABLED'");
    expect(source).toContain('label="Source candidates before global dedup"');
    expect(source).toContain('label="Candidates merged by global dedup"');
    expect(source).toContain('label="Final valid individual opportunities"');
    expect(source).toContain('label="Non-opportunity source pages rejected"');
    expect(source).toContain('source opportunity pages before global dedup');
    expect(source).toContain('does not have to equal the page-scope count');
    expect(source).toContain('Search queries and useful-opportunity yield');
  });

  it('shows all overlapping views, strict pay context, and the user-facing readiness label', () => {
    const html = renderToStaticMarkup(createElement(FreelanceWorkspace, { opportunities: [opportunity] }));
    expect(html).toContain('Philippines');
    expect(html).toContain('International Clients');
    expect(html).toContain('Worldwide Remote');
    expect(html).toContain('LEARNABLE FAST WITH AI');
    expect(html).toContain('8–16 focused learning hours');
    expect(html).toContain('Prioritize confirmed over $3/hour');
    expect(html).toContain('Saved opportunities');
    expect(html).toContain('local saved records, not results from the latest temporary Preview');
  });

  it('renders temporary Preview opportunities with readiness, blockers, safe links, and bounded detail disclosure', () => {
    const html = renderToStaticMarkup(createElement(FreelancePreviewResults, {
      result: previewResult,
      onClose: () => undefined,
      onSaved: () => undefined,
    }));
    expect(html).toContain('Preview opportunities are temporary and have not been saved.');
    expect(html).toContain('Small WordPress content update');
    expect(html).toContain('NOT READY');
    expect(html).toContain('Unsupported task scope');
    expect(html).toContain('Save for Review');
    expect(html).toContain('Open original listing');
    expect(html).toContain('href="https://jobs.example/project/1"');
    expect(html).toContain('<summary>Review details</summary>');
    expect(html).toContain('<summary>Source diagnostics</summary>');
    expect(html).not.toContain('NON_OPPORTUNITY_PAGE');
  });

  it('keeps saving explicit, requires extra NOT READY acknowledgement, and filters without provider calls', () => {
    const source = readFileSync(new URL('../src/components/FreelancePreviewResults.tsx', import.meta.url), 'utf8');
    expect(source).toContain('onClick={() => setConfirming(true)}');
    expect(source).toContain('I understand this opportunity is NOT READY');
    expect(source).toContain('needsBlockerConfirmation && !blockerConfirmed');
    expect(source).toContain("fetch('/api/freelance-opportunities/save-preview'");
    expect(source.match(/fetch\(/g)).toHaveLength(1);
    expect(source).toContain('onClick={() => setFilter(value)}');
    expect(source).not.toMatch(/HimalayasFreelanceAdapter|RemotiveAdapter|TAVILY_API_KEY|GEMINI_API_KEY/);
    const route = readFileSync(new URL('../src/app/api/freelance-opportunities/save-preview/route.ts', import.meta.url), 'utf8');
    expect(route).toContain('isFreelanceSameOriginPost');
    expect(route).toContain('prepareManualFreelanceImport');
    expect(route).toContain('saveForReview');
    expect(route).toContain('applicationsCreated: 0');
    expect(route).toContain('submissionsCreated: 0');
    expect(route).toContain('proposalsSent: 0');
    expect(route).not.toMatch(/submitProposal|placeBid|sendMessage|createApplication|tasks\.trigger/);
  });

  it('preserves keyboard disclosures, focus visibility, and reduced-motion behavior', () => {
    const component = readFileSync(new URL('../src/components/FreelancePreviewResults.tsx', import.meta.url), 'utf8');
    const css = readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8');
    expect(component).toContain('<details className="freelance-preview-disclosure">');
    expect(component).toContain('aria-pressed={filter === value}');
    expect(component).toContain('aria-live="polite"');
    expect(css).toContain(':focus-visible');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it('keeps preparation completion and manual status actions local-only', () => {
    const source = readFileSync(new URL('../src/components/FreelanceOpportunityActions.tsx', import.meta.url), 'utf8');
    expect(source).toContain('Mark Preparation Complete');
    expect(source).toContain('readinessConfirmedManually: true');
    expect(source).toContain('This does not contact the client.');
    expect(source).toContain('Mark applied manually');
    expect(source).not.toMatch(/tasks\.trigger|submitProposal|placeBid|sendMessage|createApplication/);
  });

  it('does not expose provider credentials or worker configuration through client components', () => {
    const sources = [
      'FreelanceScanControl.tsx', 'FreelancePreviewResults.tsx', 'FreelanceWorkspace.tsx', 'FreelanceOpportunityActions.tsx',
    ].map((file) => readFileSync(new URL(`../src/components/${file}`, import.meta.url), 'utf8')).join('\n');
    expect(sources).not.toMatch(/GEMINI_API_KEY|TAVILY_API_KEY|FREELANCE_SOURCE_|JOB_DISCOVERY_FREELANCE_ENABLED|TRIGGER_SECRET_KEY|NEXT_PUBLIC_/);
  });
});
