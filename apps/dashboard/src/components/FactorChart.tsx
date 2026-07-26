export interface FactorDatum {
  /** Human-readable factor label. */
  name: string;
  /** Actual persisted points scored for this factor. */
  value: number;
  /** Maximum points this factor can contribute (100-point model). */
  max: number;
}

/**
 * Renders factor bars from ACTUAL persisted scoring results. Each factor is
 * shown against its real maximum (e.g. `18/25`), not a fabricated `/100`.
 */
export default function FactorChart({ factors }: { factors: FactorDatum[] }) {
  return (
    <div className="factor-chart">
      {factors.map(({ name, value, max }) => {
        const pct = max > 0 ? Math.round((value / max) * 100) : 0;
        let color = 'var(--score-poor)';
        if (pct >= 85) color = 'var(--score-excellent)';
        else if (pct >= 75) color = 'var(--score-good)';
        else if (pct >= 65) color = 'var(--score-average)';

        return (
          <div key={name} className="factor-row">
            <div className="factor-label">
              <span className="factor-name">{name}</span>
              <span className="factor-score" style={{ color }}>{value}/{max}</span>
            </div>
            <div className="factor-bar-bg">
              <div 
                className="factor-bar-fill" 
                style={{ 
                  width: `${pct}%`,
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
