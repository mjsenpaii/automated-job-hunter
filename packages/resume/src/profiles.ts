import { ResumeProfile } from './types';

export const profiles: Record<string, ResumeProfile> = {
  'software-developer': {
    id: 'software-developer',
    name: 'Software Developer',
    target_roles: ['Software Engineer', 'Full Stack Developer', 'Mobile Developer', 'Backend Developer'],
    priority_skills: ['TypeScript', 'Flutter/Dart', 'FlutterFlow', 'Supabase', 'JavaScript', 'HTML/CSS', 'Java', 'API Development', 'Microservices', 'Figma/UI-UX Design'],
    section_order: ['Header', 'Summary', 'Experience', 'Projects', 'Skills', 'Education', 'Certifications'],
    summary_template: 'Results-driven software developer with hands-on experience in building microservices and mobile applications. Proficient in {top_skills}. Proven track record of delivering impactful solutions, including award-winning projects.',
  },
  'technical-support': {
    id: 'technical-support',
    name: 'Technical Support',
    target_roles: ['IT Support Specialist', 'Technical Support Engineer', 'Helpdesk Support'],
    priority_skills: ['IT support', 'networking', 'cybersecurity', 'hardware', 'troubleshooting', 'TypeScript', 'Java'],
    section_order: ['Header', 'Summary', 'Skills', 'Experience', 'Education', 'Certifications', 'Projects'],
    summary_template: 'Detail-oriented IT professional with a strong foundation in hardware, troubleshooting, and networking. Experienced in technical problem solving and maintaining system integrity, with a solid academic background in Information Technology.',
  }
};
