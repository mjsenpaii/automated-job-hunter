import * as cheerio from 'cheerio';
import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';
import { computeMissingExtractionFields } from '../import-contracts.js';
import type { ExtractedJobData, ExtractionResult } from '../types.js';

export type { ExtractedJobData, ExtractionResult };

export type ExtractedPageData = Partial<ExtractedJobData> & {
  date_posted?: string;
  date_expires?: string;
  region?: string;
};

// --- SSRF hardening configuration ---
export const MAX_RESPONSE_BYTES = 2 * 1024 * 1024; // 2 MB cap on fetched HTML
export const MAX_REDIRECTS = 5;
export const FETCH_TIMEOUT_MS = 10000;

/** Return true if an IPv4 literal falls in a private, loopback, link-local, or otherwise reserved range. */
function isBlockedIpv4(ip: string): boolean {
  const parts = ip.split('.').map((p) => Number(p));
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) {
    return true; // malformed → block defensively
  }
  const [a, b] = parts as [number, number, number, number];
  if (a === 0) return true; // 0.0.0.0/8 "this network"
  if (a === 10) return true; // 10.0.0.0/8 private
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local (incl. 169.254.169.254 cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 private
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 private
  if (a === 192 && b === 0) return true; // 192.0.0.0/24 IETF protocol assignments
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a >= 224) return true; // 224.0.0.0/4 multicast + 240.0.0.0/4 reserved + 255.255.255.255 broadcast
  return false;
}

/** Expand an IPv6 string (with :: compression and optional embedded dotted IPv4) into 8 16-bit groups. */
function expandIpv6(ip: string): number[] | null {
  let s = ip.toLowerCase();

  // Convert a trailing embedded dotted-quad (e.g. ::ffff:127.0.0.1) into two hex groups.
  const dotted = s.match(/^(.*:)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (dotted && dotted[1] && dotted[2]) {
    const v4 = dotted[2].split('.').map((p) => Number(p));
    if (v4.length !== 4 || v4.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
    const hi = ((v4[0] as number) << 8) | (v4[1] as number);
    const lo = ((v4[2] as number) << 8) | (v4[3] as number);
    s = `${dotted[1]}${hi.toString(16)}:${lo.toString(16)}`;
  }

  const halves = s.split('::');
  if (halves.length > 2) return null;

  const head = halves[0] ? (halves[0] as string).split(':') : [];
  const tail = halves.length === 2 && halves[1] ? (halves[1] as string).split(':') : [];

  let groups: string[];
  if (halves.length === 2) {
    const missing = 8 - (head.length + tail.length);
    if (missing < 0) return null;
    groups = [...head, ...Array(missing).fill('0'), ...tail];
  } else {
    groups = head;
  }

  if (groups.length !== 8) return null;
  const nums = groups.map((g) => (g === '' ? 0 : parseInt(g, 16)));
  if (nums.some((n) => Number.isNaN(n) || n < 0 || n > 0xffff)) return null;
  return nums;
}

/** Return true if an IPv6 literal is loopback, unspecified, unique-local, link-local, multicast, or maps to a blocked IPv4. */
function isBlockedIpv6(ip: string): boolean {
  const h = expandIpv6(ip);
  if (!h) return true; // malformed → block defensively

  const allZeroPrefix6 = h.slice(0, 6).every((x) => x === 0);
  const isMapped = h[0] === 0 && h[1] === 0 && h[2] === 0 && h[3] === 0 && h[4] === 0 && h[5] === 0xffff;

  // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible (::a.b.c.d) → classify the embedded IPv4.
  if (isMapped || (allZeroPrefix6 && !(h[6] === 0 && ((h[7] as number) <= 1)))) {
    const g6 = h[6] as number;
    const g7 = h[7] as number;
    const a = (g6 >> 8) & 0xff;
    const b = g6 & 0xff;
    const c = (g7 >> 8) & 0xff;
    const d = g7 & 0xff;
    return isBlockedIpv4(`${a}.${b}.${c}.${d}`);
  }

  if (h.every((x) => x === 0)) return true; // :: unspecified
  if (allZeroPrefix6 && h[6] === 0 && h[7] === 1) return true; // ::1 loopback

  const first = h[0] as number;
  if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique-local
  if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((first & 0xffc0) === 0xfec0) return true; // fec0::/10 deprecated site-local
  if ((first & 0xff00) === 0xff00) return true; // ff00::/8 multicast

  return false;
}

/** Central IP-classification helper used for both literal hosts and DNS-resolved addresses. */
export function isBlockedIp(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) return isBlockedIpv4(ip);
  if (kind === 6) return isBlockedIpv6(ip);
  return true; // not a valid IP literal → block defensively
}

/** Normalize a URL hostname (strips IPv6 brackets, lowercases). */
function normalizeHost(hostname: string): string {
  let host = hostname.toLowerCase();
  if (host.startsWith('[') && host.endsWith(']')) {
    host = host.slice(1, -1);
  }
  return host;
}

/**
 * Synchronous, network-free validation: scheme, and literal-host / IP-literal SSRF checks.
 * Kept synchronous so it can be reused per redirect hop without I/O.
 */
export function validateUrl(url: string): { valid: boolean; error?: string } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch (err) {
    return { valid: false, error: 'Invalid URL format' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { valid: false, error: 'Only http and https schemes are allowed' };
  }

  const host = normalizeHost(parsed.hostname);
  if (!host) {
    return { valid: false, error: 'Invalid URL format' };
  }

  // Block localhost by name (and subdomains / mDNS names that resolve locally)
  if (
    host === 'localhost' ||
    host === 'localhost.localdomain' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local')
  ) {
    return { valid: false, error: 'Local networks are not allowed' };
  }

  // If the host is an IP literal, classify it directly.
  if (isIP(host) !== 0) {
    if (isBlockedIp(host)) {
      return { valid: false, error: 'Private, loopback, or link-local addresses are not allowed' };
    }
  }

  return { valid: true };
}

/**
 * Resolves a hostname via DNS and validates every returned address is public.
 * Blocks DNS-based SSRF (public name → private IP). Literal IPs are validated directly.
 */
export async function resolveHostToPublicIps(
  hostname: string,
): Promise<{ ok: boolean; error?: string }> {
  const host = normalizeHost(hostname);

  if (isIP(host) !== 0) {
    return isBlockedIp(host)
      ? { ok: false, error: 'Private, loopback, or link-local addresses are not allowed' }
      : { ok: true };
  }

  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(host, { all: true });
  } catch {
    return { ok: false, error: 'DNS resolution failed' };
  }

  if (!addresses || addresses.length === 0) {
    return { ok: false, error: 'DNS resolution failed' };
  }

  // Block if ANY resolved address is private/reserved (defensive against split-horizon DNS).
  for (const entry of addresses) {
    if (isBlockedIp(entry.address)) {
      return { ok: false, error: 'URL resolves to a private or reserved IP address' };
    }
  }

  return { ok: true };
}

