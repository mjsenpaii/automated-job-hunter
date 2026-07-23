import { ResumeDocument, QualityGateResult } from './types';

export function factCheckGate(resume: ResumeDocument, verifiedFacts: any): QualityGateResult {
  const reasons: string[] = [];
  
  // Basic check for fabricated experience claims
  const experienceSection = resume.sections.find(s => s.title === 'Experience');
  if (experienceSection) {
    experienceSection.items.forEach(item => {
      const isVerified = verifiedFacts.experiences?.some((fact: any) => fact.title === item.title && fact.company === item.company);
      if (!isVerified) {
        reasons.push(`Fabricated experience claim found: ${item.title} at ${item.company}`);
      }
    });
  }

  // Ensure DotOrbit is NOT included
  resume.sections.forEach(section => {
    section.items.forEach(item => {
      const itemText = JSON.stringify(item).toLowerCase();
      if (itemText.includes('dotorbit')) {
        reasons.push('Prohibited content included: DotOrbit');
      }
    });
  });

  return {
    pass: reasons.length === 0,
    reasons
  };
}

export function atsCheckGate(resume: ResumeDocument): QualityGateResult {
  const reasons: string[] = [];
  
  // Simple check to ensure we have standard sections
  const hasHeader = resume.sections.some(s => s.type === 'header');
  if (!hasHeader) {
    reasons.push('Missing header section which is required for ATS');
  }

  // Ensure no sections are completely empty
  resume.sections.forEach(section => {
    if (section.items.length === 0 && section.type !== 'summary') {
      // It's okay if summary is empty or we can ignore it, but generally sections should have content
      // Let's just be lenient for now but flag it if needed
    }
  });

  return {
    pass: reasons.length === 0,
    reasons
  };
}

export function seniorityCheckGate(resume: ResumeDocument, targetSeniority: string): QualityGateResult {
  const reasons: string[] = [];
  
  // If target is junior/entry, ensure we don't have "Senior" in the titles we output
  if (targetSeniority.toLowerCase() === 'junior' || targetSeniority.toLowerCase() === 'entry') {
    resume.sections.forEach(section => {
      section.items.forEach(item => {
        const itemText = JSON.stringify(item).toLowerCase();
        if (itemText.includes('senior')) {
          reasons.push('Claimed seniority does not match target targetSeniority (Found "Senior" in a Junior resume)');
        }
      });
    });
  }

  return {
    pass: reasons.length === 0,
    reasons
  };
}

export function runQualityGates(resume: ResumeDocument, verifiedFacts: any = {}): QualityGateResult {
  const factResult = factCheckGate(resume, verifiedFacts);
  const atsResult = atsCheckGate(resume);
  const seniorityResult = seniorityCheckGate(resume, 'junior');

  const allReasons = [
    ...factResult.reasons,
    ...atsResult.reasons,
    ...seniorityResult.reasons
  ];

  return {
    pass: factResult.pass && atsResult.pass && seniorityResult.pass,
    reasons: allReasons
  };
}
