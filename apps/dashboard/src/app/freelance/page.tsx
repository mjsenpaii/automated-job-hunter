import { createFreelanceRepository } from '@job-app/ingestion/freelance/repository';
import { getDatabase } from '@/lib/db';
import { FreelanceScanControl } from '@/components/FreelanceScanControl';
import { FreelanceWorkspace, type FreelanceCardOpportunity } from '@/components/FreelanceWorkspace';
import { MetricCard } from '@/components/MetricCard';
import { PageHeader } from '@/components/PageHeader';

export const dynamic = 'force-dynamic';

export default async function FreelanceJobsPage() {
  const database = getDatabase();
  const opportunities = await createFreelanceRepository(database).list();
  const cards: FreelanceCardOpportunity[] = opportunities.map(({ publicDescription: _description, ...opportunity }) => opportunity);
  const readyNow = opportunities.filter((item) => item.readiness.classification === 'READY_NOW').length;
  const learnable = opportunities.filter((item) => item.readiness.classification === 'LEARNABLE_FAST_WITH_AI').length;
  const aboveMinimum = opportunities.filter((item) => item.pay.classification === 'ABOVE_MINIMUM').length;
  const shortlisted = opportunities.filter((item) => item.status === 'SHORTLISTED').length;

  return <>
    <PageHeader eyebrow="Earn now" title="Freelance Jobs" description="Legitimate short-term work ranked by verified readiness, truthful learning potential, pay clarity, and risk." action={<FreelanceScanControl />} />
    <section className="metrics-grid" aria-label="Freelance opportunity summary">
      <MetricCard label="Ready now" value={readyNow} detail="Core task supported by verified skills" icon="check" tone="success" />
      <MetricCard label="Learnable fast with AI" value={learnable} detail="Narrow adjacent gaps; preparation required" icon="spark" tone="info" />
      <MetricCard label="Confirmed over $3/hour" value={aboveMinimum} detail="Strictly greater than USD 3.00" icon="freelance" tone="warning" />
      <MetricCard label="Shortlisted" value={shortlisted} detail="Local manual-review status only" icon="briefcase" />
    </section>
    <section className="freelance-source-overview" aria-labelledby="freelance-source-overview-title"><div><p className="eyebrow">Source availability</p><h2 id="freelance-source-overview-title">Worker-controlled discovery</h2><p>Exact worker switches decide which sources run. Source-specific status appears after each scan.</p></div><div className="freelance-integration-grid"><article><strong>Himalayas</strong><span>FREE — NO API KEY</span></article><article><strong>Remotive</strong><span>FREE PUBLIC API — NO API KEY</span></article><article><strong>Tavily</strong><span>API CREDITS</span></article><article><strong>Gemini Search</strong><span>OPTIONAL · API QUOTA</span></article><article><strong>Upwork API</strong><span>APPROVAL PENDING</span></article><article><strong>Freelancer.com API</strong><span>ACCESS PENDING</span></article></div></section>
    <FreelanceWorkspace opportunities={cards} />
  </>;
}
