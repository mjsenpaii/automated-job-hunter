import Link from 'next/link';
import ScoreGauge from '@/components/ScoreGauge';
import StatusBadge from '@/components/StatusBadge';
import WorkSetupBadge from '@/components/WorkSetupBadge';
import FactorChart from '@/components/FactorChart';

// Next.js App Router dynamic route params might be slightly different depending on version, 
// using Promise based params for Next.js 15+ compatibility, but string for simple typing
export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  
  // Mock data for the specific job
  const job = {
    id,
    title: 'Senior Frontend Engineer',
    company: 'TechCorp Innovations',
    location: 'Remote (Global)',
    setup: 'Remote',
    salary: '$120,000 - $150,000 USD',
    score: 88,
    status: 'Review',
    postedAt: '2 days ago',
    description: 'We are looking for a Senior Frontend Engineer with deep expertise in React, Next.js, and modern CSS to lead our product development.',
    requirements: [
      '5+ years experience with React and TypeScript',
      'Strong understanding of Next.js App Router',
      'Experience with responsive design and CSS architecture',
      'Familiarity with CI/CD pipelines and testing'
    ],
    factors: {
      skill_match: 92,
      experience_level: 85,
      salary_alignment: 90,
      tech_stack: 95,
      remote_policy: 100,
      company_culture: 80,
      career_growth: 75,
      benefits: 85
    }
  };

  return (
    <div className="animate-fade-in job-detail-page">
      <Link href="/" className="back-link mb-6 inline-block">
        ← Back to Dashboard
      </Link>

      <div className="grid grid-cols-3 lg-grid-cols-1 gap-6">
        <div className="col-span-2 lg-col-span-1">
          <div className="glass-card mb-6">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h1 className="mb-2">{job.title}</h1>
                <h3 className="company-name text-muted">{job.company}</h3>
              </div>
              <ScoreGauge score={job.score} size={80} />
            </div>

            <div className="flex gap-4 flex-wrap mb-8">
              <WorkSetupBadge setup={job.setup} />
              <StatusBadge status={job.status} />
              <span className="badge glass-panel">{job.location}</span>
              <span className="badge glass-panel">{job.salary}</span>
            </div>

            <section className="mb-8">
              <h3>Job Description</h3>
              <p>{job.description}</p>
            </section>

            <section>
              <h3>Requirements</h3>
              <ul className="requirements-list">
                {job.requirements.map((req, i) => (
                  <li key={i}>{req}</li>
                ))}
              </ul>
            </section>
          </div>
        </div>

        <div className="col-span-1">
          <div className="glass-card mb-6">
            <h3 className="mb-4">Match Analysis</h3>
            <FactorChart factors={job.factors} />
          </div>

          <div className="glass-card action-panel">
            <h3 className="mb-4">Actions</h3>
            <div className="flex flex-col gap-3">
              <button className="btn btn-primary w-full">Generate Resume</button>
              <button className="btn btn-outline w-full" style={{ borderColor: 'var(--status-approved)', color: 'var(--status-approved)' }}>
                Approve & Shortlist
              </button>
              <button className="btn btn-outline w-full" style={{ borderColor: 'var(--status-rejected)', color: 'var(--status-rejected)' }}>
                Reject Job
              </button>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .back-link {
          color: var(--text-muted);
          transition: color 0.2s;
        }
        .back-link:hover {
          color: var(--text-primary);
        }
        
        .company-name {
          color: var(--text-secondary);
          font-weight: 500;
        }

        .col-span-2 { grid-column: span 2 / span 2; }
        .col-span-1 { grid-column: span 1 / span 1; }

        @media (max-width: 1024px) {
          .lg-col-span-1 { grid-column: span 1 / span 1; }
        }

        .requirements-list {
          list-style: none;
          padding-left: 0;
        }

        .requirements-list li {
          position: relative;
          padding-left: 1.5rem;
          margin-bottom: 0.75rem;
          color: var(--text-secondary);
        }

        .requirements-list li::before {
          content: '•';
          position: absolute;
          left: 0;
          color: var(--accent-primary);
          font-weight: bold;
          font-size: 1.25rem;
          line-height: 1;
        }

        .w-full { width: 100%; }
      `}</style>
    </div>
  );
}
