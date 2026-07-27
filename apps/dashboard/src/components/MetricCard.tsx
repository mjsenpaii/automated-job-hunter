import { AppIcon, type AppIconName } from './icons';

export function MetricCard({
  label,
  value,
  detail,
  icon,
  tone = 'neutral',
}: {
  label: string;
  value: number | string;
  detail: string;
  icon: AppIconName;
  tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger';
}) {
  return (
    <article className={`metric-card metric-${tone}`}>
      <div className="metric-icon">
        <AppIcon name={icon} size={19} />
      </div>
      <div>
        <p className="metric-label">{label}</p>
        <p className="metric-value">{value}</p>
        <p className="metric-detail">{detail}</p>
      </div>
    </article>
  );
}
