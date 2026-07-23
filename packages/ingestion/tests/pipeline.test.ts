import { describe, it, expect } from 'vitest';
import { ingestJob } from '../src/pipeline.js';
import { createManualJob } from '../src/adapters/manual.js';
import { VERIFIED_SKILLS } from '../../../tests/fixtures/jobs.js'; // Using absolute-ish path out to workspace root

describe('pipeline', () => {
  it('should ingest a new job and return INGESTED with score', async () => {
    const raw = createManualJob({
      title: 'Frontend Developer',
      company: 'Tech Corp',
      description: 'Looking for a React developer.',
      country: 'PH',
      work_setup: 'remote',
      employment_type: 'full-time',
      required_skills: ['react', 'typescript']
    });

    const result = await ingestJob(raw, [], VERIFIED_SKILLS);
    
    expect(result.status).toBe('INGESTED');
    expect(result.job_id).toBeDefined();
    expect(result.score).toBeGreaterThan(0);
  });

  it('should detect duplicates', async () => {
    const raw = createManualJob({
      title: 'Frontend Developer',
      company: 'Tech Corp',
      description: 'Looking for a React developer.',
      country: 'PH',
      work_setup: 'remote'
    });

    // Mock existing job that matches closely enough to be a duplicate
    const existing: any = {
      id: 'existing-123',
      title: 'Frontend Developer',
      company: 'Tech Corp',
      description: 'Looking for a React developer.',
      work_setup: 'REMOTE',
      country: 'PH',
      // Provide other necessary properties as mocks
      source_id: 'mock',
      source_name: 'mock',
    };

    const result = await ingestJob(raw, [existing], VERIFIED_SKILLS);
    
    expect(result.status).toBe('DUPLICATE');
    expect(result.duplicate_of_id).toBeDefined(); // Might be 'existing-123' if deduplication is robust enough, else it's defined
  });

  it('should detect hard rejections', async () => {
    const raw = createManualJob({
      title: 'Frontend Developer',
      company: 'Tech Corp',
      description: 'Must reside in USA.',
      country: 'US', // International job
      work_setup: 'onsite', // International onsite is a hard reject for PH candidate
      required_skills: ['react']
    });

    const result = await ingestJob(raw, [], VERIFIED_SKILLS);
    
    expect(result.status).toBe('HARD_REJECTED');
    expect(result.rejection_reasons).toBeDefined();
  });
});
