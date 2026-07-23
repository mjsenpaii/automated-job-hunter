'use client';

import { useState, useEffect } from 'react';
import StatsCard from '@/components/StatsCard';
import JobCard from '@/components/JobCard';

export default function DashboardHome() {
  const [stats, setStats] = useState<any>(null);
  const [jobs, setJobs] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/stats')
      .then(res => res.json())
      .then(data => setStats(data))
      .catch(console.error);

    fetch('/api/jobs')
      .then(res => res.json())
      .then(data => {
        const formattedJobs = data.map((j: any) => ({
          id: j.job.id,
          title: j.job.title,
          company: j.job.company,
          location: [j.job.city, j.job.country].filter(Boolean).join(', ') || 'Anywhere',
          setup: j.job.work_setup,
          score: j.score?.score || 0,
          status: j.job.status,
          postedAt: new Date(j.job.date_posted).toLocaleDateString()
        }));
        setJobs(formattedJobs.slice(0, 6));
      })
      .catch(console.error);
  }, []);

  return (
    <div className="animate-fade-in">
      <header className="mb-6">
        <h1>Dashboard</h1>
        <p>Overview of your job application pipeline</p>
      </header>

      <div className="grid grid-cols-4 lg-grid-cols-2 md-grid-cols-1 gap-6 mb-6">
        <StatsCard 
          title="Total Jobs Scraped" 
          value={stats?.totalJobs?.toLocaleString() || "0"} 
          trend="Real-time data"
          trendUp={true}
          icon={
            <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          }
        />
        <StatsCard 
          title="Shortlisted" 
          value={stats?.shortlistedJobs?.toString() || "0"} 
          trend="USER_APPROVED"
          trendUp={true}
          icon={
            <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          }
        />
        <StatsCard 
          title="Applied" 
          value={stats?.appliedJobs?.toString() || "0"} 
          trend="Applications sent"
          trendUp={true}
          icon={
            <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          }
        />
        <StatsCard 
          title="Average Score" 
          value={stats?.averageScore?.toString() || "0"} 
          trend="Overall match"
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
          {jobs.map(job => (
            <JobCard key={job.id} job={job} />
          ))}
          {jobs.length === 0 && (
            <div className="col-span-3 text-center text-gray-500 py-8">
              No jobs found. Go to Add Job to ingest some data.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
