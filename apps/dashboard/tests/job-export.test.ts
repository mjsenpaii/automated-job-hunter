import { describe, expect, it } from 'vitest';
import {
  formatJobDetailsAsText,
  getJobExportFilename,
  type JobDetailData,
} from '../src/lib/jobs/job-export';

const JOB: JobDetailData = {
  id: 'job-123',
  sourceName: 'Manual import',
  sourceJobId: 'source-123',
  sourceUrl: 'https://example.com/jobs/123',
  title: 'Backend Engineer',
  company: 'Example & Co.',
  description: 'Build secure authentication services.',
  status: 'HARD_REJECTED',
  location: 'Global',
  workSetup: 'REMOTE',
  eligibility: 'ELIGIBLE',
  employmentType: 'FULL_TIME',
  category: 'INTERNATIONAL',
  matchedProfileIds: ['software_development'],
  matchedProfileLabels: ['Software Development'],
  seniority: 'SENIOR',
  salary: null,
  salaryGrade: null,
  salaryStep: null,
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
  governmentScope: null,
  vacancies: null,
  datePosted: 'July 27, 2026',
  dateUpdated: null,
  dateExpires: 'Not provided',
  dateIngested: 'July 27, 2026',
  recordCreatedAt: 'July 27, 2026',
  recordUpdatedAt: 'July 27, 2026',
  workSetupConfidence: 0.95,
  yearsExperience: 4,
  requiredSkills: ['Go', 'OAuth'],
  preferredSkills: ['TypeScript'],
  responsibilities: ['Build authentication systems'],
  requirements: ['4+ years of production Go'],
  applicationInstructions: ['Include the keyword SECURE'],
  applicationKeyword: 'SECURE',
  applicationEmail: null,
  applicationAddressee: null,
  applicationUrl: 'https://example.com/jobs/123',
  civilServiceEligibility: null,
  scheduleNotes: [],
  rejectionReasons: ['SENIORITY_MISMATCH'],
  rejectionReasonRecorded: true,
  rawSource: '{"source":"fixture"}',
  score: null,
};

describe('job details text export', () => {
  it('exports every job-detail section and keeps null-score states readable', () => {
    const text = formatJobDetailsAsText(JOB);

    expect(text).toContain('Title: Backend Engineer');
    expect(text).toContain('Company: Example & Co.');
    expect(text).toContain('Job ID: job-123');
    expect(text).toContain('Source: Manual import');
    expect(text).toContain('Source URL: https://example.com/jobs/123');
    expect(text).toContain('Status: HARD REJECTED');
    expect(text).toContain('Category: INTERNATIONAL');
    expect(text).toContain('Work setup confidence: 95%');
    expect(text).toContain('Actual salary: Not provided');
    expect(text).toContain('Score: Not evaluated');
    expect(text).toContain('- SENIORITY_MISMATCH');
    expect(text).toContain('Build secure authentication services.');
    expect(text).toContain('- 4+ years of production Go');
    expect(text).toContain('- Go');
    expect(text).toContain('Keyword: SECURE');
    expect(text).toContain('https://example.com/jobs/123');
    expect(text).toContain('RAW SOURCE SNAPSHOT');
    expect(text).toContain('{"source":"fixture"}');
  });

  it('exports government reference metadata without presenting it as actual salary', () => {
    const text = formatJobDetailsAsText({
      ...JOB,
      employmentType: 'CONTRACT',
      salaryGrade: 6,
      salaryReferenceMin: 19_716,
      salaryReferenceMax: 20_761,
      salaryReferenceCurrency: 'PHP',
      salaryReferencePeriod: 'MONTHLY',
      salaryReferenceScheduleYear: 2026,
      salaryReferenceSource: 'DBM National Budget Circular No. 601, Annex A',
      salaryReferenceStepMin: 1,
      salaryReferenceStepMax: 8,
      salaryIsReferenceOnly: true,
      compensationNote:
        'DBM national-government salary-grade reference only. Actual Contract of Service compensation was not stated.',
      governmentScope: 'NATIONAL_GOVERNMENT',
      vacancies: 1,
      dateExpires: 'July 28, 2026',
      applicationEmail: 'marinduque@psa.gov.ph',
      applicationAddressee:
        'Gemma N. Opis, Chief Statistical Specialist',
      civilServiceEligibility:
        'Preferably Civil Service Sub-Professional/First Level Eligibility or equivalent',
      scheduleNotes: [
        'Willing to work on weekends, holidays, and beyond 5:00 PM when necessary',
      ],
    });

    expect(text).toContain('Actual salary: Not provided');
    expect(text).toContain('Salary grade: SG 6');
    expect(text).toContain('₱19,716–₱20,761 per month');
    expect(text).toContain('Reference schedule year: 2026');
    expect(text).toContain('DBM National Budget Circular No. 601, Annex A');
    expect(text).toContain(
      'Actual Contract of Service compensation was not stated.',
    );
    expect(text).toContain('Vacancies: 1');
    expect(text).toContain('Closing date: July 28, 2026');
    expect(text).toContain('Email: marinduque@psa.gov.ph');
    expect(text).toContain(
      'Addressee: Gemma N. Opis, Chief Statistical Specialist',
    );
    expect(text).toContain('Civil Service eligibility: Preferably Civil Service');
    expect(text).toContain('Willing to work on weekends');
  });

  it('includes complete persisted scoring details when available', () => {
    const text = formatJobDetailsAsText({
      ...JOB,
      status: 'SCORING_COMPLETED',
      rejectionReasons: [],
      rejectionReasonRecorded: false,
      score: {
        value: 84,
        recommendation: 'STRONG_MATCH',
        reason: 'Strong technical alignment.',
        factors: [{ label: 'Technical match', value: 22, max: 25 }],
        matchedSkills: ['Go'],
        missingSkills: ['Kubernetes'],
        riskFlags: ['Senior title'],
        scoredAt: 'July 27, 2026',
      },
    });

    expect(text).toContain('Score: 84/100');
    expect(text).toContain('Recommendation: STRONG MATCH');
    expect(text).toContain('Technical match: 22/25');
    expect(text).toContain('Matched skills:\n- Go');
    expect(text).toContain('Missing skills:\n- Kubernetes');
    expect(text).toContain('Risk flags:\n- Senior title');
    expect(text).toContain('Scored at: July 27, 2026');
  });

  it('creates a safe and recognizable text filename', () => {
    expect(getJobExportFilename(JOB)).toBe(
      'example-co-backend-engineer-details.txt',
    );
    expect(getJobExportFilename({ company: '***', title: '///' })).toBe(
      'job-details.txt',
    );
  });
});
