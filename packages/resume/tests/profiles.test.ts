import { describe, it, expect } from 'vitest';
import { profiles } from '../src/profiles';

describe('Profiles', () => {
  it('should define software-developer profile', () => {
    const profile = profiles['software-developer'];
    expect(profile).toBeDefined();
    expect(profile.id).toBe('software-developer');
    expect(profile.name).toBe('Software Developer');
    expect(profile.target_roles.length).toBeGreaterThan(0);
    expect(profile.priority_skills.length).toBeGreaterThan(0);
    expect(profile.section_order.length).toBeGreaterThan(0);
    expect(profile.summary_template).toBeDefined();
  });

  it('should define technical-support profile', () => {
    const profile = profiles['technical-support'];
    expect(profile).toBeDefined();
    expect(profile.id).toBe('technical-support');
    expect(profile.name).toBe('Technical Support');
    expect(profile.target_roles.length).toBeGreaterThan(0);
    expect(profile.priority_skills.length).toBeGreaterThan(0);
    expect(profile.section_order.length).toBeGreaterThan(0);
    expect(profile.summary_template).toBeDefined();
  });
});
