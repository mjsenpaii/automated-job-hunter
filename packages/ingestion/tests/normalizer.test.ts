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
});
