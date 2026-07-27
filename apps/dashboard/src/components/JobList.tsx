'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { JobListItem } from '@/lib/jobs/view-model';
import { formatPersistedDate } from '@/lib/jobs/view-model';
import { AppIcon } from './icons';
import StatusBadge from './StatusBadge';

const PAGE_SIZE = 25;

export function JobList({
  jobs,
  emptyLabel,
}: {
  jobs: JobListItem[];
  emptyLabel: string;
}) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('ALL');
  const [workSetup, setWorkSetup] = useState('ALL');
  const [sort, setSort] = useState('SCORE');
  const [limit, setLimit] = useState(PAGE_SIZE);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return jobs
      .filter((job) => {
        const text = `${job.title} ${job.company} ${job.location}`.toLowerCase();
        return (
          (!needle || text.includes(needle)) &&
          (status === 'ALL' || job.status === status) &&
          (workSetup === 'ALL' || job.workSetup === workSetup)
        );
      })
      .sort((a, b) => {
        if (sort === 'RECENT') {
          return (b.date ?? '').localeCompare(a.date ?? '');
        }
        if (sort === 'COMPANY') return a.company.localeCompare(b.company);
        return (b.score ?? -1) - (a.score ?? -1);
      });
  }, [jobs, query, sort, status, workSetup]);

  const visible = filtered.slice(0, limit);
  const statuses = [...new Set(jobs.map((job) => job.status))].sort();
  const setups = [...new Set(jobs.map((job) => job.workSetup))].sort();

  return (
    <section className="table-panel" aria-label="Job list">
      <div className="list-toolbar">
        <label className="search-field">
          <span className="visually-hidden">Search jobs</span>
          <AppIcon name="search" size={18} />
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setLimit(PAGE_SIZE);
            }}
            placeholder="Search title, company, or location"
          />
        </label>
        <label>
          <span className="visually-hidden">Filter by status</span>
          <select
            className="select compact-select"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="ALL">All statuses</option>
            {statuses.map((value) => (
              <option value={value} key={value}>
                {value.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="visually-hidden">Filter by work setup</span>
          <select
            className="select compact-select"
            value={workSetup}
            onChange={(event) => setWorkSetup(event.target.value)}
          >
            <option value="ALL">All work setups</option>
            {setups.map((value) => (
              <option value={value} key={value}>
                {value.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="visually-hidden">Sort jobs</span>
          <select
            className="select compact-select"
            value={sort}
            onChange={(event) => setSort(event.target.value)}
          >
            <option value="SCORE">Highest score</option>
            <option value="RECENT">Most recent</option>
            <option value="COMPANY">Company A–Z</option>
          </select>
        </label>
      </div>

      <div className="list-count" aria-live="polite">
        {filtered.length} {filtered.length === 1 ? 'job' : 'jobs'}
      </div>

      {filtered.length === 0 ? (
        <div className="list-empty">
          <AppIcon name="search" />
          <h2>No matching jobs</h2>
          <p>{query || status !== 'ALL' || workSetup !== 'ALL' ? 'Try clearing a filter.' : emptyLabel}</p>
        </div>
      ) : (
        <>
          <div className="desktop-job-table">
            <table>
              <thead>
                <tr>
                  <th scope="col">Role</th>
                  <th scope="col">Location</th>
                  <th scope="col">Setup</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="numeric">Score</th>
                  <th scope="col">Posted</th>
                  <th scope="col">
                    <span className="visually-hidden">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((job) => (
                  <tr key={job.id}>
                    <td>
                      <Link href={`/jobs/${job.id}`} className="job-title-link">
                        {job.title}
                      </Link>
                      <span className="job-company">{job.company}</span>
                    </td>
                    <td>{job.location}</td>
                    <td>{job.workSetup.replace(/_/g, ' ')}</td>
                    <td>
                      <StatusBadge status={job.status} />
                    </td>
                    <td className="numeric score-table-cell">
                      {job.score ?? '—'}
                    </td>
                    <td>{formatPersistedDate(job.date)}</td>
                    <td>
                      <Link
                        href={`/jobs/${job.id}`}
                        className="row-open"
                        aria-label={`Open ${job.title} at ${job.company}`}
                      >
                        <AppIcon name="arrowRight" size={18} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mobile-job-cards">
            {visible.map((job) => (
              <Link href={`/jobs/${job.id}`} className="mobile-job-card" key={job.id}>
                <div>
                  <strong>{job.title}</strong>
                  <span>{job.company}</span>
                </div>
                <StatusBadge status={job.status} />
                <dl>
                  <div>
                    <dt>Location</dt>
                    <dd>{job.location}</dd>
                  </div>
                  <div>
                    <dt>Setup</dt>
                    <dd>{job.workSetup.replace(/_/g, ' ')}</dd>
                  </div>
                  <div>
                    <dt>Score</dt>
                    <dd>{job.score ?? 'Not evaluated'}</dd>
                  </div>
                </dl>
              </Link>
            ))}
          </div>
        </>
      )}

      {visible.length < filtered.length && (
        <div className="load-more">
          <button
            type="button"
            className="button button-secondary"
            onClick={() => setLimit((current) => current + PAGE_SIZE)}
          >
            Show more
          </button>
        </div>
      )}
    </section>
  );
}
