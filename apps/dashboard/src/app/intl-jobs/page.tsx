import JobCard from '@/components/JobCard';

export default function IntlJobsPage() {
  const intlJobs = [
    {
      id: 'intl-1',
      title: 'Senior React Developer',
      company: 'US Startup Inc.',
      location: 'San Francisco, CA',
      setup: 'Remote',
      score: 95,
      status: 'Interview',
      postedAt: '2h ago',
      salary: '$120k - $160k USD'
    },
    {
      id: 'intl-2',
      title: 'Frontend Tech Lead',
      company: 'Euro FinTech',
      location: 'London, UK',
      setup: 'Remote',
      score: 88,
      status: 'Shortlisted',
      postedAt: '1d ago',
      salary: '£80k - £110k GBP'
    },
    {
      id: 'intl-3',
      title: 'Full Stack Engineer',
      company: 'Aussie SaaS',
      location: 'Sydney, AU',
      setup: 'Remote',
      score: 82,
      status: 'Review',
      postedAt: '3d ago',
      salary: '$100k - $130k AUD'
    }
  ];

  return (
    <div className="animate-fade-in">
      <header className="mb-6 flex justify-between items-center">
        <div>
          <h1>International Jobs</h1>
          <p>Remote opportunities from global companies</p>
        </div>
        <div className="flex gap-4">
          <select className="glass-card" style={{ padding: '0.5rem 1rem', outline: 'none', color: 'var(--text-primary)' }}>
            <option value="score">Sort by Score</option>
            <option value="recent">Sort by Recent</option>
          </select>
        </div>
      </header>

      <div className="grid grid-cols-3 lg-grid-cols-2 md-grid-cols-1 gap-6">
        {intlJobs.map(job => (
          <JobCard key={job.id} job={job} />
        ))}
      </div>
    </div>
  );
}
