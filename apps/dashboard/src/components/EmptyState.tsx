import Link from 'next/link';
import { AppIcon, type AppIconName } from './icons';

export function EmptyState({
  title,
  description,
  actionLabel,
  actionHref,
  icon = 'briefcase',
}: {
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
  icon?: AppIconName;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <AppIcon name={icon} />
      </span>
      <h2>{title}</h2>
      <p>{description}</p>
      {actionLabel && actionHref && (
        <Link href={actionHref} className="button button-primary">
          {actionLabel}
          <AppIcon name="arrowRight" size={17} />
        </Link>
      )}
    </div>
  );
}
