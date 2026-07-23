import { describe, it, expect } from 'vitest';
import { createApplicationPackage, selectBestProfile } from '../src/package-builder';

describe('package-builder', () => {
  it('creates an application package', () => {
    const pkg = createApplicationPackage({
      jobId: 'job-123',
      jobTitle: 'Software Engineer',
      company: 'Tech Corp',
      resumeProfileId: 'software-developer'
    });
    
    expect(pkg.id).toBeDefined();
    expect(pkg.job_id).toBe('job-123');
    expect(pkg.status).toBe('DRAFT');
    expect(pkg.resume_profile_id).toBe('software-developer');
  });

  it('selects software-developer for dev jobs', () => {
    const profile = selectBestProfile('Frontend Developer', 'Looking for React skills');
    expect(profile).toBe('software-developer');
  });

  it('selects technical-support for support jobs', () => {
    const profile = selectBestProfile('IT Support Specialist', 'Troubleshooting hardware and software');
    expect(profile).toBe('technical-support');
  });

  it('defaults to software-developer if unclear', () => {
    const profile = selectBestProfile('Manager', 'Manage team of 5');
    expect(profile).toBe('software-developer');
  });
});
