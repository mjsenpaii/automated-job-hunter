import { ResumeDocument, ResumeProfile } from './types';
import { profiles } from './profiles';
import {
  generateHeader,
  generateSummary,
  generateExperience,
  generateSkills,
  generateEducation,
  generateProjects,
  generateCertifications
} from './section-generators';

export function mapProfileToResume(
  candidateData: any,
  resumeProfileId: string,
  jobDescription?: string
): ResumeDocument {
  const resumeProfile = profiles[resumeProfileId];
  if (!resumeProfile) {
    throw new Error(`Profile ${resumeProfileId} not found`);
  }

  const sections: any[] = [];

  resumeProfile.section_order.forEach(sectionName => {
    switch (sectionName) {
      case 'Header':
        sections.push(generateHeader(candidateData));
        break;
      case 'Summary':
        sections.push(generateSummary(candidateData, resumeProfile));
        break;
      case 'Experience':
        sections.push(generateExperience(candidateData.experiences || [], resumeProfile));
        break;
      case 'Projects':
        sections.push(generateProjects(candidateData.projects || [], resumeProfile));
        break;
      case 'Skills':
        // If jobDescription is provided, you would theoretically reorder here
        // For now, we rely on generateSkills sorting logic
        sections.push(generateSkills(candidateData.skills || [], resumeProfile));
        break;
      case 'Education':
        sections.push(generateEducation(candidateData.education || []));
        break;
      case 'Certifications':
        sections.push(generateCertifications(candidateData.certifications || []));
        break;
    }
  });

  return {
    profileId: resumeProfileId,
    sections
  };
}
