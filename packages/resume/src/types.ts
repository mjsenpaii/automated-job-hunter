export interface ResumeProfile {
  id: string;
  name: string;
  target_roles: string[];
  priority_skills: string[];
  section_order: string[];
  summary_template: string;
}

export interface SectionContentItem {
  [key: string]: any;
}

export interface ResumeSection {
  title: string;
  items: SectionContentItem[];
  type?: string;
}

export interface ResumeDocument {
  profileId: string;
  sections: ResumeSection[];
}

export interface QualityGateResult {
  pass: boolean;
  reasons: string[];
}
