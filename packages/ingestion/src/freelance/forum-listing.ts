import { createHash } from 'node:crypto';
import * as cheerio from 'cheerio';
import { cleanJobContent } from '../content-cleaner.js';
import type { ForumListingContext } from '../discovery/contracts.js';

export const FORUM_LISTING_STALE_AFTER_DAYS = 90 as const;
export const POTENTIALLY_STALE_FORUM_LISTING_HINT =
  'POTENTIALLY_STALE_FORUM_LISTING' as const;
export const FIRST_PARTY_ROLE_CLOSED_HINT =
  'FIRST_PARTY_ROLE_CLOSED' as const;

type UpdateType = ForumListingContext['firstPartyUpdates'][number]['updateTypes'][number];

interface ForumPost {
  authorKey: string;
  text: string;
  publishedAt: string | null;
}

type CheerioInput = Parameters<cheerio.CheerioAPI>[0];

const PHILIPPINES_EXCLUSION =
  /(?:\b(?:philippines|filipino(?: applicants?)?)\b.{0,100}\b(?:will not work|won't work|would not work|cannot work|can't work|not eligible|not accepted|not accepting|excluded?|unavailable)\b|\b(?:will not work|won't work|would not work|cannot accept|can't accept|exclude(?:d)?|not accepting)\b.{0,100}\b(?:philippines|filipino(?: applicants?)?)\b)/i;
const PHILIPPINES_ACCEPTANCE =
  /(?:\b(?:accept(?:ing)?|eligible|available to|open to)\b.{0,80}\b(?:philippines|filipino applicants?)\b|\b(?:philippines|filipino applicants?)\b.{0,80}\b(?:accepted|eligible|can apply|will work)\b)/i;
const ELIGIBLE_LOCATION_CUE =
  /\b(?:eligible (?:countries|locations)|(?:accept(?:ing)?|available|open) to applicants? (?:in|from)|applicants? must be based in|based in .{1,60} only|country restrictions?)\b/i;
const BROAD_REGION = /\b(?:worldwide|global|anywhere|north america|south america|americas|europe|emea|apac|asia)\b/i;
const TIMEZONE = /\b(?:time\s*zone|timezone|time difference|working hours? overlap|overlap hours?|UTC\s*[+-]\s*\d{1,2}(?::\d{2})?|GMT\s*[+-]\s*\d{1,2}(?::\d{2})?|Eastern Standard Time|Pacific Standard Time|Central European Time|EST|PST|CET)\b/i;
const ROLE_STATUS = /\b(?:role|position|opening|job|project)\b.{0,50}\b(?:closed|filled|no longer available|not accepting|hiring (?:is )?complete)\b|\b(?:closed|filled)\b.{0,40}\b(?:role|position|opening|job|project)\b/i;
const EXPERIENCE = /\b(?:(?:at least|minimum(?: of| is)?|requires?|must have)?\s*\d{1,2}\+?\s+years?|(?:professional\s+)?experience\s+(?:is\s+)?(?:required|mandatory)|requires?\s+(?:prior\s+|professional\s+)?experience)\b/i;
const PAY = /(?:\b(?:USD|EUR|GBP|PHP|AUD|CAD|NZD|SGD)\b|US\$|[$₱£€]).{0,80}\b(?:hour|hourly|rate|budget|pay|fixed[- ]price)\b|\b(?:hourly|rate|budget|pay|fixed[- ]price)\b.{0,80}(?:\b(?:USD|EUR|GBP|PHP|AUD|CAD|NZD|SGD)\b|US\$|[$₱£€])/i;
const SCOPE = /\b(?:scope|deliverables?|task(?:s)? changed|change(?:d)? the (?:project|work)|instead (?:we|i) need|now (?:we|i) need)\b/i;

function normalizeAuthorKey(value: string): string {
  return createHash('sha256')
    .update(cleanJobContent(value, 240).toLocaleLowerCase())
    .digest('hex');
}

