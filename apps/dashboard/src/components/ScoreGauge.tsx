export default function ScoreGauge({ score, size = 64 }: { score: number, size?: number }) {
  // Determine color based on score
  let colorVar = 'var(--score-poor)';
  if (score >= 85) colorVar = 'var(--score-excellent)';
  else if (score >= 75) colorVar = 'var(--score-good)';
  else if (score >= 65) colorVar = 'var(--score-average)';

  const radius = (size - 8) / 2;
  const circumference = radius * 2 * Math.PI;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  return (
    <div className="score-gauge" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="var(--glass-border)"
          strokeWidth="6"
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colorVar}
          strokeWidth="6"
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 1s ease-out' }}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="score-text" style={{ color: colorVar }}>
        {score}
      </div>

      <style>{`
        .score-gauge {
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }

        .score-text {
          position: absolute;
          font-weight: 700;
          font-size: ${size / 3}px;
        }
      `}</style>
    </div>
  );
}
