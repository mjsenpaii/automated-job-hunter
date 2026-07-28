export interface JobDetailData {
  id: string;
  sourceName: string;
  sourceJobId: string;
  sourceUrl: string | null;
  title: string;
  company: string;
  description: string;
  status: string;
  location: string;
  workSetup: string;
  eligibility: string | null;
  employmentType: string;
  category: string | null;
  matchedProfileIds: string[];
  matchedProfileLabels: string[];
  seniority: string;
  salary: string | null;
  salaryGrade: number | null;
  salaryStep: number | null;
  salaryReferenceMin: number | null;
  salaryReferenceMax: number | null;
  salaryReferenceCurrency: 'PHP' | null;
  salaryReferencePeriod: 'MONTHLY' | null;
  salaryReferenceScheduleYear: number | null;
  salaryReferenceSource: string | null;
  salaryReferenceStepMin: number | null;
  salaryReferenceStepMax: number | null;
  salaryIsReferenceOnly: boolean;
  compensationNote: string | null;
  governmentScope: string | null;
  vacancies: number | null;
  datePosted: string;
  dateUpdated: string | null;
  dateExpires: string;
  dateIngested: string;
  recordCreatedAt: string;
  recordUpdatedAt: string;
  workSetupConfidence: number;
  yearsExperience: number | null;
  requiredSkills: string[];
  preferredSkills: string[];
  responsibilities: string[];
  requirements: string[];
  applicationInstructions: string[];
  applicationKeyword: string | null;
  applicationEmail: string | null;
  applicationAddressee: string | null;
  applicationUrl: string | null;
  civilServiceEligibility: string | null;
  scheduleNotes: string[];
  rejectionReasons: string[];
  rejectionReasonRecorded: boolean;
  rawSource: string;
  score: {
    value: number;
    recommendation: string;
    reason: string;
    factors: Array<{ label: string; value: number; max: number }>;
    matchedSkills: string[];
    missingSkills: string[];
    riskFlags: string[];
    scoredAt: string;
  } | null;
}

function readableValue(value: string | null | undefined, empty: string): string {
  if (!value?.trim()) return empty;
  return value.replace(/_/g, ' ').trim();
}

function list(items: string[], empty = 'None recorded'): string {
  if (items.length === 0) return `- ${empty}`;
  return items.map((item) => `- ${item}`).join('\n');
}

function section(title: string, content: string): string {
  return `${title}\n${'-'.repeat(title.length)}\n${content}`;
}