/** Minimal JSON-LD JobPosting shape used by the extractor (unknown fields ignored). */
interface JsonLdJobPosting {
  '@type'?: string;
  title?: string;
  name?: string;
  description?: string;
  employmentType?: string | string[];
  baseSalary?: unknown;
  datePosted?: string;
  validThrough?: string;
  jobLocationType?: string;
  url?: string;
  applicantLocationRequirements?:
    | { name?: string }
    | Array<{ name?: string }>;
  hiringOrganization?: { name?: string; legalName?: string };
  jobLocation?:
    | { address?: { addressLocality?: string; addressRegion?: string; addressCountry?: string } }
    | Array<{ address?: { addressLocality?: string; addressRegion?: string; addressCountry?: string } }>;
}

export function extractFromJsonLd(html: string): ExtractedPageData | null {
  const $ = cheerio.load(html);
  const scripts = $('script[type="application/ld+json"]');
  let data: JsonLdJobPosting | null = null;

  for (const script of scripts) {
    try {
      const parsed: unknown = JSON.parse($(script).html() || '{}');
      // Sometimes it's an array of objects
      const asRecord = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
      const items: unknown[] = Array.isArray(parsed)
        ? parsed
        : Array.isArray(asRecord?.['@graph'])
          ? (asRecord['@graph'] as unknown[])
          : [parsed];

      for (const item of items) {
        if (item && typeof item === 'object' && (item as JsonLdJobPosting)['@type'] === 'JobPosting') {
          data = item as JsonLdJobPosting;
          break;
        }
      }
      if (data) break;
    } catch {
      // Ignore parse errors
    }
  }

  if (!data) return null;

  const result: ExtractedPageData = {};
  if (data.title || data.name) result.title = data.title || data.name;
  if (data.hiringOrganization && (data.hiringOrganization.name || data.hiringOrganization.legalName)) {
    result.company = data.hiringOrganization.name || data.hiringOrganization.legalName;
  }
  if (data.description) result.description = data.description;
  if (data.employmentType) {
    result.employment_type = Array.isArray(data.employmentType)
      ? data.employmentType[0]
      : data.employmentType;
  }

  if (data.baseSalary) {
    result.salary_text =
      typeof data.baseSalary === 'string' ? data.baseSalary : JSON.stringify(data.baseSalary);
  }
  if (data.datePosted) result.date_posted = data.datePosted;
  if (data.validThrough) result.date_expires = data.validThrough;
  if (data.url) result.application_url = data.url;
  if (data.jobLocationType?.toUpperCase() === 'TELECOMMUTE') {
    result.work_setup = 'REMOTE';
  }

  if (data.jobLocation && Array.isArray(data.jobLocation) && data.jobLocation.length > 0) {
    const loc = data.jobLocation[0];
    if (loc?.address) {
      if (loc.address.addressLocality) result.city = loc.address.addressLocality;
      if (loc.address.addressRegion) result.region = loc.address.addressRegion;
      if (loc.address.addressCountry) result.country = loc.address.addressCountry;
    }
  } else if (data.jobLocation && !Array.isArray(data.jobLocation) && data.jobLocation.address) {
    if (data.jobLocation.address.addressLocality) result.city = data.jobLocation.address.addressLocality;
    if (data.jobLocation.address.addressRegion) result.region = data.jobLocation.address.addressRegion;
    if (data.jobLocation.address.addressCountry) result.country = data.jobLocation.address.addressCountry;
  }

  const applicantLocations = Array.isArray(data.applicantLocationRequirements)
    ? data.applicantLocationRequirements
    : data.applicantLocationRequirements
      ? [data.applicantLocationRequirements]
      : [];
  const allowedRegions = applicantLocations
    .map((location) => location.name?.trim())
    .filter((value): value is string => Boolean(value));
  if (allowedRegions.length > 0) result.allowed_regions = allowedRegions;

  return result;
}

