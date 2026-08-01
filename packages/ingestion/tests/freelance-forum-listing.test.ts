import { describe, expect, it, vi } from 'vitest';
import type { SkillEntry } from '@job-app/core';
import { parseOriginalJobPage } from '../src/adapters/tavily.js';
import {
  buildFreelanceOpportunity,
  diagnoseFreelanceOpportunityReadiness,
} from '../src/freelance/classification.js';
import {
  extractForumListingContext,
  POTENTIALLY_STALE_FORUM_LISTING_HINT,
} from '../src/freelance/forum-listing.js';
import { mapFreelanceWebJob } from '../src/freelance/web-discovery.js';

const FORUM_URL =
  'https://community.n8n.io/t/looking-for-freelancer-that-can-set-up-workflow-fast/176510';

function skill(name: string): SkillEntry {
  return {
    name,
    category: 'other',
    proficiency: 'intermediate',
    verification_status: 'VERIFIED',
    source: 'USER_CONFIRMED',
    source_reference: 'forum-listing-fixture',
    evidence_level: 'personal_project',
    allowed_in_resume: true,
  };
}

function forumHtml(options: {
  includeOriginalPosterReply?: boolean;
  originalPublishedAt?: string;
  replyPublishedAt?: string;
} = {}): string {
  return `<!doctype html>
  <html>
    <head>
      <meta property="og:title" content="Looking for freelancer that can set up workflow fast">
      <meta property="og:site_name" content="n8n Community">
      <meta name="description" content="Public n8n freelance project">
    </head>
    <body>
      <main>
        <div class="topic-post" data-post-id="1" data-user-id="original-author">
          <article>
            <time datetime="${options.originalPublishedAt ?? '2026-07-25T08:00:00.000Z'}"></time>
            <div class="cooked">
              <p>I am looking for a freelancer for a short project.</p>
              <p>Requirements</p>
              <ul>
                <li>Experience with REST API integration and n8n is required.</li>
                <li>Set up one workflow, connect the documented API, test the automation, and document delivery.</li>
              </ul>
            </div>
          </article>
        </div>
        <div class="topic-post" data-post-id="2" data-user-id="applicant-author">
          <article>
            <time datetime="2026-07-26T08:00:00.000Z"></time>
            <div class="cooked">
              <p>I think applicants in the Philippines are welcome and eight years of experience are required.</p>
            </div>
          </article>
        </div>
        ${options.includeOriginalPosterReply === false ? '' : `
        <div class="topic-post" data-post-id="3" data-user-id="original-author">
          <article>
            <time datetime="${options.replyPublishedAt ?? '2026-07-27T08:00:00.000Z'}"></time>
            <div class="cooked">
              <p>The Philippines will not work because of the time difference.</p>
            </div>
          </article>
        </div>`}
      </main>
    </body>
  </html>`;
}

