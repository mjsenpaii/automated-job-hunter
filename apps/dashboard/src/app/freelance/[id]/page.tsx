import { notFound } from 'next/navigation';
import { createFreelanceRepository } from '@job-app/ingestion/freelance/repository';
import { getDatabase } from '@/lib/db';
import { FreelanceOpportunityActions } from '@/components/FreelanceOpportunityActions';
import { PageHeader } from '@/components/PageHeader';

export const dynamic = 'force-dynamic';

function valueOrUnknown(value: string | null) { return value ?? 'Not stated'; }

export default async function FreelanceOpportunityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const opportunity = await createFreelanceRepository(getDatabase()).findById(id);
  if (!opportunity) notFound();
  const learning = opportunity.readiness.learningTimeUncertain
    ? 'Learning time uncertain — review the full scope first.'
    : opportunity.readiness.learningHoursMinimum !== null
      ? `${opportunity.readiness.learningHoursMinimum}–${opportunity.readiness.learningHoursMaximum} focused hours`
      : 'No preparation estimate needed';
  return <>
    <PageHeader eyebrow="Freelance opportunity" title={opportunity.title} description={`${opportunity.clientOrCompany} · ${opportunity.sourceAttributions.map((item) => item.source.replaceAll('_', ' ')).join(' + ')}`} />
    <div className="freelance-detail-grid">
      <main className="freelance-detail-main">
        <section className="freelance-detail-section"><p className="eyebrow">Readiness</p><h2>{opportunity.readiness.classification === 'LEARNABLE_FAST_WITH_AI' ? 'LEARNABLE FAST WITH AI' : opportunity.readiness.classification.replaceAll('_', ' ')}</h2><dl className="freelance-detail-list"><div><dt>Transferable skills</dt><dd>{opportunity.readiness.transferableSkills.join(', ') || 'None verified for this scope'}</dd></div><div><dt>Exact gaps</dt><dd>{opportunity.readiness.missingSkills.join(', ') || 'No core gap identified'}</dd></div><div><dt>Learning assessment</dt><dd>{learning}</dd></div><div><dt>Why the gap is narrow</dt><dd>{opportunity.readiness.narrowGapReasons.map((reason) => reason.replaceAll('_', ' ')).join(', ') || 'No bounded learning case established'}</dd></div><div><dt>Confidence</dt><dd>{opportunity.readiness.confidence}</dd></div><div><dt>Recommended action</dt><dd>{opportunity.readiness.recommendedAction.replaceAll('_', ' ')}</dd></div></dl>{opportunity.readiness.suggestedSampleProject && <div className="freelance-sample"><strong>Suggested sample project</strong><p>{opportunity.readiness.suggestedSampleProject}</p></div>}<h3>Practice before applying</h3>{opportunity.readiness.practiceBeforeApplying.length > 0 ? <ul>{opportunity.readiness.practiceBeforeApplying.map((item) => <li key={item}>{item}</li>)}</ul> : <p>No preparation plan is available for this opportunity.</p>}<h3>Delivery risks</h3>{opportunity.readiness.deliveryRisks.length > 0 ? <ul>{opportunity.readiness.deliveryRisks.map((item) => <li key={item}>{item}</li>)}</ul> : <p>No configured delivery risk was identified. Review the full scope manually.</p>}</section>
        <section className="freelance-detail-section"><p className="eyebrow">Requirements</p><h2>Skills and experience</h2><dl className="freelance-detail-list"><div><dt>Categories</dt><dd>{opportunity.opportunityCategories.map((item) => item.replaceAll('_', ' ')).join(', ') || 'No curated category assigned'}</dd></div><div><dt>Required skills</dt><dd>{opportunity.requiredSkills.join(', ') || 'No explicit supported requirement extracted'}</dd></div><div><dt>Preferred skills</dt><dd>{opportunity.preferredSkills.join(', ') || 'No explicit preferred skills stated'}</dd></div><div><dt>Minimum experience</dt><dd>{opportunity.minimumExperienceYears === null ? 'Not explicitly stated' : `${opportunity.minimumExperienceYears} years`}</dd></div><div><dt>Contract</dt><dd>{opportunity.contractType.replaceAll('_', ' ')}</dd></div></dl></section>
        <section className="freelance-detail-section"><p className="eyebrow">Public listing</p><h2>Normalized opportunity description</h2><div className="freelance-description">{opportunity.publicDescription}</div></section>
      </main>
      <aside className="freelance-detail-aside">
        <section><p className="eyebrow">Pay</p><h2>{opportunity.pay.classification.replaceAll('_', ' ')}</h2><dl><div><dt>Currency</dt><dd>{valueOrUnknown(opportunity.pay.originalCurrency)}</dd></div><div><dt>Minimum</dt><dd>{opportunity.pay.minimum ?? 'Not stated'}</dd></div><div><dt>Maximum</dt><dd>{opportunity.pay.maximum ?? 'Not stated'}</dd></div><div><dt>Period</dt><dd>{valueOrUnknown(opportunity.pay.period)}</dd></div><div><dt>Effective hourly</dt><dd>{opportunity.pay.estimatedEffectiveHourlyRate ?? 'Unavailable — no guessed hours'}</dd></div></dl></section>
        <section><p className="eyebrow">Eligibility</p><h2>Location and work setup</h2><dl><div><dt>Views</dt><dd>{opportunity.views.map((item) => item.replaceAll('_', ' ')).join(', ') || 'Requires location review'}</dd></div><div><dt>Remote</dt><dd>{opportunity.remote === null ? 'Unclear' : opportunity.remote ? 'Yes' : 'No'}</dd></div><div><dt>Restrictions</dt><dd>{opportunity.applicantGeographicRestrictions.join(', ') || 'No explicit country restriction found'}</dd></div><div><dt>Timezone</dt><dd>{opportunity.timezoneRestrictions.join(', ') || 'Not stated'}</dd></div></dl></section>
        <section><p className="eyebrow">Risk review</p><h2>{opportunity.risk.level}</h2><p>Ethics and compliance: <strong>{opportunity.ethicsComplianceStatus.replaceAll('_', ' ')}</strong></p>{opportunity.risk.reasons.length > 0 ? <><p>Potential risk indicators detected.</p><ul>{opportunity.risk.reasons.map((reason) => <li key={reason}>{reason.replaceAll('_', ' ')}</li>)}</ul></> : <p>No configured risk indicator was detected. Manual due diligence is still required.</p>}</section>
        <section><p className="eyebrow">Manual review</p><h2>Notes and application status</h2><dl><div><dt>Status</dt><dd>{opportunity.status.replaceAll('_', ' ')}</dd></div><div><dt>Local note</dt><dd>{opportunity.manualNote ?? 'No manual note recorded'}</dd></div><div><dt>Preparation</dt><dd>{opportunity.preparation.state.replaceAll('_', ' ')}</dd></div></dl></section>
        <section><p className="eyebrow">Source attribution</p><h2>Original links</h2><ul>{opportunity.sourceAttributions.map((source) => <li key={`${source.source}-${source.sourceIdentifier}`}><a href={source.sourceUrl} target="_blank" rel="noopener noreferrer">{source.source.replaceAll('_', ' ')} — open listing</a></li>)}</ul></section>
      </aside>
    </div>
    <FreelanceOpportunityActions opportunity={opportunity} />
  </>;
}
