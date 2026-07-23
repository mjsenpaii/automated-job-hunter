import * as cheerio from 'cheerio';

export interface ExtractedJobData {
  title: string | null;
  company: string | null;
  description: string | null;
  country: string | null;
  city: string | null;
  work_setup: string | null;
  employment_type: string | null;
  salary_text: string | null;
  required_skills: string[];
  preferred_skills: string[];
  seniority: string | null;
  allowed_countries: string[];
  allowed_regions: string[];
  eligibility_text: string | null;
  application_url: string | null;
  source_url: string;
  extraction_method: 'json-ld' | 'meta-tags' | 'html-heuristic' | 'manual';
  confidence: Record<string, 'high' | 'medium' | 'low' | 'inferred'>;
  raw_html?: string;
}

export interface ExtractionResult {
  success: boolean;
  data: ExtractedJobData | null;
  error?: string;
  warnings: string[];
  requires_manual_input: boolean;
}

export function validateUrl(url: string): { valid: boolean; error?: string } {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { valid: false, error: 'Only http and https schemes are allowed' };
    }
    const host = parsed.hostname.toLowerCase();
    
    if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '::1') {
      return { valid: false, error: 'Local networks are not allowed' };
    }

    // SSRF protection for IPv4 private subnets
    if (
      /^10\./.test(host) || 
      /^192\.168\./.test(host) || 
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)
    ) {
      return { valid: false, error: 'Private networks are not allowed' };
    }

    return { valid: true };
  } catch (err) {
    return { valid: false, error: 'Invalid URL format' };
  }
}

export function extractFromJsonLd(html: string): Partial<ExtractedJobData> | null {
  const $ = cheerio.load(html);
  const scripts = $('script[type="application/ld+json"]');
  let data: any = null;

  for (const script of scripts) {
    try {
      const parsed = JSON.parse($(script).html() || '{}');
      // Sometimes it's an array of objects
      const items = Array.isArray(parsed) ? parsed : (parsed['@graph'] || [parsed]);
      
      for (const item of items) {
        if (item['@type'] === 'JobPosting') {
          data = item;
          break;
        }
      }
      if (data) break;
    } catch (e) {
      // Ignore parse errors
    }
  }

  if (!data) return null;

  const result: Partial<ExtractedJobData> = {};
  if (data.title || data.name) result.title = data.title || data.name;
  if (data.hiringOrganization && (data.hiringOrganization.name || data.hiringOrganization.legalName)) {
    result.company = data.hiringOrganization.name || data.hiringOrganization.legalName;
  }
  if (data.description) result.description = data.description;
  if (data.employmentType) result.employment_type = Array.isArray(data.employmentType) ? data.employmentType[0] : data.employmentType;
  
  if (data.baseSalary) {
    result.salary_text = typeof data.baseSalary === 'string' ? data.baseSalary : JSON.stringify(data.baseSalary);
  }
  
  if (data.jobLocation && Array.isArray(data.jobLocation) && data.jobLocation.length > 0) {
    const loc = data.jobLocation[0];
    if (loc.address) {
      if (loc.address.addressLocality) result.city = loc.address.addressLocality;
      if (loc.address.addressCountry) result.country = loc.address.addressCountry;
    }
  } else if (data.jobLocation && data.jobLocation.address) {
    if (data.jobLocation.address.addressLocality) result.city = data.jobLocation.address.addressLocality;
    if (data.jobLocation.address.addressCountry) result.country = data.jobLocation.address.addressCountry;
  }

  return result;
}

export function extractFromMetaTags(html: string): Partial<ExtractedJobData> | null {
  const $ = cheerio.load(html);
  const title = $('meta[property="og:title"]').attr('content') || $('meta[name="twitter:title"]').attr('content');
  const description = $('meta[property="og:description"]').attr('content') || $('meta[name="twitter:description"]').attr('content') || $('meta[name="description"]').attr('content');
  
  if (!title && !description) return null;
  
  const result: Partial<ExtractedJobData> = {};
  if (title) result.title = title;
  if (description) result.description = description;
  
  return result;
}

export function extractFromHtml(html: string): Partial<ExtractedJobData> | null {
  const $ = cheerio.load(html);
  const result: Partial<ExtractedJobData> = {};
  
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
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'JobAppAI/1.0 (Job Research Tool)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      signal: controller.signal
    });
    
    clearTimeout(timeout);

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

    if (!response.ok) {
      return {
        success: false,
        data: null,
        error: `Failed to fetch URL: ${response.status} ${response.statusText}`,
        warnings: [],
        requires_manual_input: true
      };
    }

    const html = await response.text();
    
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

    return {
      success: true,
      data: resultData,
      warnings: [],
      requires_manual_input: false
    };

  } catch (error: any) {
    return {
      success: false,
      data: null,
      error: error.message || 'Failed to extract from URL',
      warnings: [],
      requires_manual_input: true
    };
  }
}