function formatReferenceAmount(
  amount: number | null,
  currency: 'PHP' | null,
): string {
  if (amount === null || currency === null) return 'Not provided';
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Produces a complete, portable text snapshot from the already-sanitized job
 * detail view model. This does not fetch data or mutate the saved job.
 */
export function formatJobDetailsAsText(job: JobDetailData): string {
  const score = job.score;
  const summary = [
    `Title: ${job.title}`,
    `Company: ${job.company}`,
    `Job ID: ${job.id}`,
    `Source: ${readableValue(job.sourceName, 'Not recorded')}`,
    `Source job ID: ${readableValue(job.sourceJobId, 'Not recorded')}`,
    `Source URL: ${job.sourceUrl || 'Not provided'}`,
    `Status: ${readableValue(job.status, 'Not recorded')}`,
    `Category: ${readableValue(job.category, 'Not classified')}`,
    `Targeting profiles: ${
      job.matchedProfileLabels.length > 0
        ? job.matchedProfileLabels.join(', ')
        : 'Untargeted'
    }`,
    `Seniority: ${readableValue(job.seniority, 'Not specified')}`,
    `Location: ${readableValue(job.location, 'Not specified')}`,
    `Work setup: ${readableValue(job.workSetup, 'Not specified')}`,
    `Work setup confidence: ${Math.round(job.workSetupConfidence * 100)}%`,
    `Eligibility: ${readableValue(job.eligibility, 'Not evaluated')}`,
    `Employment type: ${readableValue(job.employmentType, 'Not specified')}`,
    `Actual salary: ${readableValue(job.salary, 'Not provided')}`,
    `Salary grade: ${job.salaryGrade === null ? 'Not provided' : `SG ${job.salaryGrade}`}`,
    `Salary step: ${job.salaryStep === null ? 'Not provided' : `Step ${job.salaryStep}`}`,
    `Reference salary range: ${
      job.salaryReferenceMin === null || job.salaryReferenceMax === null
        ? 'Not provided'
        : `${formatReferenceAmount(job.salaryReferenceMin, job.salaryReferenceCurrency)}–${formatReferenceAmount(job.salaryReferenceMax, job.salaryReferenceCurrency)} per month`
    }`,
    `Reference steps: ${
      job.salaryReferenceStepMin === null ||
      job.salaryReferenceStepMax === null
        ? 'Not provided'
        : `Steps ${job.salaryReferenceStepMin}–${job.salaryReferenceStepMax}`
    }`,
    `Reference schedule year: ${job.salaryReferenceScheduleYear ?? 'Not provided'}`,
    `Reference source: ${job.salaryReferenceSource || 'Not provided'}`,
    `Reference-only warning: ${
      job.salaryIsReferenceOnly
        ? job.compensationNote || 'Reference only; not an offered salary.'
        : 'Not applicable'
    }`,
    `Government scope: ${readableValue(job.governmentScope, 'Not provided')}`,
    `Vacancies: ${job.vacancies ?? 'Not provided'}`,
    `Date posted: ${readableValue(job.datePosted, 'Not provided')}`,
    `Date updated by source: ${readableValue(job.dateUpdated, 'Not provided')}`,
    `Closing date: ${readableValue(job.dateExpires, 'Not provided')}`,
    `Date ingested: ${readableValue(job.dateIngested, 'Not provided')}`,
    `Record created: ${readableValue(job.recordCreatedAt, 'Not provided')}`,
    `Record updated: ${readableValue(job.recordUpdatedAt, 'Not provided')}`,
    `Required experience: ${
      job.yearsExperience == null
        ? 'Not specified'
        : `${job.yearsExperience} year${job.yearsExperience === 1 ? '' : 's'}`
    }`,
  ].join('\n');

  const decision = [
    `Score: ${score ? `${score.value}/100` : 'Not evaluated'}`,
    `Recommendation: ${score ? readableValue(score.recommendation, 'Not recorded') : 'Not evaluated'}`,
    `Score reason: ${score?.reason || 'Not evaluated'}`,
    `Scored at: ${score?.scoredAt || 'Not evaluated'}`,
    `Rejection reason recorded: ${job.rejectionReasonRecorded ? 'Yes' : 'No'}`,
    'Rejection reasons:',
    list(job.rejectionReasons),
  ].join('\n');

  const matchAnalysis = score
    ? [
        'Factors:',
        list(
          score.factors.map(
            (factor) => `${factor.label}: ${factor.value}/${factor.max}`,
          ),
        ),
        '',
        'Matched skills:',
        list(score.matchedSkills),
        '',
        'Missing skills:',
        list(score.missingSkills),
        '',
        'Risk flags:',
        list(score.riskFlags),
      ].join('\n')
    : 'No persisted match analysis is available.';

  const application = [
    `Keyword: ${job.applicationKeyword || 'Not provided'}`,
    `Email: ${job.applicationEmail || 'Not provided'}`,
    `Addressee: ${job.applicationAddressee || 'Not provided'}`,
    `Application URL: ${job.applicationUrl || 'Not provided'}`,
    `Civil Service eligibility: ${job.civilServiceEligibility || 'Not provided'}`,
    '',
    'Schedule notes:',
    list(job.scheduleNotes),
    '',
    'Instructions:',
    list(job.applicationInstructions),
  ].join('\n');

  return [
    'JOB DETAILS',
    '===========',
    '',
    section('SUMMARY', summary),
    '',
    section('DECISION', decision),
    '',
    section('DESCRIPTION', job.description || 'No description recorded.'),
    '',
    section('RESPONSIBILITIES', list(job.responsibilities)),
    '',
    section('REQUIREMENTS', list(job.requirements)),
    '',
    section('REQUIRED SKILLS', list(job.requiredSkills)),
    '',
    section('PREFERRED SKILLS', list(job.preferredSkills)),
    '',
    section('MATCH ANALYSIS', matchAnalysis),
    '',
    section('APPLICATION', application),
    '',
    section('RAW SOURCE SNAPSHOT', job.rawSource || 'No source snapshot recorded.'),
    '',
  ].join('\n');
}

export function getJobExportFilename(job: Pick<JobDetailData, 'company' | 'title'>): string {
  const base = `${job.company}-${job.title}`
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

  return `${base || 'job'}-details.txt`;
}
