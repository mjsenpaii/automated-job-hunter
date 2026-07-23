import StatsCard from '@/components/StatsCard';
import JobCard from '@/components/JobCard';

export default function DashboardHome() {
  const mockRecentJobs = [
    {
      id: '1',
      title: 'Senior Frontend Engineer',
      company: 'TechCorp PH',
      location: 'Manila, Philippines',
      setup: 'Hybrid',
      score: 88,
      status: 'Review',
      postedAt: '2h ago'
    },
    {
      id: '2',
      title: 'Full Stack Developer',
      company: 'Global Startup',
      location: 'San Francisco, CA',
      setup: 'Remote',
      score: 92,
      status: 'Applied',
      postedAt: '1d ago'
    },
    {
      id: '3',
      title: 'React Native Developer',
      company: 'Mobile Solutions',
      location: 'Cebu, Philippines',
      setup: 'Onsite',
      score: 72,
      status: 'Pending',
      postedAt: '3d ago'
    }
  ];

  return (
    <div className="animate-fade-in">
      <header className="mb-6">
        <h1>Dashboard</h1>
        <p>Overview of your job application pipeline</p>
      </header>

      <div className="grid grid-cols-4 lg-grid-cols-2 md-grid-cols-1 gap-6 mb-6">
        <StatsCard 
          title="Total Jobs Scraped" 
          value="1,284" 
          trend="12% vs last week"
          trendUp={true}
          icon={
            <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          }
        />
        <StatsCard 
          title="Shortlisted" 
          value="42" 
          trend="5 new today"
          trendUp={true}
          icon={
            <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          }
        />
        <StatsCard 
          title="Applied" 
          value="18" 
          trend="2 awaiting response"
          trendUp={true}
          icon={
            <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          }
        />
        <StatsCard 
          title="Average Score" 
          value="84" 
          trend="top 15% of market"
          trendUp={true}
          icon={
            <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          }
        />
      </div>

      <section>
        <div className="flex justify-between items-center mb-4">
          <h2>Recent High-Scoring Jobs</h2>
          <button className="btn btn-outline" style={{ padding: '0.5rem 1rem' }}>View All</button>
        </div>
        
        <div className="grid grid-cols-3 lg-grid-cols-2 md-grid-cols-1 gap-6">
          {mockRecentJobs.map(job => (
            <JobCard key={job.id} job={job} />
          ))}
        </div>
      </section>
    </div>
  );
}
