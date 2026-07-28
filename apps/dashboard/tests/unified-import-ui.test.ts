import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import {
  extractionToConfirmPayload,
  linesToList,
  updateExtractionField,
} from '../src/lib/import/extraction-state';
import { shouldSubmitComposer } from '../src/lib/import/composer';
import { getStatusPresentation } from '../src/components/StatusBadge';
import { getAnalysisMethodPresentation } from '../src/components/ExtractionReview';
import { resolveRecordedRejectionReasons } from '../src/lib/jobs/view-model';
import type {
  EnrichedGeminiJobExtraction,
  GeminiExtractionMetadata,
} from '@job-app/ingestion/gemini-contracts';

function source(relative: string): string {
  return readFileSync(path.resolve(__dirname, '..', relative), 'utf8');
}

function repositorySource(relative: string): string {
  return readFileSync(
    path.resolve(__dirname, '../../..', relative),
    'utf8',
  );
}

function allFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const full = path.join(directory, entry);
    return statSync(full).isDirectory() ? allFiles(full) : [full];
  });
}

const DRAFT: EnrichedGeminiJobExtraction = {
  title: 'Developer',
  company: 'Acme',
  sourceSite: null,
  sourceUrl: null,
  employmentType: null,
  salaryText: null,
  salaryMin: null,
  salaryMax: null,
  salaryCurrency: null,
  salaryGrade: null,
  salaryStep: null,
  hoursPerWeek: null,
  datePosted: null,
  dateUpdated: null,
  closingDate: null,
  location: 'Remote',
  country: 'Global',
  city: null,
  workSetup: 'REMOTE',
  timezoneOrSchedule: null,
  description: 'Build production software with TypeScript.',
  responsibilities: [],
  requirements: [],
  requiredYearsExperience: null,
  preferredYearsExperience: null,
  skills: ['TypeScript'],
  vacancies: null,
  civilServiceEligibility: null,
  scheduleNotes: [],
  governmentScope: null,
  applicationInstructions: [],
  applicationKeyword: null,
  applicationEmail: null,
  applicationAddressee: null,
  applicationUrl: null,
  confidence: 0.8,
  missingFields: [],
  evidence: [],
  salaryReferenceMin: null,
  salaryReferenceMax: null,
  salaryReferenceCurrency: null,
  salaryReferencePeriod: null,
  salaryReferenceScheduleYear: null,
  salaryReferenceSource: null,
  salaryReferenceStepMin: null,
  salaryReferenceStepMax: null,
  salaryIsReferenceOnly: false,
  compensationNote: null,
};

const METADATA: GeminiExtractionMetadata = {
  modelUsed: 'server-selected-model',
  fallbackUsed: false,
  fallbackReason: null,
  confidence: 0.8,
};

