import Link from 'next/link';
import ScoreGauge from './ScoreGauge';
import StatusBadge from './StatusBadge';
import WorkSetupBadge from './WorkSetupBadge';

interface Job {
  id: string;
  title: string;
  company: string;
  location: string;
  setup: string;
  salary?: string;
  score: number;
  status: string;
  postedAt: string;
}

export default function JobCard({ job }: { job: Job }) {
  return (
    <Link href={`/jobs/${job.id}`} className="job-card-link">
      <div className="glass-card job-card">
        <div className="job-card-header">
          <div className="job-info">
            <h3 className="job-title">{job.title}</h3>
            <p className="job-company">{job.company}</p>
          </div>
          <ScoreGauge score={job.score} size={48} />
        </div>
        
        <div className="job-card-body">
          <div className="job-meta">
            <span>{job.location}</span>
            {job.salary && <span>• {job.salary}</span>}
            <span>• {job.postedAt}</span>
          </div>
          
          <div className="job-badges">
            <WorkSetupBadge setup={job.setup} />
            <StatusBadge status={job.status} />
          </div>
        </div>
      </div>

      <style>{`
        .job-card-link {
          display: block;
          text-decoration: none;
        }

        .job-card {
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
          height: 100%;
        }

        .job-card-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 1rem;
        }

        .job-info {
          flex: 1;
        }

        .job-title {
          font-size: 1.125rem;
          color: var(--text-primary);
          margin-bottom: 0.25rem;
          line-height: 1.3;
        }

        .job-company {
          font-size: 0.875rem;
          color: var(--text-secondary);
          margin: 0;
        }

        .job-card-body {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          margin-top: auto;
        }

        .job-meta {
          font-size: 0.75rem;
          color: var(--text-muted);
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
        }

        .job-badges {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
        }
      `}</style>
    </Link>
  );
}