export function extractFromMetaTags(html: string): ExtractedPageData | null {
  const $ = cheerio.load(html);
  const title = $('meta[property="og:title"]').attr('content') || $('meta[name="twitter:title"]').attr('content');
  const description = $('meta[property="og:description"]').attr('content') || $('meta[name="twitter:description"]').attr('content') || $('meta[name="description"]').attr('content');
  const company = $('meta[property="og:site_name"]').attr('content');
  
  if (!title && !description) return null;
  
  const result: ExtractedPageData = {};
  if (title) result.title = title;
  if (description) result.description = description;
  if (company) result.company = company;
  
  return result;
}

export function extractFromHtml(html: string): ExtractedPageData | null {
  const $ = cheerio.load(html);
  const result: ExtractedPageData = {};
  
  const h1 = $('h1').first().text().trim();
  if (h1) result.title = h1;
  else {
    const titleTag = $('title').text().trim();
    if (titleTag) result.title = titleTag;
  }
  
  const mainContent = $('main, article, .job-description, .content, #content, #job-details, .description').text().trim();
  if (mainContent) {
    result.description = mainContent;
  } else {
    result.description = $('body').text().trim().replace(/\s+/g, ' ');
  }

  return result;
}

/**
 * Reads a fetch Response body while enforcing a hard byte cap.
 * Returns null if the response exceeds the limit (stream is cancelled early).
 */
export async function readCappedText(
  response: Response,
  limit: number = MAX_RESPONSE_BYTES,
): Promise<string | null> {
  // Fast path: reject oversized responses by declared Content-Length.
  const declared = Number(response.headers.get('content-length') || '0');
  if (declared && declared > limit) {
    return null;
  }

  const body = response.body;
  if (!body || typeof body.getReader !== 'function') {
    // Fallback for environments without a streamable body: read then enforce cap.
    const text = await response.text();
    return Buffer.byteLength(text, 'utf8') > limit ? null : text;
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        received += value.length;
        if (received > limit) {
          await reader.cancel();
          return null;
        }
        chunks.push(value);
      }
    }
  } finally {
    reader.releaseLock?.();
  }

  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8');
}

/**
 * Fetches a URL following redirects MANUALLY, re-validating the scheme, host and
 * resolved IPs at EVERY hop. This closes the redirect-based SSRF hole where an
 * allowed public URL 30x-redirects to an internal address (e.g. cloud metadata).
 */