describe('first-party forum listing updates', () => {
  it('lets original-poster replies clarify geography', () => {
    const parsed = extractForumListingContext(forumHtml(), {
      now: new Date('2026-08-02T00:00:00.000Z'),
    });

    expect(parsed).not.toBeNull();
    expect(parsed?.firstPartyUpdates).toHaveLength(1);
    expect(parsed?.firstPartyUpdates[0]?.updateTypes).toEqual(
      expect.arrayContaining(['GEOGRAPHY', 'TIMEZONE']),
    );
    expect(parsed?.geographicRestrictions).toEqual(['Philippines excluded']);
    expect(parsed?.firstPartyUpdates[0]?.evidenceText).toContain(
      'Philippines will not work',
    );
  });

  it('does not let other applicants comments modify the listing', () => {
    const parsed = extractForumListingContext(forumHtml(), {
      now: new Date('2026-08-02T00:00:00.000Z'),
    });
    expect(JSON.stringify(parsed)).not.toContain('eight years');
    expect(JSON.stringify(parsed)).not.toContain('applicants in the Philippines are welcome');
    expect(parsed?.minimumExperienceYears).toBeNull();
  });

  it('recognizes bounded first-party status, experience, pay, scope, and timezone updates', () => {
    const html = forumHtml().replace(
      'The Philippines will not work because of the time difference.',
      'The role is now limited to North America and Eastern Standard Time. The project scope now needs one API workflow. The minimum is 4 years. Pay is USD 12 hourly. This position is filled.',
    );
    const parsed = extractForumListingContext(html, {
      now: new Date('2026-08-02T00:00:00.000Z'),
    });
    expect(parsed?.firstPartyUpdates[0]?.updateTypes).toEqual(
      expect.arrayContaining([
        'GEOGRAPHY', 'TIMEZONE', 'ROLE_STATUS', 'EXPERIENCE', 'PAY', 'SCOPE',
      ]),
    );
    expect(parsed).toMatchObject({
      geographicRestrictions: ['North America'],
      timezoneRestrictions: ['Eastern Standard Time'],
      minimumExperienceYears: 4,
      roleClosed: true,
    });
    expect(parsed?.payUpdateText).toContain('USD 12 hourly');
  });

  it('makes the cached n8n listing NOT READY for the explicit Philippines exclusion', () => {
    const job = parseOriginalJobPage(forumHtml(), FORUM_URL, {
      now: new Date('2026-08-02T00:00:00.000Z'),
    });
    expect(job).not.toBeNull();
    const candidate = mapFreelanceWebJob(job!, 'TAVILY');
    expect(candidate).not.toBeNull();
    expect(candidate?.applicantGeographicRestrictions).toEqual([
      'Philippines excluded',
    ]);
    expect(candidate?.publicDescription).not.toContain('eight years');
    expect(candidate?.minimumExperienceYears).toBeNull();

    const opportunity = buildFreelanceOpportunity({
      candidate: candidate!,
      verifiedSkills: [
        skill('REST APIs'),
        skill('n8n'),
      ],
      now: new Date('2026-08-02T00:00:00.000Z'),
    });
    const diagnostic = diagnoseFreelanceOpportunityReadiness(opportunity, []);
    expect(opportunity.views).toEqual([]);
    expect(opportunity.readiness.classification).toBe('NOT_READY');
    expect(diagnostic.geographicEligibility).toBe('INELIGIBLE');
    expect(diagnostic.primaryBlocker).toBe('GEOGRAPHIC_RESTRICTION');
  });

  it('flags an old forum post without recent original-poster confirmation as potentially stale', () => {
    const job = parseOriginalJobPage(forumHtml({
      includeOriginalPosterReply: false,
      originalPublishedAt: '2025-01-10T08:00:00.000Z',
    }), FORUM_URL, {
      now: new Date('2026-08-02T00:00:00.000Z'),
    });
    const candidate = mapFreelanceWebJob(job!, 'TAVILY');
    expect(job?.forumListingContext?.potentiallyStale).toBe(true);
    expect(candidate?.categoryHints).toContain(POTENTIALLY_STALE_FORUM_LISTING_HINT);
    const opportunity = buildFreelanceOpportunity({
      candidate: candidate!,
      verifiedSkills: [],
      now: new Date('2026-08-02T00:00:00.000Z'),
    });
    expect(opportunity.risk.reasons).toContain('POTENTIALLY_STALE_LISTING');
  });

  it('uses cached HTML deterministically without a live request or database mutation', () => {
    const liveFetch = vi.fn();
    const databaseWrite = vi.fn();
    const parsed = parseOriginalJobPage(forumHtml(), FORUM_URL, {
      now: new Date('2026-08-02T00:00:00.000Z'),
    });
    expect(parsed?.forumListingContext?.geographicRestrictions).toEqual([
      'Philippines excluded',
    ]);
    expect(liveFetch).not.toHaveBeenCalled();
    expect(databaseWrite).not.toHaveBeenCalled();
  });
});
