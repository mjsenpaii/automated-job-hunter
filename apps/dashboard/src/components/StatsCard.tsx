import React from 'react';

export default function StatsCard({ 
  title, 
  value, 
  icon,
  trend,
  trendUp
}: { 
  title: string; 
  value: string | number; 
  icon?: React.ReactNode;
  trend?: string;
  trendUp?: boolean;
}) {
  return (
    <div className="glass-card stat-card">
      <div className="stat-header">
        <h3 className="stat-title">{title}</h3>
        {icon && <div className="stat-icon">{icon}</div>}
      </div>
      <div className="stat-value">{value}</div>
      {trend && (
        <div className={`stat-trend ${trendUp ? 'trend-up' : 'trend-down'}`}>
          {trendUp ? '↑' : '↓'} {trend}
        </div>
      )}

      <style>{`
        .stat-card {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        
        .stat-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .stat-title {
          font-size: 0.875rem;
          color: var(--text-secondary);
          margin: 0;
          font-weight: 500;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .stat-icon {
          color: var(--accent-primary);
          background: rgba(59, 130, 246, 0.1);
          padding: 0.5rem;
          border-radius: 8px;
          display: flex;
        }

        .stat-value {
          font-size: 2rem;
          font-weight: 700;
          color: var(--text-primary);
        }

        .stat-trend {
          font-size: 0.875rem;
          font-weight: 500;
        }
        
        .trend-up {
          color: var(--status-approved);
        }
        
        .trend-down {
          color: var(--status-rejected);
        }
      `}</style>
    </div>
  );
}