describe('unified importer UI behavior', () => {
  it('redirects the legacy /add-job deep link to /import-job', () => {
    const page = source('src/app/add-job/page.tsx');
    expect(page).toContain("redirect('/import-job')");
    const config = source('next.config.ts');
    expect(config).toContain("source: '/add-job'");
    expect(config).toContain("destination: '/import-job'");
  });

  it('keeps exactly one import navigation destination', () => {
    const sidebar = source('src/components/Sidebar.tsx');
    expect(sidebar).toContain("label: 'Import Job'");
    expect(sidebar).not.toContain("label: 'Add Job'");
    expect(sidebar).not.toContain("label: 'Import URL'");
  });

  it('supports a persistent, accessible collapsible desktop sidebar', () => {
    const shell = source('src/components/AppShell.tsx');
    const sidebar = source('src/components/Sidebar.tsx');
    const styles = source('src/app/globals.css');

    expect(shell).toContain("SIDEBAR_PREFERENCE_KEY = 'job-app-sidebar-collapsed'");
    expect(shell).toContain('window.localStorage');
    expect(shell).toContain('sidebar-is-collapsed');
    expect(sidebar).toContain("'Expand sidebar' : 'Collapse sidebar'");
    expect(sidebar).toContain('aria-expanded={!collapsed}');
    expect(styles).toContain('--sidebar-collapsed-width: 72px;');
    expect(styles).toContain('@media (min-width: 821px)');
    expect(styles).toContain('.sidebar-is-collapsed .main-content');
    expect(styles).toContain('.sidebar-toggle {\n  position: absolute;');
    expect(styles).toContain('right: -22px;');
    expect(styles).toContain('border-radius: 50%;');
  });

  it('keeps URL import routed through the existing safe URL extractor', () => {
    const prepare = source('src/lib/gemini/prepare-job-input.ts');
    expect(prepare).toContain('extractFromUrl(sourceUrl)');
    expect(prepare).toContain("inputKind === 'url'");
  });

  it('manual edits update only the requested extracted field', () => {
    const edited = updateExtractionField(DRAFT, 'company', 'Edited Company');
    expect(edited.company).toBe('Edited Company');
    expect(edited.title).toBe(DRAFT.title);
    expect(DRAFT.company).toBe('Acme');
    expect(linesToList('- Go\n- TypeScript')).toEqual(['Go', 'TypeScript']);
    const payload = extractionToConfirmPayload(edited, METADATA);
    expect(payload.company).toBe('Edited Company');
    expect(payload.extraction_metadata).toEqual(METADATA);
  });

  it('Enter submits while Shift+Enter preserves a new line', () => {
    expect(
      shouldSubmitComposer({
        key: 'Enter',
        shiftKey: false,
        isComposing: false,
        canSubmit: true,
      }),
    ).toBe(true);
    expect(
      shouldSubmitComposer({
        key: 'Enter',
        shiftKey: true,
        isComposing: false,
        canSubmit: true,
      }),
    ).toBe(false);
  });

  it('standardizes key status labels', () => {
    expect(getStatusPresentation('SCORING_COMPLETED').label).toBe('Scored');
    expect(getStatusPresentation('HARD_REJECTED').label).toBe('Hard rejected');
    expect(getStatusPresentation('DUPLICATE').label).toBe('Duplicate');
    expect(getStatusPresentation('NOT_EVALUATED').label).toBe('Not evaluated');
  });

  it('wires shared profile filters and badges into list and detail views', () => {
    const list = source('src/components/JobList.tsx');
    const detail = source('src/components/JobDetailWorkspace.tsx');
    expect(list).toContain('profileFilterOptions.map');
    expect(list).toContain('JobProfileBadges');
    expect(list).toContain('Untargeted');
    expect(detail).toContain('JobProfileBadges');
  });

  it('derives matched profile IDs at read time without mutation path', () => {
    const targeting = source('src/lib/jobs/profile-targeting.ts');
    expect(targeting).toContain('deriveMatchedProfileIds');
    expect(targeting).toContain('matchJobSearchProfiles');
    expect(targeting).not.toContain('.update(');
    expect(targeting).not.toContain('.insert(');
    expect(targeting).not.toContain('.delete(');
  });

  it('explains model routing without displaying provider diagnostics', () => {
    expect(getAnalysisMethodPresentation(METADATA).label).toBe(
      'Analysed with Flash Lite',
    );
    expect(
      getAnalysisMethodPresentation({
        fallbackUsed: true,
        fallbackReason: 'LOW_CONFIDENCE',
      }).label,
    ).toBe('Re-analysed with Flash for accuracy');

    const review = source('src/components/ExtractionReview.tsx');
    expect(review).not.toContain('modelUsed}');
    expect(review).not.toContain('fallbackReason}');
    expect(review.split(/\r?\n/).length).toBeLessThan(350);
  });

  it('renders actual persisted rejection reasons and never fabricates a replacement', () => {
    expect(
      resolveRecordedRejectionReasons(
        '["SENIORITY_MISMATCH"]',
        null,
      ),
    ).toEqual(['SENIORITY_MISMATCH']);
    expect(
      resolveRecordedRejectionReasons(null, {
        pipeline: { rejectionReasons: ['COUNTRY_INELIGIBLE'] },
      }),
    ).toEqual(['COUNTRY_INELIGIBLE']);
    expect(resolveRecordedRejectionReasons(null, null)).toEqual([]);

    const detail = source('src/components/JobDetailWorkspace.tsx');
    expect(detail).not.toContain(
      'Rejection reason was not recorded for this job.',
    );
    expect(detail).toContain('No replacement reason has been inferred.');
    const persistence = source('src/lib/jobs/process-import.ts');
    expect(persistence).toContain('persistIngestionResults(db');
    const sharedPersistence = repositorySource(
      'packages/ingestion/src/persistence.ts',
    );
    expect(sharedPersistence).toContain('rejection_reasons:');
    expect(sharedPersistence).toContain('JSON.stringify(rejectionReasons)');
    const detailPage = source('src/app/jobs/[id]/page.tsx');
    expect(detailPage).toContain('checkHardReject(normalized');
    expect(detailPage).toContain(
      '.set({ rejection_reasons: JSON.stringify(rejectionReasons) })',
    );
  });

  it('keeps complete job export actions visible and accessible', () => {
    const workspace = source('src/components/JobDetailWorkspace.tsx');
    const exportActions = source('src/components/JobExportActions.tsx');

    expect(workspace).toContain('<JobExportActions');
    expect(exportActions).toContain('Copy all details');
    expect(exportActions).toContain('Download .txt');
    expect(exportActions).toContain('aria-live=');
    expect(exportActions).toContain("role={state === 'error' ? 'alert' : 'status'}");
    expect(exportActions).toContain('const exportText = () => formatJobDetailsAsText(job)');
    expect(exportActions).toContain('navigator.clipboard.writeText(text)');
    expect(exportActions).toContain('new Blob([exportText()]');
  });

  it('renders government metadata with an explicit reference-only boundary', () => {
    const overview = source('src/components/ExtractionOverviewFields.tsx');
    const requirements = source('src/components/ExtractionReviewSections.tsx');
    const detail = source('src/components/JobDetailWorkspace.tsx');

    expect(overview).toContain('label="Salary grade"');
    expect(overview).toContain('label="Closing date"');
    expect(overview).toContain('label="Vacancies"');
    expect(overview).toContain('Reference only and non-guaranteed.');
    expect(requirements).toContain('label="Application email"');
    expect(requirements).toContain('label="Application addressee"');
    expect(requirements).toContain('label="Civil Service eligibility"');
    expect(requirements).toContain('label="Schedule notes"');
    expect(detail).toContain('<h2>Government salary reference</h2>');
    expect(detail).toContain('<dt>Compensation status</dt>');
    expect(detail).toContain('<dt>Application email</dt>');
  });

  it('uses explicit job identity labels without redundant header copy', () => {
    const workspace = source('src/components/JobDetailWorkspace.tsx');
    const exportActions = source('src/components/JobExportActions.tsx');

    expect(workspace).toContain(
      '<span className="job-identity-label">Position:</span>',
    );
    expect(workspace).toContain(
      '<span className="job-identity-label">Company:</span>',
    );
    expect(workspace).not.toContain('Back to overview');
    expect(workspace).not.toContain("from 'next/link'");
    expect(exportActions).not.toContain('Complete job details and source.');
  });

  it('keeps job details full width, compact, and free of scrolling tabs', () => {
    const workspace = source('src/components/JobDetailWorkspace.tsx');
    const styles = source('src/app/globals.css');

    expect(workspace).toContain('className="panel job-decision-bar"');
    expect(workspace.indexOf('job-decision-bar')).toBeLessThan(
      workspace.indexOf('className="panel detail-main"'),
    );
    expect(workspace).not.toContain('job-summary-panel');
    expect(workspace).not.toContain('job-detail-grid');
    expect(styles).toContain(
      'grid-template-columns: repeat(5, minmax(0, 1fr));',
    );
    expect(styles).toContain("grid-template-areas: 'state facts actions';");
    expect(styles).toContain(
      '.job-decision-bar .summary-actions .button {\n  width: 88px;',
    );
    expect(styles).not.toContain(
      '.job-decision-bar .summary-actions {\n    grid-column: 1 / -1;',
    );
    expect(styles).toContain('.detail-tabs {\n  display: grid;');
    expect(styles).toContain('overflow: visible;');
    expect(styles).not.toContain('min-height: 540px;');
    expect(styles).not.toContain('.job-summary-panel');
  });

  it('shows the planned resume action with an explicit unavailable state', () => {
    const workspace = source('src/components/JobDetailWorkspace.tsx');
    const exportActions = source('src/components/JobExportActions.tsx');

    expect(workspace).not.toContain('Generate resume');
    expect(exportActions).toContain('Generate resume');
    expect(exportActions).toContain('<span className="button-status">Soon</span>');
    expect(exportActions).toMatch(
      /className="button button-secondary"\s+disabled\s+title="Resume generation is not available yet\."/,
    );
    expect(exportActions.indexOf('Copy all details')).toBeLessThan(
      exportActions.indexOf('Download .txt'),
    );
    expect(exportActions.indexOf('Download .txt')).toBeLessThan(
      exportActions.indexOf('Generate resume'),
    );
  });

  it('does not reference server Gemini configuration from any client module', () => {
    const srcRoot = path.resolve(__dirname, '../src');
    const forbidden = [
      'GEMINI_API_KEY',
      'GEMINI_PRIMARY_MODEL',
      'GEMINI_FALLBACK_MODEL',
      'NEXT_PUBLIC_GEMINI',
      '@google/genai',
      'gemini-3.5-flash-lite',
      'gemini-3.6-flash',
    ];
    const clientFiles = allFiles(srcRoot).filter((file) => {
      if (!/\.(ts|tsx)$/.test(file)) return false;
      return readFileSync(file, 'utf8').startsWith("'use client'");
    });
    for (const file of clientFiles) {
      const contents = readFileSync(file, 'utf8');
      for (const marker of forbidden) {
        expect(contents).not.toContain(marker);
      }
    }
  });

  it('keeps deleted importer and dashboard components unreferenced', () => {
    const sourceFiles = allFiles(path.resolve(__dirname, '../src')).filter((file) =>
      /\.(ts|tsx)$/.test(file),
    );
    const deletedImports = [
      'ImportField',
      'ImportResultPanel',
      'import-styles',
      'FactorChart',
      'JobCard',
      'ScoreGauge',
      'StatsCard',
      'WorkSetupBadge',
    ];
    for (const file of sourceFiles) {
      const contents = readFileSync(file, 'utf8');
      for (const deleted of deletedImports) {
        expect(contents).not.toMatch(
          new RegExp(`from ['"][^'"]*${deleted}['"]`),
        );
      }
    }
  });
});