function safeDate(value: string | undefined): string | null {
  if (!value || Number.isNaN(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

function postAuthor($: cheerio.CheerioAPI, element: CheerioInput): string | null {
  const post = $(element);
  const value = [
    post.attr('data-user-id'),
    post.attr('data-username'),
    post.find('[data-user-id]').first().attr('data-user-id'),
    post.find('[data-username]').first().attr('data-username'),
    post.find('[itemprop="author"] [itemprop="name"]').first().text(),
    post.find('.names .username, .creator .username, a.username').first().text(),
  ].find((candidate) => cleanJobContent(candidate ?? '', 240).trim().length > 0);
  const cleaned = cleanJobContent(value ?? '', 240).trim();
  return cleaned ? normalizeAuthorKey(cleaned) : null;
}

function postText($: cheerio.CheerioAPI, element: CheerioInput): string {
  const post = $(element);
  const body = post.find('.cooked, [itemprop="articleBody"], [itemprop="text"], .post-body').first();
  return cleanJobContent(body.length > 0 ? body.html() ?? body.text() : '', 20_000).trim();
}

function postDate($: cheerio.CheerioAPI, element: CheerioInput): string | null {
  const post = $(element);
  return safeDate(
    post.find('time[datetime]').first().attr('datetime') ??
    post.find('[itemprop="datePublished"]').first().attr('content') ??
    post.attr('data-posted-at'),
  );
}

function discoursePosts($: cheerio.CheerioAPI): ForumPost[] {
  const containers = $('.topic-post, article[data-post-id]').toArray().filter((element) => {
    const parentPost = $(element).parents('.topic-post, article[data-post-id]').first();
    return parentPost.length === 0;
  });
  return containers.flatMap((element) => {
    const authorKey = postAuthor($, element);
    const text = postText($, element);
    return authorKey && text ? [{ authorKey, text, publishedAt: postDate($, element) }] : [];
  });
}

function schemaOrgPosts($: cheerio.CheerioAPI): ForumPost[] {
  const root = $('[itemtype$="DiscussionForumPosting"]').first();
  if (root.length === 0) return [];
  const originalAuthor = postAuthor($, root.get(0)!);
  const originalText = cleanJobContent(root.find('[itemprop="articleBody"]').first().html() ?? '', 20_000).trim();
  const original = originalAuthor && originalText
    ? [{ authorKey: originalAuthor, text: originalText, publishedAt: postDate($, root.get(0)!) }]
    : [];
  const comments = root.find('[itemprop="comment"]').toArray().flatMap((element) => {
    const authorKey = postAuthor($, element);
    const text = postText($, element);
    return authorKey && text ? [{ authorKey, text, publishedAt: postDate($, element) }] : [];
  });
  return [...original, ...comments];
}

function updateTypes(text: string): UpdateType[] {
  const types: UpdateType[] = [];
  if (PHILIPPINES_EXCLUSION.test(text) || PHILIPPINES_ACCEPTANCE.test(text) ||
      BROAD_REGION.test(text) || ELIGIBLE_LOCATION_CUE.test(text)) {
    types.push('GEOGRAPHY');
  }
  if (TIMEZONE.test(text)) types.push('TIMEZONE');
  if (ROLE_STATUS.test(text)) types.push('ROLE_STATUS');
  if (EXPERIENCE.test(text)) types.push('EXPERIENCE');
  if (PAY.test(text)) types.push('PAY');
  if (SCOPE.test(text)) types.push('SCOPE');
  return types;
}

function timezoneRestrictions(text: string): string[] {
  const values: string[] = [];
  const utc = text.match(/\b(?:UTC|GMT)\s*[+-]\s*\d{1,2}(?::\d{2})?\b/gi) ?? [];
  values.push(...utc.map((value) => cleanJobContent(value, 40)));
  if (/\b(?:Eastern Standard Time|EST)\b/i.test(text)) values.push('Eastern Standard Time');
  if (/\b(?:Pacific Standard Time|PST)\b/i.test(text)) values.push('Pacific Standard Time');
  if (/\b(?:Central European Time|CET)\b/i.test(text)) values.push('Central European Time');
  return [...new Set(values)].slice(0, 20);
}

function minimumExperienceYears(text: string): number | null {
  const match = text.match(/\b(?:at least|minimum(?: of)?|requires?|must have)?\s*(\d{1,2})\+?\s+years?\b/i);
  const parsed = Number(match?.[1] ?? 0);
  return parsed > 0 && parsed <= 50 ? parsed : null;
}

function isPotentiallyStale(
  originalPublishedAt: string | null,
  latestFirstPartyUpdateAt: string | null,
  now: Date,
): boolean {
  const confirmation = latestFirstPartyUpdateAt ?? originalPublishedAt;
  if (!confirmation) return false;
  return now.getTime() - Date.parse(confirmation) >
    FORUM_LISTING_STALE_AFTER_DAYS * 24 * 60 * 60 * 1_000;
}

export function extractForumListingContext(
  html: string,
  options: { now?: Date } = {},
): ForumListingContext | null {
  const $ = cheerio.load(html);
  const posts = discoursePosts($);
  const resolvedPosts = posts.length > 0 ? posts : schemaOrgPosts($);
  const original = resolvedPosts[0];
  if (!original || resolvedPosts.length < 1) return null;

  const firstPartyUpdates = resolvedPosts.slice(1).flatMap((post) => {
    if (post.authorKey !== original.authorKey) return [];
    const types = updateTypes(post.text);
    return types.length > 0
      ? [{ publishedAt: post.publishedAt, updateTypes: types, evidenceText: post.text }]
      : [];
  });
  const updateText = firstPartyUpdates.map((update) => update.evidenceText).join('\n');
  const geographicRestrictions = PHILIPPINES_EXCLUSION.test(updateText)
    ? ['Philippines excluded']
    : PHILIPPINES_ACCEPTANCE.test(updateText)
      ? ['Philippines']
      : [...new Set(firstPartyUpdates.flatMap((update) => {
          if (!update.updateTypes.includes('GEOGRAPHY')) return [];
          const region = update.evidenceText.match(BROAD_REGION)?.[0];
          return region
            ? [region]
            : ELIGIBLE_LOCATION_CUE.test(update.evidenceText)
              ? [cleanJobContent(update.evidenceText, 100)]
              : [];
        }))];
  const datedUpdates = firstPartyUpdates
    .flatMap((update) => update.publishedAt ? [update.publishedAt] : [])
    .sort((left, right) => Date.parse(right) - Date.parse(left));
  const latestFirstPartyUpdateAt = datedUpdates[0] ?? null;
  const experience = firstPartyUpdates
    .filter((update) => update.updateTypes.includes('EXPERIENCE'))
    .map((update) => minimumExperienceYears(update.evidenceText))
    .find((value): value is number => value !== null) ?? null;
  let payUpdateText: string | null = null;
  for (let index = firstPartyUpdates.length - 1; index >= 0; index -= 1) {
    const update = firstPartyUpdates[index];
    if (update?.updateTypes.includes('PAY')) {
      payUpdateText = update.evidenceText;
      break;
    }
  }
  const roleClosed = firstPartyUpdates.some((update) =>
    update.updateTypes.includes('ROLE_STATUS') && ROLE_STATUS.test(update.evidenceText),
  );

  return {
    originalPostText: original.text,
    originalPostPublishedAt: original.publishedAt,
    firstPartyUpdates,
    latestFirstPartyUpdateAt,
    geographicRestrictions,
    timezoneRestrictions: timezoneRestrictions(updateText),
    minimumExperienceYears: experience,
    payUpdateText,
    roleClosed,
    potentiallyStale: isPotentiallyStale(
      original.publishedAt,
      latestFirstPartyUpdateAt,
      options.now ?? new Date(),
    ),
  };
}

export function forumListingDescription(context: ForumListingContext): string {
  return cleanJobContent([
    context.originalPostText,
    ...context.firstPartyUpdates.map((update) => `Original poster update\n${update.evidenceText}`),
  ].join('\n\n'), 200_000);
}
