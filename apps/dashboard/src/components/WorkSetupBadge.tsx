export default function WorkSetupBadge({ setup }: { setup: string }) {
  let bgColor = 'rgba(255, 255, 255, 0.1)';
  let color = 'var(--text-secondary)';

  switch (setup.toLowerCase()) {
    case 'remote':
      bgColor = 'rgba(59, 130, 246, 0.15)';
      color = 'var(--accent-primary)';
      break;
    case 'hybrid':
      bgColor = 'rgba(139, 92, 246, 0.15)';
      color = 'var(--status-interview)';
      break;
    case 'onsite':
      bgColor = 'rgba(245, 158, 11, 0.15)';
      color = 'var(--status-pending)';
      break;
  }

  return (
    <span className="badge" style={{ backgroundColor: bgColor, color }}>
      {setup}
    </span>
  );
}
