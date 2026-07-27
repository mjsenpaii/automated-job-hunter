import * as cheerio from 'cheerio';

const BLOCK_ELEMENTS = [
  'address',
  'article',
  'blockquote',
  'div',
  'dl',
  'fieldset',
  'figcaption',
  'figure',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'main',
  'p',
  'pre',
  'section',
  'table',
  'tr',
].join(',');

const NOISE_SELECTORS = [
  'script',
  'style',
  'noscript',
  'svg',
  'canvas',
  'iframe',
  'nav',
  'header',
  'footer',
  'aside',
  'form',
  '[aria-hidden="true"]',
  '[hidden]',
  '[class*="cookie"]',
  '[id*="cookie"]',
  '[class*="social"]',
  '[id*="social"]',
  '[class*="breadcrumb"]',
  '[id*="breadcrumb"]',
  '[class*="newsletter"]',
  '[id*="newsletter"]',
].join(',');

const SHORT_NOISE_LINES = [
  /^(log|sign)\s*(in|up)$/i,
  /^(home|menu|navigation|search)$/i,
  /^(privacy policy|terms(?: of (?:use|service))?|cookie policy|accessibility)$/i,
  /^(facebook|instagram|linkedin|x|twitter|youtube|tiktok)$/i,
  /^(follow|connect with) us$/i,
  /^all rights reserved\.?$/i,
  /^copyright(?:\s+©)?(?:\s+\d{4})?.*$/i,
  /^©\s*\d{4}.*$/i,
];

function decodePlainText(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n');
}

function looksLikeHtml(value: string): boolean {
  return /<\/?[a-z][\s\S]*?>/i.test(value);
}

function htmlToText(html: string): string {
  const $ = cheerio.load(html);
  $(NOISE_SELECTORS).remove();
  $('a[href]').each((_, element) => {
    const href = $(element).attr('href');
    if (href && /^https?:\/\//i.test(href)) {
      $(element).append(` (${href})`);
    }
  });
  $('br').replaceWith('\n');
  $('li').each((_, element) => {
    $(element).prepend('\n- ').append('\n');
  });
  $(BLOCK_ELEMENTS).each((_, element) => {
    $(element).prepend('\n').append('\n');
  });
  return $.root().text();
}

function isNoiseLine(line: string): boolean {
  if (line.length > 140) return false;
  return SHORT_NOISE_LINES.some((pattern) => pattern.test(line));
}

/**
 * Converts raw HTML or copied webpage text into bounded, readable job content.
 *
 * This intentionally removes navigation, script/style content, social/footer
 * boilerplate, and inline markup before any content is sent to an extractor or
 * rendered as a job description. It never adds facts to the source content.
 */
export function cleanJobContent(input: string, maxChars = 60_000): string {
  const source = decodePlainText(input);
  const extracted = looksLikeHtml(source) ? htmlToText(source) : source;
  const lines = decodePlainText(extracted)
    .split('\n')
    .map((line) => line.replace(/[ \t]{2,}/g, ' ').trim())
    .filter(Boolean)
    .filter((line) => !isNoiseLine(line));

  const deduped: string[] = [];
  for (const line of lines) {
    if (line !== deduped.at(-1)) deduped.push(line);
  }

  return deduped.join('\n').slice(0, maxChars).trim();
}

export function detectJobInputKind(input: string): 'url' | 'html' | 'text' {
  const trimmed = input.trim();
  try {
    const parsed = new URL(trimmed);
    if (
      (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      !/\s/.test(trimmed)
    ) {
      return 'url';
    }
  } catch {
    // Continue with content detection.
  }
  return looksLikeHtml(trimmed) ? 'html' : 'text';
}
