import { describe, it, expect } from 'vitest';
import { generateHeader, generateSummary, generateExperience, generateSkills, generateEducation, generateProjects, generateCertifications } from '../src/section-generators';
import { profiles } from '../src/profiles';

describe('Section Generators', () => {
  const profile = profiles['software-developer'];

  it('should generate header correctly', () => {
    const header = generateHeader({});
    expect(header.title).toBe('Header');
    expect(header.items[0].name).toBe('Mark John B. Matining');
  });

  it('should generate summary correctly', () => {
    const summary = generateSummary({}, profile);
    expect(summary.title).toBe('Summary');
    expect(summary.items[0].text).toContain(profile.priority_skills[0]);
  });

  it('should generate experience correctly', () => {
    const experiences = [{ title: 'Dev', company: 'Tech', date: '2026', description: 'desc' }];
    const exp = generateExperience(experiences, profile);
    expect(exp.title).toBe('Experience');
    expect(exp.items.length).toBe(1);
    expect(exp.items[0].title).toBe('Dev');
  });

  it('should generate skills correctly based on priority', () => {
    const skills = ['Java', 'TypeScript', 'NotRelevant'];
    const generated = generateSkills(skills, profile);
    expect(generated.title).toBe('Skills');
    // TypeScript has higher priority than Java in software-developer profile
    expect(generated.items[0].name).toBe('TypeScript');
    expect(generated.items[1].name).toBe('Java');
    expect(generated.items[2].name).toBe('NotRelevant');
  });

  it('should generate education correctly', () => {
    const edu = [{ degree: 'BS', institution: 'MSU', date: '2026' }];
    const generated = generateEducation(edu);
    expect(generated.title).toBe('Education');
    expect(generated.items.length).toBe(1);
    expect(generated.items[0].degree).toBe('BS');
  });

  it('should generate projects correctly', () => {
    const projects = [{ name: 'HAPAG', description: 'desc', technologies: ['Flutter'] }];
    const generated = generateProjects(projects, profile);
    expect(generated.title).toBe('Projects');
    expect(generated.items.length).toBe(1);
    expect(generated.items[0].name).toBe('HAPAG');
  });

  it('should generate certifications correctly', () => {
    const certs = [{ name: 'Code Master', issuer: 'DOST', date: '2026' }];
    const generated = generateCertifications(certs);
    expect(generated.title).toBe('Certifications');
    expect(generated.items.length).toBe(1);
    expect(generated.items[0].name).toBe('Code Master');
  });
});
