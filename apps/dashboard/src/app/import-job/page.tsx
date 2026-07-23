'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { ExtractedJobData, ExtractionResult } from '@job-app/ingestion';

type Step = 'input' | 'preview' | 'result';

export default function ImportJobPage() {
  const [step, setStep] = useState<Step>('input');
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [extractedData, setExtractedData] = useState<ExtractedJobData | null>(null);
  const [formData, setFormData] = useState<Partial<ExtractedJobData>>({});
  
  const [result, setResult] = useState<any>(null);

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setUrl(text);
    } catch (err) {
      console.error('Failed to read clipboard contents: ', err);
    }
  };

  const handleExtract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      
      const data: ExtractionResult = await res.json();
      
      if (!res.ok || !data.success) {
        setError(data.error || 'Failed to extract job data.');
      } else if (data.data) {
        setExtractedData(data.data);
        setFormData(data.data);
        setStep('preview');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred during extraction.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    const submitData = {
      title: formData.title || '',
      company: formData.company || '',
      description: formData.description || '',
      url: extractedData?.source_url || url,
      country: formData.country || '',
      city: formData.city || '',
      work_setup: formData.work_setup || 'UNCLEAR',
      skills: [...(formData.required_skills || []), ...(formData.preferred_skills || [])].join(', '),
    };

    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submitData),
      });

      if (res.ok) {
        const json = await res.json();
        const jobRes = await fetch(`/api/jobs/${json.jobId}`);
        if (jobRes.ok) {
          const jobData = await jobRes.json();
          setResult(jobData);
          setStep('result');
        }
      }
    } catch (error) {
      console.error('Failed to add job', error);
      setError('Failed to save and score job.');
    } finally {
      setLoading(false);
    }
  };

  const getConfidenceBadge = (field: string) => {
    if (!extractedData || !extractedData.confidence) return null;
    const conf = extractedData.confidence[field];
    
    if (conf === 'high') return <span title="High confidence (from JSON-LD)" className="ml-2 w-3 h-3 rounded-full bg-emerald-500 inline-block"></span>;
    if (conf === 'medium') return <span title="Medium confidence (from meta tags)" className="ml-2 w-3 h-3 rounded-full bg-amber-500 inline-block"></span>;
    if (conf === 'low' || conf === 'inferred') return <span title="Low confidence / Inferred" className="ml-2 w-3 h-3 rounded-full bg-red-500 inline-block"></span>;
    return <span title="Not found" className="ml-2 w-3 h-3 rounded-full bg-slate-500 inline-block"></span>;
  };

  return (
    <div className="space-y-8 animate-fade-in max-w-4xl mx-auto">
      <header className="mb-8">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">
          Import Job from URL
        </h1>
        <p className="text-gray-400 mt-2">Automatically extract job details from a public posting URL.</p>
      </header>

      {step === 'input' && (
        <div className="glass-card p-8 text-center animate-slide-up">
          <form onSubmit={handleExtract} className="max-w-2xl mx-auto space-y-6">
            <div>
              <div className="relative">
                <input 
                  type="url" 
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://company.com/careers/job-123"
                  className="w-full bg-slate-800/50 border border-slate-700 rounded-lg pl-4 pr-24 py-4 text-white focus:outline-none focus:border-blue-500 transition-colors text-lg"
                  required
                />
                <button 
                  type="button"
                  onClick={handlePaste}
                  className="absolute right-2 top-2 bottom-2 bg-slate-700 hover:bg-slate-600 px-4 rounded text-sm font-medium transition-colors"
                >
                  Paste
                </button>
              </div>
            </div>
            
            {error && (
              <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg text-left">
                <p className="font-medium flex items-center">
                  <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  Extraction Failed
                </p>
                <p className="mt-1 text-sm">{error}</p>
              </div>
            )}

            <button 
              type="submit" 
              disabled={loading || !url}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-3 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center text-lg"
            >
              {loading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Extracting...
                </>
              ) : 'Extract Job Data'}
            </button>
            
            <div className="pt-4 border-t border-slate-700/50">
              <Link href="/add-job" className="text-gray-400 hover:text-white transition-colors">
                Or paste job description manually →
              </Link>
            </div>
          </form>
        </div>
      )}

      {step === 'preview' && extractedData && (
        <div className="glass-card p-6 animate-slide-up">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-xl font-bold text-white">Review Extracted Data</h2>
              <p className="text-sm text-gray-400 mt-1">
                Source: <a href={extractedData.source_url} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">{extractedData.source_url}</a>
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Method: <span className="uppercase tracking-wider">{extractedData.extraction_method}</span>
              </p>
            </div>
            <div className="flex gap-4 text-xs text-gray-400">
              <span className="flex items-center"><span className="w-2 h-2 rounded-full bg-emerald-500 mr-1"></span> High Confidence</span>
              <span className="flex items-center"><span className="w-2 h-2 rounded-full bg-amber-500 mr-1"></span> Medium</span>
              <span className="flex items-center"><span className="w-2 h-2 rounded-full bg-red-500 mr-1"></span> Low/Inferred</span>
              <span className="flex items-center"><span className="w-2 h-2 rounded-full bg-slate-500 mr-1"></span> Not found</span>
            </div>
          </div>
          
          <form onSubmit={handleConfirm} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Job Title * {getConfidenceBadge('title')}
                </label>
                <input 
                  value={formData.title || ''} 
                  onChange={(e) => setFormData({...formData, title: e.target.value})}
                  required 
                  className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white focus:border-blue-500" 
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Company * {getConfidenceBadge('company')}
                </label>
                <input 
                  value={formData.company || ''} 
                  onChange={(e) => setFormData({...formData, company: e.target.value})}
                  required 
                  className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white focus:border-blue-500" 
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Description * {getConfidenceBadge('description')}
              </label>
              <textarea 
                value={formData.description || ''} 
                onChange={(e) => setFormData({...formData, description: e.target.value})}
                required 
                rows={8} 
                className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white focus:border-blue-500"
              />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Country {getConfidenceBadge('country')}
                </label>
                <input 
                  value={formData.country || ''} 
                  onChange={(e) => setFormData({...formData, country: e.target.value})}
                  className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white" 
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  City {getConfidenceBadge('city')}
                </label>
                <input 
                  value={formData.city || ''} 
                  onChange={(e) => setFormData({...formData, city: e.target.value})}
                  className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white" 
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Work Setup {getConfidenceBadge('work_setup')}
                </label>
                <select 
                  value={formData.work_setup || 'UNCLEAR'} 
                  onChange={(e) => setFormData({...formData, work_setup: e.target.value})}
                  className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white"
                >
                  <option value="UNCLEAR">Unclear</option>
                  <option value="REMOTE">Remote</option>
                  <option value="HYBRID">Hybrid</option>
                  <option value="ONSITE">Onsite</option>
                </select>
              </div>
            </div>

            <div className="flex gap-4 pt-4 border-t border-slate-700/50">
              <button 
                type="button" 
                onClick={() => {
                  setStep('input');
                  setExtractedData(null);
                  setFormData({});
                }}
                disabled={loading}
                className="px-6 py-2 rounded-lg border border-slate-600 text-gray-300 hover:bg-slate-800 transition-colors"
              >
                Reset
              </button>
              <button 
                type="submit" 
                disabled={loading}
                className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-medium py-2 rounded-lg transition-colors flex items-center justify-center"
              >
                {loading ? 'Processing...' : 'Confirm & Score'}
              </button>
            </div>
          </form>
        </div>
      )}

      {step === 'result' && result && (
        <div className="glass-card p-8 animate-slide-up space-y-8">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-white mb-2">Analysis Complete</h2>
            <p className="text-gray-400">Job successfully imported and scored</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <h3 className="text-xl font-bold text-white mb-1">{result.job.title}</h3>
              <p className="text-gray-400 mb-6">{result.job.company}</p>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-slate-800/30 rounded-lg border border-slate-700/50">
                  <span className="block text-sm text-gray-500 mb-1">Category</span>
                  <span className="font-medium text-white">{result.job.category}</span>
                </div>
                <div className="p-4 bg-slate-800/30 rounded-lg border border-slate-700/50">
                  <span className="block text-sm text-gray-500 mb-1">Work Setup</span>
                  <span className="font-medium text-white">{result.job.work_setup}</span>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="flex items-center justify-between p-6 bg-slate-800/50 rounded-xl border border-slate-700/50">
                <div>
                  <p className="text-sm text-gray-400 mb-1">AI Match Score</p>
                  <div className="text-4xl font-bold text-blue-400">{result.score.score}/100</div>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-400 mb-2">Recommendation</p>
                  <div className={`px-4 py-2 rounded-full text-sm font-bold border inline-block ${
                    result.score.recommendation === 'APPLY' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 
                    result.score.recommendation === 'REVIEW' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 
                    'bg-red-500/10 text-red-400 border-red-500/20'
                  }`}>
                    {result.score.recommendation}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-center gap-4 pt-6 border-t border-slate-700/50">
            <button 
              onClick={() => {
                setUrl('');
                setExtractedData(null);
                setFormData({});
                setResult(null);
                setStep('input');
              }}
              className="px-6 py-3 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-medium transition-colors"
            >
              Import Another
            </button>
            <Link 
              href="/"
              className="px-6 py-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors"
            >
              Back to Dashboard
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
