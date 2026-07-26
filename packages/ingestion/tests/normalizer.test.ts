import { describe, it, expect } from 'vitest';
import { normalizeJob } from '../src/normalizer.js';
import type { RawJobInput } from '../src/types.js';

describe('normalizer', () => {
  it('should parse salary text correctly', () => {
    const raw: RawJobInput = {
      source_name: 'test',
      title: 'Software Engineer',
      company: 'Test Co',
      description: '...',
      salary_text: '$50,000 - $70,000 /yr'
    };
    const job = normalizeJob(raw);
    expect(job.salary_currency).toBe('USD');
    expect(job.salary_period).toBe('yearly');
    expect(job.salary_min).toBe(50000);
    expect(job.salary_max).toBe(70000);
  });

  it('should map seniority hint', () => {
    const raw: RawJobInput = {
      source_name: 'test',
      title: 'Senior Developer',
      company: 'Test Co',
      description: '...',
      seniority_hint: 'senior'
    };
    const job = normalizeJob(raw);
    expect(job.seniority).toBe('SENIOR');
  });

  it('should map work setup hint', () => {
    const raw: RawJobInput = {
      source_name: 'test',
      title: 'Remote Dev',
      company: 'Test Co',
      description: '...',
      work_setup_hint: 'remote'
    };
    const job = normalizeJob(raw);
    expect(job.work_setup).toBe('REMOTE');
  });

  it('should parse "5+ years" experience requirement from the description', () => {
    const raw: RawJobInput = {
      source_name: 'test',
      title: 'Senior Frontend Engineer',
      company: 'Test Co',
      description: 'We need 5+ years of React and TypeScript experience.',
    };
    const job = normalizeJob(raw);
    expect(job.years_experience_min).toBe(5);
  });

  it('should return the highest stated minimum when several are present', () => {
    const raw: RawJobInput = {
      source_name: 'test',
      title: 'Senior Software Engineer',
      company: 'Test Co',
      description: 'At least 5 years of backend experience. Must have 8+ years with Java.',
    };
    const job = normalizeJob(raw);
    expect(job.years_experience_min).toBe(8);
  });

  it('should NOT invent a years requirement from unrelated numbers', () => {
    const raw: RawJobInput = {
      source_name: 'test',
      title: 'Junior Developer',
      company: 'Test Co',
      description: 'Fresh graduates welcome. We offer HMO and 13th month pay.',
    };
    const job = normalizeJob(raw);
    expect(job.years_experience_min).toBeNull();
  });
});
