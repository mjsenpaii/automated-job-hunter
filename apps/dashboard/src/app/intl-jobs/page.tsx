'use client';

import { useState, useEffect } from 'react';
import JobCard from '@/components/JobCard';

export default function IntlJobsPage() {
  const [intlJobs, setIntlJobs] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/jobs')
      .then(res => res.json())
      .then(data => {
        const formattedJobs = data
          .filter((j: any) => j.job.category === 'INTERNATIONAL' || (j.job.country && j.job.country?.toLowerCase() !== 'philippines'))
          .map((j: any) => ({
            id: j.job.id,
            title: j.job.title,
            company: j.job.company,
            location: [j.job.city, j.job.country].filter(Boolean).join(', ') || 'International',
            setup: j.job.work_setup,
            score: j.score?.score || 0,
            status: j.job.status,
            postedAt: new Date(j.job.date_posted).toLocaleDateString(),
            salary: j.job.salary_min ? `$${j.job.salary_min.toLocaleString()}` : undefined
          }));
        setIntlJobs(formattedJobs);
      })
      .catch(console.error);
  }, []);

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
        {intlJobs.length === 0 && (
          <div className="col-span-3 text-center text-gray-500 py-8">
            No International jobs found.
          </div>
        )}
      </div>
    </div>
  );
}
