import { ResumeProfile, ResumeSection } from './types';

export function generateHeader(profile: any): ResumeSection {
  return {
    title: 'Header',
    type: 'header',
    items: [{
      name: 'Mark John B. Matining',
      location: 'Pili, Boac, Marinduque, Philippines',
      email: 'matiningmj850@gmail.com',
      phone: '09482058702',
      links: [
        { label: 'GitHub', url: 'https://github.com/mjsenpaii' },
        { label: 'LinkedIn', url: 'https://www.linkedin.com/in/mend4x/' }
      ]
    }]
  };
}

export function generateSummary(profile: any, resumeProfile: ResumeProfile): ResumeSection {
  const topSkills = resumeProfile.priority_skills.slice(0, 3).join(', ');
  const summaryText = resumeProfile.summary_template.replace('{top_skills}', topSkills);
  return {
    title: 'Summary',
    type: 'summary',
    items: [{ text: summaryText }]
  };
}

export function generateExperience(experiences: any[], resumeProfile: ResumeProfile): ResumeSection {
  const formattedExperiences = experiences.map(exp => ({
    title: exp.title,
    company: exp.company,
    date: exp.date,
    description: exp.description,
    type: exp.type || 'professional'
  }));

  return {
    title: 'Experience',
    type: 'experience',
    items: formattedExperiences
  };
}

export function generateSkills(skills: string[], resumeProfile: ResumeProfile): ResumeSection {
  // Sort skills based on profile priority
  const prioritizedSkills = [...skills].sort((a, b) => {
    const aIndex = resumeProfile.priority_skills.indexOf(a);
    const bIndex = resumeProfile.priority_skills.indexOf(b);
    if (aIndex === -1 && bIndex === -1) return 0;
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  });

  return {
    title: 'Skills',
    type: 'skills',
    items: prioritizedSkills.map(skill => ({ name: skill }))
  };
}

export function generateEducation(education: any[]): ResumeSection {
  return {
    title: 'Education',
    type: 'education',
    items: education.map(edu => ({
      degree: edu.degree,
      institution: edu.institution,
      date: edu.date
    }))
  };
}

export function generateProjects(projects: any[], resumeProfile: ResumeProfile): ResumeSection {
  return {
    title: 'Projects',
    type: 'projects',
    items: projects.map(proj => ({
      name: proj.name,
      description: proj.description,
      technologies: proj.technologies
    }))
  };
}

export function generateCertifications(certifications: any[]): ResumeSection {
  return {
    title: 'Certifications',
    type: 'certifications',
    items: certifications.map(cert => ({
      name: cert.name,
      issuer: cert.issuer,
      date: cert.date
    }))
  };
}
