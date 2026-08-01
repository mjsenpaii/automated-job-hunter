'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type {
  FreelanceOpportunity,
  FreelanceView,
} from '@job-app/ingestion/freelance/contracts';
import { AppIcon } from './icons';

export type FreelanceCardOpportunity = Omit<FreelanceOpportunity, 'publicDescription'>;

function readinessLabel(value: FreelanceOpportunity['readiness']['classification']): string {
  if (value === 'READY_NOW') return 'READY NOW';
  if (value === 'LEARNABLE_FAST_WITH_AI') return 'LEARNABLE FAST WITH AI';
  return 'NOT READY';
}

function payLabel(opportunity: FreelanceCardOpportunity): string {
  const pay = opportunity.pay;
  if (pay.kind === 'UNKNOWN') return 'Pay not stated';
  const amount = pay.minimum === null
    ? 'Amount not stated'
    : `${pay.originalCurrency ?? 'Currency unclear'} ${pay.minimum.toLocaleString()}${pay.maximum !== null && pay.maximum !== pay.minimum ? `–${pay.maximum.toLocaleString()}` : ''}`;
  return pay.kind === 'FIXED_PRICE'
    ? `${amount} fixed price`
    : `${amount} / hour`;
}

function postedLabel(value: string | null): string {
  if (!value) return 'Posted date unavailable';
  return new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium' }).format(new Date(value));
}

