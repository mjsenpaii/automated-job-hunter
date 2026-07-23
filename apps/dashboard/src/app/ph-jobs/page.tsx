import JobCard from '@/components/JobCard';

export default function PHJobsPage() {
  const phJobs = [
    {
      id: 'ph-1',
      title: 'Senior Frontend Developer',
      company: 'Manila Tech Hub',
      location: 'BGC, Taguig',
      setup: 'Hybrid',
      score: 89,
      status: 'Review',
      postedAt: '1h ago',
      salary: '₱120k - ₱180k'
    },
    {
      id: 'ph-2',
      title: 'Full Stack Engineer',
      company: 'Fintech PH',
      location: 'Makati',
      setup: 'Onsite',
      score: 76,
      status: 'Pending',
      postedAt: '4h ago',
      salary: '₱90k - ₱140k'
    },
    {
      id: 'ph-3',
      title: 'React Developer',
      company: 'Outsource Pro',
      location: 'Cebu City',
      setup: 'Remote',
      score: 91,
      status: 'Shortlisted',
      postedAt: '1d ago',
      salary: '₱100k - ₱150k'
    },
    {
      id: 'ph-4',
      title: 'Web Developer',
      company: 'Local Agency',
      location: 'Quezon City',
      setup: 'Hybrid',
      score: 64,
      status: 'Rejected',
      postedAt: '2d ago',
      salary: '₱60k - ₱80k'
    }
  ];

  return (
    <div className="animate-fade-in">
      <header className="mb-6 flex justify-between items-center">
        <div>
          <h1>Philippine Jobs</h1>
          <p>Local opportunities sorted by AI match score</p>
        </div>
        <div className="flex gap-4">
          <select className="glass-card" style={{ padding: '0.5rem 1rem', outline: 'none', color: 'var(--text-primary)' }}>
            <option value="score">Sort by Score</option>
            <option value="recent">Sort by Recent</option>
          </select>
        </div>
      </header>

      <div className="grid grid-cols-3 lg-grid-cols-2 md-grid-cols-1 gap-6">
        {phJobs.map(job => (
          <JobCard key={job.id} job={job} />
        ))}
      </div>
    </div>
  );
}