export async function safeFetch(
  initialUrl: string,
  options: {
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
    resolveHost?: typeof resolveHostToPublicIps;
  } = {},
): Promise<{ response?: Response; error?: string }> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? FETCH_TIMEOUT_MS;
  const resolveHost = options.resolveHost ?? resolveHostToPublicIps;
  let currentUrl = initialUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    // 1. Synchronous scheme / literal-IP validation for this hop.
    const syncValidation = validateUrl(currentUrl);
    if (!syncValidation.valid) {
      return { error: syncValidation.error };
    }

    // 2. DNS-resolution validation for this hop.
    const { hostname } = new URL(currentUrl);
    const dnsValidation = await resolveHost(hostname);
    if (!dnsValidation.ok) {
      return { error: dnsValidation.error };
    }

    // 3. Fetch this hop with its own timeout, without auto-following redirects.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetchImpl(currentUrl, {
        headers: {
          'User-Agent': 'JobAppAI/1.0 (Job Research Tool)',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        signal: controller.signal,
        redirect: 'manual',
      });
    } catch {
      clearTimeout(timeout);
      return { error: 'Failed to fetch URL' };
    }
    clearTimeout(timeout);

    // 4. Handle redirects ourselves.
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) {
        return { response }; // 3xx with no Location — treat as final.
      }
      let next: string;
      try {
        next = new URL(location, currentUrl).toString();
      } catch {
        return { error: 'Invalid redirect location' };
      }
      currentUrl = next;
      continue; // re-validate on next loop iteration
    }

    return { response };
  }

  return { error: 'Too many redirects' };
}

export async function extractFromUrl(url: string): Promise<ExtractionResult> {
  const validation = validateUrl(url);
  if (!validation.valid) {
    return {
      success: false,
      data: null,
      error: validation.error,
      warnings: [],
      requires_manual_input: true
    };
  }

  try {
    const fetched = await safeFetch(url);
    if (fetched.error || !fetched.response) {
      return {
        success: false,
        data: null,
        error: fetched.error || 'Failed to fetch URL',
        warnings: [],
        requires_manual_input: true
      };
    }

    const response = fetched.response;

    if (!response.ok) {
      return {
        success: false,
        data: null,
        error: `Failed to fetch URL: ${response.status} ${response.statusText}`,
        warnings: [],
        requires_manual_input: true
      };
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) {
      return {
        success: false,
        data: null,
        error: 'URL did not return HTML content',
        warnings: [],
        requires_manual_input: true
      };
    }

    const html = await readCappedText(response);
    if (html === null) {
      return {
        success: false,
        data: null,
        error: 'Response exceeded maximum allowed size',
        warnings: [],
        requires_manual_input: true
      };
    }

    let extractedData = extractFromJsonLd(html);
    let method: 'json-ld' | 'meta-tags' | 'html-heuristic' | 'manual' = 'json-ld';
    let confValue: 'high' | 'medium' | 'low' | 'inferred' = 'high';
    
    if (!extractedData || Object.keys(extractedData).length === 0) {
      extractedData = extractFromMetaTags(html);
      method = 'meta-tags';
      confValue = 'medium';
    }
    
    if (!extractedData || Object.keys(extractedData).length === 0) {
      extractedData = extractFromHtml(html);
      method = 'html-heuristic';
      confValue = 'inferred'; // Based on requirements: "Low confidence. Mark all fields as 'inferred'"
    }

    if (!extractedData || Object.keys(extractedData).length === 0) {
      return {
        success: false,
        data: null,
        error: 'Failed to extract any meaningful data from the page',
        warnings: [],
        requires_manual_input: true
      };
    }

    const resultData: ExtractedJobData = {
      title: extractedData.title || null,
      company: extractedData.company || null,
      description: extractedData.description || null,
      country: extractedData.country || null,
      city: extractedData.city || null,
      work_setup: extractedData.work_setup || null,
      employment_type: extractedData.employment_type || null,
      salary_text: extractedData.salary_text || null,
      required_skills: extractedData.required_skills || [],
      preferred_skills: extractedData.preferred_skills || [],
      seniority: extractedData.seniority || null,
      allowed_countries: extractedData.allowed_countries || [],
      allowed_regions: extractedData.allowed_regions || [],
      eligibility_text: extractedData.eligibility_text || null,
      application_url: extractedData.application_url || null,
      source_url: url,
      extraction_method: method,
      confidence: {},
      raw_html: html
    };

    for (const key of Object.keys(extractedData)) {
      if (extractedData[key as keyof Partial<ExtractedJobData>] !== undefined) {
        resultData.confidence[key] = confValue;
      }
    }

    const missingFields = computeMissingExtractionFields(resultData);
    const warnings: string[] = [];
    if (missingFields.length > 0) {
      warnings.push(
        `Missing required fields: ${missingFields.join(', ')}. Complete them before scoring.`,
      );
    }

    // Partial extraction is still success — the user completes missing fields.
    return {
      success: true,
      data: resultData,
      warnings,
      requires_manual_input: missingFields.length > 0,
      missingFields,
    };

  } catch (error: unknown) {
    return {
      success: false,
      data: null,
      error: error instanceof Error ? error.message : 'Failed to extract from URL',
      warnings: [],
      requires_manual_input: true
    };
  }
}