export function FreelanceWorkspace({ opportunities }: { opportunities: FreelanceCardOpportunity[] }) {
  const [view, setView] = useState<FreelanceView>('PHILIPPINES');
  const [payFilter, setPayFilter] = useState<'PRIORITY' | 'STATED' | 'FIXED' | 'UNKNOWN'>('PRIORITY');
  const [includeBelow, setIncludeBelow] = useState(false);
  const [readiness, setReadiness] = useState<'ALL' | 'READY_NOW' | 'LEARNABLE_FAST_WITH_AI'>('ALL');
  const [category, setCategory] = useState<'ALL' | FreelanceCardOpportunity['opportunityCategories'][number]>('ALL');
  const filtered = useMemo(() => opportunities.filter((item) => {
    if (!item.views.includes(view)) return false;
    if (!includeBelow && item.pay.classification === 'BELOW_MINIMUM') return false;
    if (readiness !== 'ALL' && item.readiness.classification !== readiness) return false;
    if (category !== 'ALL' && !item.opportunityCategories.includes(category)) return false;
    if (payFilter === 'STATED' && item.pay.minimum === null) return false;
    if (payFilter === 'FIXED' && item.pay.kind !== 'FIXED_PRICE') return false;
    if (payFilter === 'UNKNOWN' && !['UNKNOWN', 'NON_USD_UNCONVERTED'].includes(item.pay.classification)) return false;
    return true;
  }), [opportunities, view, payFilter, includeBelow, readiness, category]);

  return <section className="freelance-workspace" aria-labelledby="freelance-opportunity-list-title">
    <div className="freelance-view-tabs" role="tablist" aria-label="Freelance opportunity view">
      {([
        ['PHILIPPINES', 'Philippines'],
        ['INTERNATIONAL_CLIENTS', 'International Clients'],
        ['WORLDWIDE_REMOTE', 'Worldwide Remote'],
      ] as const).map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={view === value} className={view === value ? 'active' : ''} onClick={() => setView(value)}>{label}</button>)}
    </div>
    <div className="freelance-filters">
      <label>Pay filter<select value={payFilter} onChange={(event) => setPayFilter(event.target.value as typeof payFilter)}><option value="PRIORITY">Prioritize confirmed over $3/hour</option><option value="STATED">Rate stated</option><option value="FIXED">Fixed price</option><option value="UNKNOWN">Rate unknown</option></select></label>
      <label>Readiness<select value={readiness} onChange={(event) => setReadiness(event.target.value as typeof readiness)}><option value="ALL">All readiness levels</option><option value="READY_NOW">Ready now</option><option value="LEARNABLE_FAST_WITH_AI">Learnable fast with AI</option></select></label>
      <label>Category<select value={category} onChange={(event) => setCategory(event.target.value as typeof category)}><option value="ALL">All freelance categories</option><option value="TECHNICAL_QUICK_WINS">Technical Quick Wins</option><option value="AI_AUTOMATION">AI and Automation</option><option value="TECHNICAL_VIRTUAL_ASSISTANCE">Technical Virtual Assistance</option><option value="GENERAL_LEARNABLE_WORK">General Learnable Work</option></select></label>
      <label className="freelance-checkbox"><input type="checkbox" checked={includeBelow} onChange={(event) => setIncludeBelow(event.target.checked)} />Include confirmed below minimum</label>
    </div>
    <div className="freelance-list-heading"><div><h2 id="freelance-opportunity-list-title">Saved opportunities</h2><p>{filtered.length} persisted {filtered.length === 1 ? 'opportunity' : 'opportunities'} in this view</p></div><p>These are local saved records, not results from the latest temporary Preview. One opportunity can appear in multiple views without being saved twice.</p></div>
    {filtered.length === 0 ? <div className="empty-state"><span className="empty-icon"><AppIcon name="search" /></span><h2>No freelance opportunities in this view yet</h2><p>Run a Preview scan or import one public freelance URL. Unknown-pay work remains visible; confirmed below-minimum work is hidden by default.</p></div> : <div className="freelance-card-grid">{filtered.map((item) => <article className="freelance-card" key={item.id}>
      <div className="freelance-card-top"><div><p className="freelance-source-line">{item.sourceAttributions.map((source) => source.source === 'HIMALAYAS' ? 'Himalayas' : source.source === 'REMOTIVE' ? 'Remotive' : source.source === 'GEMINI_SEARCH' ? 'Gemini Search lead' : source.source === 'TAVILY' ? 'Tavily lead' : 'Manual import').join(' · ')}</p><h3>{item.title}</h3><p>{item.clientOrCompany}</p></div><span className={`freelance-readiness freelance-readiness-${item.readiness.classification.toLocaleLowerCase()}`}>{readinessLabel(item.readiness.classification)}</span></div>
      <div className="freelance-badges">{item.opportunityCategories.map((badge) => <span key={badge}>{badge.replaceAll('_', ' ')}</span>)}{item.views.map((badge) => <span key={badge}>{badge.replaceAll('_', ' ')}</span>)}<span>{item.contractType.replaceAll('_', ' ')}</span>{item.remote === true && <span>REMOTE</span>}</div>
      <div className="freelance-pay"><strong>{payLabel(item)}</strong><span>{item.pay.classification.replaceAll('_', ' ')}</span></div>
      <dl className="freelance-card-details"><div><dt>Posted</dt><dd>{postedLabel(item.publishedAt)}</dd></div><div><dt>Risk</dt><dd>{item.risk.level}</dd></div><div><dt>Status</dt><dd>{item.status.replaceAll('_', ' ')}</dd></div><div><dt>Rank</dt><dd>{item.rankingScore}</dd></div></dl>
      {item.readiness.transferableSkills.length > 0 && <div className="freelance-skill-line"><span>Matched</span><p>{item.readiness.transferableSkills.slice(0, 4).join(' · ')}</p></div>}
      {item.readiness.missingSkills.length > 0 && <div className="freelance-skill-line"><span>Skill gaps</span><p>{item.readiness.missingSkills.slice(0, 4).join(' · ')}</p></div>}
      {item.readiness.classification === 'LEARNABLE_FAST_WITH_AI' && <div className="freelance-learning"><strong>{item.readiness.learningTimeUncertain ? 'Learning time uncertain — review the full scope first.' : `${item.readiness.learningHoursMinimum}–${item.readiness.learningHoursMaximum} focused learning hours`}</strong><p>{item.readiness.suggestedSampleProject}</p><span>Preparation: {item.preparation.state.replaceAll('_', ' ')}</span></div>}
      {item.risk.reasons.length > 0 && <div className="freelance-risk"><AppIcon name="warning" size={17} /><span>Potential risk indicators detected: {item.risk.reasons.slice(0, 2).map((reason) => reason.replaceAll('_', ' ').toLocaleLowerCase()).join(' · ')}.</span></div>}
      <div className="freelance-card-actions"><Link className="button button-secondary" href={`/freelance/${item.id}`}>View details</Link><a className="button button-secondary" href={item.canonicalUrl} target="_blank" rel="noopener noreferrer">Open original listing</a></div>
    </article>)}</div>}
  </section>;
}
