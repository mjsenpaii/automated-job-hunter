type StatusTone =
  | 'scored'
  | 'shortlisted'
  | 'review'
  | 'ineligible'
  | 'rejected'
  | 'duplicate'
  | 'error'
  | 'neutral';

const STATUS_MAP: Record<string, { label: string; tone: StatusTone }> = {
  SCORED: { label: 'Scored', tone: 'scored' },
  SCORING_COMPLETED: { label: 'Scored', tone: 'scored' },
  USER_APPROVED: { label: 'Shortlisted', tone: 'shortlisted' },
  SHORTLISTED: { label: 'Shortlisted', tone: 'shortlisted' },
  DISCOVERED: { label: 'Requires review', tone: 'review' },
  INGESTED: { label: 'Requires review', tone: 'review' },
  REQUIRES_REVIEW: { label: 'Requires review', tone: 'review' },
  INELIGIBLE: { label: 'Ineligible', tone: 'ineligible' },
  HARD_REJECTED: { label: 'Hard rejected', tone: 'rejected' },
  REJECTED: { label: 'Rejected', tone: 'rejected' },
  USER_REJECTED: { label: 'Rejected', tone: 'rejected' },
  DUPLICATE: { label: 'Duplicate', tone: 'duplicate' },
  ERROR: { label: 'Error', tone: 'error' },
  NOT_EVALUATED: { label: 'Not evaluated', tone: 'neutral' },
};

export function getStatusPresentation(status: string) {
  const normalized = status.trim().toUpperCase().replace(/\s+/g, '_');
  return (
    STATUS_MAP[normalized] ?? {
      label: status.replace(/_/g, ' ').toLowerCase(),
      tone: 'neutral' as const,
    }
  );
}

export default function StatusBadge({ status }: { status: string }) {
  const presentation = getStatusPresentation(status);
  return (
    <span className={`status-badge status-${presentation.tone}`}>
      <span className="status-marker" aria-hidden="true" />
      {presentation.label}
    </span>
  );
}
