import { ApplicationAction } from './types';

const VALID_TRANSITIONS: Record<string, string[]> = {
  'DRAFT': ['DOCUMENTS_READY', 'WITHDRAWN'],
  'DOCUMENTS_READY': ['REVIEWED', 'WITHDRAWN'],
  'REVIEWED': ['USER_APPROVED', 'WITHDRAWN'],
  'USER_APPROVED': ['SUBMITTED', 'WITHDRAWN'],
  'SUBMITTED': ['WITHDRAWN'],
  'WITHDRAWN': []
};

export function getApplicationTimeline(actions: ApplicationAction[]): string {
  return actions
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    .map(a => `[${new Date(a.timestamp).toLocaleString()}] ${a.performed_by}: ${a.action} - ${a.details}`)
    .join('\n');
}

export function validateStateTransition(current: string, next: string): boolean {
  if (current === next) return true;
  return VALID_TRANSITIONS[current]?.includes(next) || false;
}

export function getNextActions(status: string): string[] {
  return VALID_TRANSITIONS[status] || [];
}
