import { describe, it, expect } from 'vitest';
import { factCheckGate, atsCheckGate, seniorityCheckGate } from '../src/quality-gates';
import { ResumeDocument } from '../src/types';

describe('Quality Gates', () => {
  const verifiedFacts = {
    experiences: [
      { title: 'Freelance Mobile App Developer', company: 'WPDG' },
      { title: 'OJT', company: 'DOST LODIXR Program' }
    ]
  };

  it('factCheckGate should pass for verified facts', () => {
    const resume: ResumeDocument = {
      profileId: 'software-developer',
      sections: [{
        title: 'Experience',
        type: 'experience',
        items: [
          { title: 'Freelance Mobile App Developer', company: 'WPDG' }
        ]
      }]
    };
    const result = factCheckGate(resume, verifiedFacts);
    expect(result.pass).toBe(true);
    expect(result.reasons.length).toBe(0);
  });

  it('factCheckGate should fail for fabricated facts', () => {
    const resume: ResumeDocument = {
      profileId: 'software-developer',
      sections: [{
        title: 'Experience',
        type: 'experience',
        items: [
          { title: 'Senior Dev', company: 'Google' }
        ]
      }]
    };
    const result = factCheckGate(resume, verifiedFacts);
    expect(result.pass).toBe(false);
    expect(result.reasons[0]).toContain('Fabricated experience');
  });

  it('factCheckGate should fail if DotOrbit is included', () => {
    const resume: ResumeDocument = {
      profileId: 'software-developer',
      sections: [{
        title: 'Experience',
        type: 'experience',
        items: [
          { title: 'Ghostwriter', company: 'DotOrbit' }
        ]
      }]
    };
    const result = factCheckGate(resume, verifiedFacts);
    expect(result.pass).toBe(false);
    expect(result.reasons).toContain('Prohibited content included: DotOrbit');
  });

  it('atsCheckGate should pass if header exists', () => {
    const resume: ResumeDocument = {
      profileId: 'software-developer',
      sections: [{
        title: 'Header',
        type: 'header',
        items: [{ name: 'Test' }]
      }]
    };
    const result = atsCheckGate(resume);
    expect(result.pass).toBe(true);
  });

  it('atsCheckGate should fail if header is missing', () => {
    const resume: ResumeDocument = {
      profileId: 'software-developer',
      sections: [{
        title: 'Experience',
        type: 'experience',
        items: []
      }]
    };
    const result = atsCheckGate(resume);
    expect(result.pass).toBe(false);
    expect(result.reasons).toContain('Missing header section which is required for ATS');
  });

  it('seniorityCheckGate should fail if junior resume has senior title', () => {
    const resume: ResumeDocument = {
      profileId: 'software-developer',
      sections: [{
        title: 'Experience',
        type: 'experience',
        items: [{ title: 'Senior Developer' }]
      }]
    };
    const result = seniorityCheckGate(resume, 'junior');
    expect(result.pass).toBe(false);
    expect(result.reasons[0]).toContain('does not match target targetSeniority');
  });
});
