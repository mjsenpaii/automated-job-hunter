export interface QualityGateResult {
  passed: boolean;
  score: number;
  details: string;
}

export interface ApplicationPackage {
  id: string;
  job_id: string;
  job_title: string;
  company: string;
  status: 'DRAFT' | 'DOCUMENTS_READY' | 'REVIEWED' | 'USER_APPROVED' | 'SUBMITTED' | 'WITHDRAWN';
  resume_profile_id: string;
  resume_path: string | null;
  cover_letter_path: string | null;
  application_answers: Record<string, string>;
  quality_gate_results: QualityGateResult[];
  created_at: string;
  updated_at: string;
  notes: string[];
}

export interface ApplicationAction {
  action: 'CREATE' | 'GENERATE_DOCS' | 'REVIEW' | 'APPROVE' | 'SUBMIT' | 'WITHDRAW';
  performed_by: 'SYSTEM' | 'USER';
  timestamp: string;
  details: string;
}
