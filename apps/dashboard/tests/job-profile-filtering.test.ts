import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { JobProfileBadges } from '../src/components/JobProfileBadges';
import { filterJobsByProfile } from '../src/lib/jobs/profile-filtering';

const JOBS = [
  {
    id: 'software-only',
    matchedProfileIds: ['software_development'],
  },
  {
    id: 'multi-profile',
    matchedProfileIds: ['software_development', 'ai_automation'],
  },
  {
    id: 'untargeted',
    matchedProfileIds: [],
  },
] as const;

describe('job profile badges and filtering', () => {
  it('renders supplied profile labels as client-safe badge text', () => {
    const html = renderToStaticMarkup(
      createElement(JobProfileBadges, {
        matchedProfileIds: ['software_development', 'ai_automation'],
        matchedProfileLabels: ['Software Development', 'AI Automation'],
      }),
    );
    expect(html).toContain('Software Development');
    expect(html).toContain('AI Automation');
    expect(html).toContain('data-profile-count="2"');
  });

  it('renders Untargeted when no profile ID is supplied', () => {
    const html = renderToStaticMarkup(
      createElement(JobProfileBadges, {
        matchedProfileIds: [],
        matchedProfileLabels: [],
      }),
    );
    expect(html).toContain('Untargeted');
    expect(html).toContain('data-profile-count="0"');
  });

  it('filters Untargeted and individual profiles behaviorally', () => {
    expect(filterJobsByProfile(JOBS, 'UNTARGETED').map((job) => job.id)).toEqual(
      ['untargeted'],
    );
    expect(
      filterJobsByProfile(JOBS, 'software_development').map((job) => job.id),
    ).toEqual(['software-only', 'multi-profile']);
    expect(
      filterJobsByProfile(JOBS, 'ai_automation').map((job) => job.id),
    ).toEqual(['multi-profile']);
  });

  it('restores all jobs and never duplicates a multi-profile row', () => {
    expect(filterJobsByProfile(JOBS, 'ALL').map((job) => job.id)).toEqual([
      'software-only',
      'multi-profile',
      'untargeted',
    ]);
    expect(
      filterJobsByProfile(JOBS, 'software_development').filter(
        (job) => job.id === 'multi-profile',
      ),
    ).toHaveLength(1);
  });
});
