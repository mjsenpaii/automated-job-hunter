'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AddJobPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setResult(null);

    const formData = new FormData(e.currentTarget);
    const data = {
      title: formData.get('title'),
      company: formData.get('company'),
      description: formData.get('description'),
      url: formData.get('url'),
      country: formData.get('country'),
      city: formData.get('city'),
      work_setup: formData.get('work_setup'),
      skills: formData.get('skills'),
    };

    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (res.ok) {
        const json = await res.json();
        // Fetch the newly created job to show results
        const jobRes = await fetch(`/api/jobs/${json.jobId}`);
        if (jobRes.ok) {
          const jobData = await jobRes.json();
          setResult(jobData);
        }
      }
    } catch (error) {
      console.error('Failed to add job', error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <header className="mb-8">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">
          Add Manual Job
        </h1>
        <p className="text-gray-400 mt-2">Paste job details to run it through the classification and scoring pipeline.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="glass-card p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Job Title *</label>
              <input name="title" required className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500 transition-colors" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Company *</label>
              <input name="company" required className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500 transition-colors" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">URL</label>
              <input name="url" type="url" className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500 transition-colors" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Description *</label>
              <textarea name="description" required rows={6} className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500 transition-colors"></textarea>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Country</label>
                <input name="country" className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500 transition-colors" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">City</label>
                <input name="city" className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500 transition-colors" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Work Setup</label>
              <select name="work_setup" className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500 transition-colors">
                <option value="UNCLEAR">Unclear / Let AI decide</option>
                <option value="REMOTE">Remote</option>
                <option value="HYBRID">Hybrid</option>
                <option value="ONSITE">Onsite</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Skills (comma separated)</label>
              <input name="skills" placeholder="React, Node.js, TypeScript" className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500 transition-colors" />
            </div>

            <button 
              type="submit" 
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Processing Pipeline...' : 'Run Analysis & Add Job'}
            </button>
          </form>
        </div>

        <div>
          {result ? (
            <div className="glass-card p-6 space-y-6 animate-slide-up sticky top-6">
              <div>
                <h3 className="text-xl font-bold text-white mb-1">{result.job.title}</h3>
                <p className="text-gray-400">{result.job.company}</p>
              </div>

              <div className="flex items-center justify-between p-4 bg-slate-800/50 rounded-lg border border-slate-700/50">
                <div>
                  <p className="text-sm text-gray-400 mb-1">AI Match Score</p>
                  <div className="text-3xl font-bold text-blue-400">{result.score.score}/100</div>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-400 mb-1">Recommendation</p>
                  <div className={`px-3 py-1 rounded-full text-xs font-medium border inline-block ${
                    result.score.recommendation === 'APPLY' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 
                    result.score.recommendation === 'REVIEW' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 
                    'bg-red-500/10 text-red-400 border-red-500/20'
                  }`}>
                    {result.score.recommendation}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-slate-800/30 rounded-lg border border-slate-700/50">
                  <span className="block text-xs text-gray-500 mb-1">Category</span>
                  <span className="text-sm font-medium text-white">{result.job.category}</span>
                </div>
                <div className="p-3 bg-slate-800/30 rounded-lg border border-slate-700/50">
                  <span className="block text-xs text-gray-500 mb-1">Work Setup</span>
                  <span className="text-sm font-medium text-white">{result.job.work_setup}</span>
                </div>
              </div>

              {result.score.matched_skills && JSON.parse(result.score.matched_skills).length > 0 && (
                <div>
                  <p className="text-sm font-medium text-emerald-400 mb-2 flex items-center">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 mr-2"></span>
                    Matched Skills
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {JSON.parse(result.score.matched_skills).map((skill: string) => (
                      <span key={skill} className="px-2 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs rounded-md">
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {result.score.missing_skills && JSON.parse(result.score.missing_skills).length > 0 && (
                <div>
                  <p className="text-sm font-medium text-amber-400 mb-2 flex items-center">
                    <span className="w-2 h-2 rounded-full bg-amber-400 mr-2"></span>
                    Missing Skills
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {JSON.parse(result.score.missing_skills).map((skill: string) => (
                      <span key={skill} className="px-2 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs rounded-md">
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="glass-card p-6 h-full flex items-center justify-center border-dashed border-2 border-slate-700/50">
              <div className="text-center text-gray-500">
                <div className="w-16 h-16 mx-auto mb-4 opacity-50">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                </div>
                <p>Submit a job to see the AI analysis results here.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
