export default function FactorChart({ factors }: { factors: Record<string, number> }) {
  return (
    <div className="factor-chart">
      {Object.entries(factors).map(([factor, score]) => {
        let color = 'var(--score-poor)';
        if (score >= 85) color = 'var(--score-excellent)';
        else if (score >= 75) color = 'var(--score-good)';
        else if (score >= 65) color = 'var(--score-average)';

        return (
          <div key={factor} className="factor-row">
            <div className="factor-label">
              <span className="factor-name">{factor.replace(/_/g, ' ')}</span>
              <span className="factor-score" style={{ color }}>{score}/100</span>
            </div>
            <div className="factor-bar-bg">
              <div 
                className="factor-bar-fill" 
                style={{ 
                  width: `${score}%`,
                  backgroundColor: color
                }} 
              />
            </div>
          </div>
        );
      })}

      <style>{`
        .factor-chart {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          width: 100%;
        }

        .factor-row {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .factor-label {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 0.875rem;
        }

        .factor-name {
          color: var(--text-secondary);
          text-transform: capitalize;
        }

        .factor-score {
          font-weight: 600;
        }

        .factor-bar-bg {
          height: 8px;
          background-color: var(--glass-border);
          border-radius: 4px;
          overflow: hidden;
        }

        .factor-bar-fill {
          height: 100%;
          border-radius: 4px;
          transition: width 1s ease-out;
        }
      `}</style>
    </div>
  );
}
