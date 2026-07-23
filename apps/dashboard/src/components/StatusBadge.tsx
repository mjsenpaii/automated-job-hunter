export default function StatusBadge({ status }: { status: string }) {
  let bgColor = 'rgba(255, 255, 255, 0.1)';
  let color = 'var(--text-secondary)';

  switch (status.toLowerCase()) {
    case 'approved':
    case 'shortlisted':
      bgColor = 'rgba(16, 185, 129, 0.15)';
      color = 'var(--status-approved)';
      break;
    case 'rejected':
      bgColor = 'rgba(239, 68, 68, 0.15)';
      color = 'var(--status-rejected)';
      break;
    case 'pending':
    case 'review':
      bgColor = 'rgba(245, 158, 11, 0.15)';
      color = 'var(--status-pending)';
      break;
    case 'interview':
      bgColor = 'rgba(139, 92, 246, 0.15)';
      color = 'var(--status-interview)';
      break;
  }

  return (
    <span className="badge" style={{ backgroundColor: bgColor, color }}>
      {status}
    </span>
  );
}
